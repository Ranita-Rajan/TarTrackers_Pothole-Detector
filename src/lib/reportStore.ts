export type PotholeReport = {
  id: string;
  lat: number;
  lon: number;
  ts: number; // epoch ms
  // Optional metadata
  uid?: string; // anonymous user/session id
  model?: string;
  conf?: number;
};

export type Unsubscribe = () => void;

export interface ReportStore {
  addReport(rep: PotholeReport): Promise<void>;
  addBatch(reps: PotholeReport[]): Promise<void>;
  // Subscribe to reports within bbox or radius
  subscribeNearby(
    center: { lat: number; lon: number },
    radiusMeters: number,
    cb: (reports: PotholeReport[]) => void
  ): Unsubscribe;
  // Subscribe to reports for a specific user (optimized for Profile page)
  subscribeByUser?(
    userId: string,
    cb: (reports: PotholeReport[]) => void
  ): Unsubscribe;
}

// In-memory store for development and offline mode
export class InMemoryReportStore implements ReportStore {
  private reports: PotholeReport[] = [];
  private listeners = new Set<() => void>();

  async addReport(rep: PotholeReport): Promise<void> {
    this.reports.push(rep);
    this.emit();
  }
  async addBatch(reps: PotholeReport[]): Promise<void> {
    if (reps.length === 0) return;
    this.reports.push(...reps);
    this.emit();
  }

  subscribeNearby(
    center: { lat: number; lon: number },
    radiusMeters: number,
    cb: (reports: PotholeReport[]) => void
  ): Unsubscribe {
    const wrapped = () => cb(this.filterNearby(center, radiusMeters));
    this.listeners.add(wrapped);
    // Fire once immediately
    wrapped();
    return () => {
      this.listeners.delete(wrapped);
    };
  }

  subscribeByUser(
    userId: string,
    cb: (reports: PotholeReport[]) => void
  ): Unsubscribe {
    const wrapped = () => cb(this.reports.filter(r => r.uid === userId));
    this.listeners.add(wrapped);
    // Fire once immediately
    wrapped();
    return () => {
      this.listeners.delete(wrapped);
    };
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private filterNearby(center: { lat: number; lon: number }, radiusMeters: number) {
    // Quick filter: naive haversine; fine for small collections
    const R = 6371_000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const clat = toRad(center.lat);
    const clon = toRad(center.lon);
    return this.reports.filter((r) => {
      const dLat = toRad(r.lat) - clat;
      const dLon = toRad(r.lon) - clon;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(clat) * Math.cos(toRad(r.lat)) * Math.sin(dLon / 2) ** 2;
      const d = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
      return d <= radiusMeters;
    });
  }
}

// Firestore-backed implementation (requires env + firebase)
export class FirestoreReportStore implements ReportStore {
  private db: any;
  private unsubscribers = new Set<() => void>();
  constructor(db: any) {
    this.db = db;
  }
  async addReport(rep: PotholeReport): Promise<void> {
    // Check for duplicates within 10m radius (prevents duplicate submissions)
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    
    // Calculate rough bounding box (1 degree ≈ 111km)
    const latRange = 0.0001; // ~10m
    
    const q = query(
      collection(this.db, 'potholeReports'),
      where('lat', '>=', rep.lat - latRange),
      where('lat', '<=', rep.lat + latRange)
    );
    
    const snapshot = await getDocs(q);
    
    // Check if any existing pothole is within 5m (reduced threshold for better accuracy)
    for (const doc of snapshot.docs) {
      const existing = doc.data();
      const existingLat = this.asNumber(existing.lat ?? existing.latitude);
      const existingLon = this.asNumber(existing.lon ?? existing.lng ?? existing.longitude);

      if (existingLat === null || existingLon === null) {
        continue;
      }

      const distance = this.calculateDistance(
        rep.lat,
        rep.lon,
        existingLat,
        existingLon
      );
      
      if (distance < 5) {
        console.log('[ReportStore] ⚠️ Duplicate pothole within 5m - skipping', {
          new: `${rep.lat.toFixed(6)}, ${rep.lon.toFixed(6)}`,
          existing: `${existingLat.toFixed(6)}, ${existingLon.toFixed(6)}`,
          distance: distance.toFixed(1) + 'm'
        });
        return; // Skip duplicate
      }
    }
    
    // No duplicates found - add new pothole
    const { addDoc } = await import('firebase/firestore');
    await addDoc(collection(this.db, 'potholeReports'), {
      ...rep,
      // Backwards compatibility for older schema
      lng: rep.lon,
      detectedAt: rep.ts,
      timestamp: rep.ts,
    });
    console.log('[ReportStore] ✅ Added new pothole:', rep.lat.toFixed(6), rep.lon.toFixed(6));
  }
  
  // Haversine distance calculation
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  async addBatch(reps: PotholeReport[]): Promise<void> {
    if (reps.length === 0) return;
    const { writeBatch, collection, doc } = await import('firebase/firestore');
    const batch = writeBatch(this.db);
    const col = collection(this.db, 'potholeReports');
    for (const r of reps) {
      const ref = doc(col);
      batch.set(ref, {
        ...r,
        lng: r.lon,
        detectedAt: r.ts,
        timestamp: r.ts,
      });
    }
    await batch.commit();
  }
  subscribeNearby(
    center: { lat: number; lon: number },
    radiusMeters: number,
    cb: (reports: PotholeReport[]) => void
  ): Unsubscribe {
    let stopped = false;
    const setup = async () => {
      try {
        const { collection, onSnapshot } = await import('firebase/firestore');

        console.log('[ReportStore] 🔄 Setting up Firestore listener...');

        // Query all pothole reports and sort client-side for schema flexibility
        // Note: No limit or orderBy to avoid 400 errors on new/empty databases
        const col = collection(this.db, 'potholeReports');
        
        // We'll keep a polling fallback in case the WebChannel listener fails
        let fallbackInterval: any = null;
        let lastSnapshotSuccess = false;

        const processSnapshot = (snap: any) => {
          if (stopped) return;
          const all: PotholeReport[] = [];
          snap.forEach((doc: any) => {
            const normalized = this.normalizeReportDoc(doc.id, doc.data());
            if (normalized) all.push(normalized);
          });
          all.sort((a, b) => b.ts - a.ts);
          console.log('[ReportStore] 📍 Loaded', all.length, 'potholes from Firebase (potholeReports collection)');
          cb(all);
        };

        // Real-time listener
        const unsub = onSnapshot(
          col,
          (snap) => {
            lastSnapshotSuccess = true;
            // If we had a polling fallback running, stop it
            if (fallbackInterval) {
              clearInterval(fallbackInterval);
              fallbackInterval = null;
              console.log('[ReportStore] 🔁 Cleared polling fallback after successful snapshot');
            }
            processSnapshot(snap);
          },
          (error: any) => {
            console.error('[ReportStore] ❌ Firestore listener error:', error);
            console.error('[ReportStore] Error code:', error?.code);
            console.error('[ReportStore] Error message:', error?.message);

            if (error?.code === 'permission-denied') {
              console.error('[ReportStore] 🚫 Permission denied - check Firestore rules');
              return;
            }

            // Start polling fallback if not already started
            if (!fallbackInterval) {
              console.warn('[ReportStore] ⚠️ Starting polling fallback (getDocs) due to listener error');
              const startPolling = async () => {
                try {
                  const { getDocs } = await import('firebase/firestore');
                  // Initial immediate poll
                  const snap = await getDocs(col as any);
                  processSnapshot(snap);
                } catch (e: any) {
                  console.error('[ReportStore] ❌ Polling fetch failed:', e?.message || e);
                }
              };

              // Run immediately then every 5s
              startPolling();
              fallbackInterval = setInterval(startPolling, 5000);
            }
          }
        );

        this.unsubscribers.add(() => {
          try {
            unsub();
          } catch (e) {}
          if (fallbackInterval) {
            clearInterval(fallbackInterval);
            fallbackInterval = null;
          }
        });
      } catch (error: any) {
        console.error('[ReportStore] ❌ Failed to setup Firestore listener:', error);
      }
    };
    setup();
    return () => {
      stopped = true;
      for (const u of this.unsubscribers) u();
      this.unsubscribers.clear();
    };
  }

  subscribeByUser(
    userId: string,
    cb: (reports: PotholeReport[]) => void
  ): Unsubscribe {
    let stopped = false;
    const setup = async () => {
      const { collection, query, where, onSnapshot, limit } = await import('firebase/firestore');
      // Optimized query: filter by uid server-side, only last 50 reports
      const q = query(
        collection(this.db, 'potholeReports'),
        where('uid', '==', userId),
        limit(50)
      );
      const unsub = onSnapshot(q, (snap) => {
        if (stopped) return;
        const reports: PotholeReport[] = [];
        snap.forEach((doc) => {
          const normalized = this.normalizeReportDoc(doc.id, doc.data());
          if (normalized) reports.push(normalized);
        });
        reports.sort((a, b) => b.ts - a.ts);
        cb(reports);
      });
      this.unsubscribers.add(unsub);
    };
    setup();
    return () => {
      stopped = true;
      for (const u of this.unsubscribers) u();
      this.unsubscribers.clear();
    };
  }

  private normalizeReportDoc(id: string, data: any): PotholeReport | null {
    if (!data) return null;

    const lat = this.asNumber(data.lat ?? data.latitude);
    const lon = this.asNumber(data.lon ?? data.lng ?? data.longitude);
    const ts = this.extractTimestamp(data);

    if (lat === null || lon === null || ts === null) {
      console.warn('[ReportStore] ⚠️ Skipping malformed pothole doc', { id, lat, lon, ts, data });
      return null;
    }

    const conf = this.asNumber(data.conf ?? data.confidence ?? data.score ?? data.accuracy);

    return {
      id,
      lat,
      lon,
      ts,
      uid: typeof data.uid === 'string' ? data.uid : undefined,
      model: typeof data.model === 'string' ? data.model : undefined,
      conf: conf ?? undefined,
    };
  }

  private asNumber(value: any): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (value && typeof value.toMillis === 'function') {
      const millis = value.toMillis();
      return Number.isFinite(millis) ? millis : null;
    }
    return null;
  }

  private extractTimestamp(data: any): number | null {
    const candidates = [
      data.ts,
      data.detectedAt,
      data.timestamp,
      data.createdAt,
      data.updatedAt,
    ];

    for (const candidate of candidates) {
      const ts = this.asNumber(candidate);
      if (ts !== null) return ts;
    }

    return null;
  }
}

export async function getReportStore(): Promise<ReportStore> {
  // Use Supabase instead of Firebase
  const { getReportStore: getSupabaseStore } = await import('./reportStore-supabase');
  return getSupabaseStore();
}
