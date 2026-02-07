import { useMemo, useRef } from 'react';
import { quantizeCell } from '../lib/geospatial';

export type Detection = {
  bbox: [number, number, number, number]; // [x, y, w, h] in pixels
  confidence: number;
  class: string;
};

export type PotholeReport = {
  id: string;
  lat: number;
  lon: number;
  ts: number; // epoch ms
};

type Options = {
  // Center-gate: only count detections whose bbox center lies within this fraction window
  // of the frame (e.g., 0.35..0.65 means central 30%).
  centerGateMin?: number; // default 0.35
  centerGateMax?: number; // default 0.65
  centerGateEnabled?: boolean; // default true
  // Spatial cell size for dedup in meters
  cellMeters?: number; // default 12
  // TTL windows
  shortTTLms?: number; // avoid re-counting same place immediately (default 30s)
  sessionTTLms?: number; // avoid re-counting across session (default 15m)
  // TESTING: Bypass all filters to see raw detections
  bypassFilters?: boolean; // default false
};

// Very simple dedup strategy for mobile:
// - Only count when detection passes a center-gate to avoid multiple frames
// - Dedup by quantized cell id with a short TTL and a longer session TTL
export function usePotholeSession(opts: Options = {}) {
  const centerGateMin = opts.centerGateMin ?? 0.35;
  const centerGateMax = opts.centerGateMax ?? 0.65;
  const centerGateEnabled = opts.centerGateEnabled ?? true;
  const cellMeters = opts.cellMeters ?? 12;
  const shortTTLms = opts.shortTTLms ?? 30_000;
  const sessionTTLms = opts.sessionTTLms ?? 15 * 60_000;
  const bypassFilters = opts.bypassFilters ?? false; // TESTING MODE

  // Cache of recently counted cells (short term and session term)
  const shortCacheRef = useRef(new Map<string, number>()); // key -> ts
  const sessionCacheRef = useRef(new Map<string, number>()); // key -> ts
  const reportsRef = useRef<PotholeReport[]>([]);

  const pruneCaches = (now: number) => {
    const shortCache = shortCacheRef.current;
    const sessionCache = sessionCacheRef.current;
    for (const [k, t] of shortCache) if (now - t > shortTTLms) shortCache.delete(k);
    for (const [k, t] of sessionCache) if (now - t > sessionTTLms) sessionCache.delete(k);
    // Bound memory
    if (shortCache.size > 1000) {
      shortCacheRef.current = new Map([...shortCache.entries()].slice(-500));
    }
    if (sessionCache.size > 5000) {
      sessionCacheRef.current = new Map([...sessionCache.entries()].slice(-2500));
    }
  };

  const isCenterGated = (bbox: Detection['bbox'], w: number, h: number) => {
    const [x, y, bw, bh] = bbox;
    const cx = x + bw / 2;
    const cy = y + bh / 2;
    const nx = cx / w;
    const ny = cy / h;
    return nx >= centerGateMin && nx <= centerGateMax && ny >= centerGateMin && ny <= centerGateMax;
  };

  const registerDetections = (
    detections: Detection[],
    frameSize: { width: number; height: number },
    userPos: { lat: number; lon: number },
    userSpeed?: number // m/s - for adaptive cache TTL
  ): PotholeReport[] => {
    console.log('[Session] 🔍 registerDetections called with', detections.length, 'detections');
    console.log('[Session] 📍 User position:', userPos);
    console.log('[Session] 🏃 User speed:', userSpeed);
    const now = Date.now();
    pruneCaches(now);
    const out: PotholeReport[] = [];
    const { width, height } = frameSize;
    const countedCells = new Set<string>(); // Track what we count in THIS frame

    // IMPROVEMENT 2: Speed-adaptive cache TTL
    // Fast speed (>10 m/s = 36 km/h) → shorter TTL (count more often)
    // Slow speed (<1 m/s = walking) → longer TTL (avoid drift duplicates)
    const speed = userSpeed ?? 0;
    let effectiveShortTTL = shortTTLms;
    let effectiveSessionTTL = sessionTTLms;
    
    if (speed > 10) {
      // Highway speed: reduce short TTL to 20s (count more frequently)
      effectiveShortTTL = Math.max(20_000, shortTTLms * 0.67);
    } else if (speed < 1) {
      // Stationary/walking: increase short TTL to 60s (avoid drift)
      effectiveShortTTL = Math.max(shortTTLms, 60_000);
    }

    for (let i = 0; i < detections.length; i++) {
      const det = detections[i];
      console.log(`[Session] 🔍 Processing detection ${i + 1}/${detections.length}:`, det);
      
      // TESTING MODE: Skip all filters if bypassFilters is true
      if (bypassFilters) {
        console.log('[Session] 🚨 BYPASS MODE: Skipping all filters, counting every detection');
        const [x, y, bw, bh] = det.bbox;
        const cx = (x + bw / 2) / width - 0.5;
        const cy = (y + bh / 2) / height - 0.5;
        const offsetLat = cy * 0.00003;
        const offsetLon = cx * 0.00003 / Math.cos(userPos.lat * Math.PI / 180);
        const detLat = userPos.lat + offsetLat;
        const detLon = userPos.lon + offsetLon;
        const key = `bypass_${detLat.toFixed(6)}_${detLon.toFixed(6)}_${now}`;
        
        const rep: PotholeReport = {
          id: key,
          lat: detLat,
          lon: detLon,
          ts: now,
        };
        reportsRef.current.push(rep);
        out.push(rep);
        console.log(`[Session] ✅ COUNTED (BYPASS): conf=${(det.confidence * 100).toFixed(1)}%`);
        continue;
      }
      
      const isGated = !centerGateEnabled || isCenterGated(det.bbox, width, height);
      console.log(`[Session] 🎯 Center gate ${centerGateEnabled ? 'enabled' : 'disabled'} → pass=${isGated} (bbox: [${det.bbox.join(', ')}])`);
      if (!isGated) {
        console.log('[Session] ❌ SKIPPED: Detection outside center gate window');
        continue;
      }
      
      // Calculate position based on detection bbox center offset from frame center
      // This gives us better spatial accuracy for multiple potholes in view
      const [x, y, bw, bh] = det.bbox;
      const cx = (x + bw / 2) / width - 0.5;  // -0.5 to 0.5
      const cy = (y + bh / 2) / height - 0.5;
      
      // Rough offset in meters (assuming ~60° FOV, ~3m distance)
      const offsetLat = cy * 0.00003; // ~3m per full frame height
      const offsetLon = cx * 0.00003 / Math.cos(userPos.lat * Math.PI / 180);
      
      const detLat = userPos.lat + offsetLat;
      const detLon = userPos.lon + offsetLon;
      const key = quantizeCell(detLat, detLon, cellMeters);
      
      console.log(`[Session] 📍 Detection position: lat=${detLat.toFixed(6)}, lon=${detLon.toFixed(6)}, cell=${key}`);
      
      // Skip if already counted in THIS frame
      if (countedCells.has(key)) {
        console.log('[Session] ❌ SKIPPED: Already counted in this frame');
        continue;
      }
      
      // Check caches with adaptive TTL
      const lastShort = shortCacheRef.current.get(key);
      const lastSess = sessionCacheRef.current.get(key);
      const inShort = lastShort !== undefined && now - lastShort <= effectiveShortTTL;
      const inSess = lastSess !== undefined && now - lastSess <= effectiveSessionTTL;
      if (inShort || inSess) {
        console.log(`[Session] ❌ SKIPPED: Already in cache (short: ${inShort}, session: ${inSess})`);
        continue;
      }

      // IMPROVEMENT 4: Confidence threshold (weighted voting already done by smoother)
      // Only count if confidence is reasonable (model already filters at 0.25)
      if (det.confidence < 0.25) {
        console.log(`[Session] ❌ SKIPPED: Confidence too low (${(det.confidence * 100).toFixed(1)}% < 25%)`);
        continue;
      }

      // Count it
      console.log(`[Session] ✅ COUNTED: New pothole detected! (conf: ${(det.confidence * 100).toFixed(1)}%)`);
      countedCells.add(key);
      shortCacheRef.current.set(key, now);
      sessionCacheRef.current.set(key, now);
      const rep: PotholeReport = {
        id: `${key}:${now}`,
        lat: detLat,
        lon: detLon,
        ts: now,
      };
      reportsRef.current.push(rep);
      out.push(rep);
    }
    
    console.log(`[Session] 📊 registerDetections result: ${out.length} new potholes counted`);
    return out;
  };

  const api = useMemo(() => ({
    registerDetections,
    getReports: () => reportsRef.current.slice(),
    getCount: () => reportsRef.current.length,
    reset: () => {
      shortCacheRef.current.clear();
      sessionCacheRef.current.clear();
      reportsRef.current = [];
    },
  }), []);

  return api;
}
