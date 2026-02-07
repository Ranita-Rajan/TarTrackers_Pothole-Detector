import { useEffect, useMemo, useRef, useState } from 'react';

type Detection = { bbox: [number, number, number, number]; confidence: number; class: string };

type WorkerMsg =
  | { type: 'ready'; provider?: string }
  | { type: 'inference'; detections: Detection[]; frameW: number; frameH: number; timeMs: number; provider?: string; maxConfidence?: number }
  | { type: 'error'; message: string };

export function usePotholeWorker(options?: { autoLoad?: boolean; modelUrl?: string }) {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const isReadyRef = useRef(false); // Add ref for closure-safe access
  const [isLoading, setIsLoading] = useState(false);
  const [lastDetections, setLastDetections] = useState<Detection[]>([]);
  const [backend, setBackend] = useState<string | null>(null);
  const [lastStats, setLastStats] = useState<{ count: number; timeMs: number; at: number; maxConfidence: number } | null>(null);
  const busyRef = useRef(false);
  const lastUiUpdateRef = useRef(0);
  const lastLogRef = useRef(0);
  const backendRef = useRef('wasm');
  const autoLoadTriggeredRef = useRef(false); // Prevent duplicate autoLoad

  // Auto-preload model on mount if enabled
  useEffect(() => {
    if (options?.autoLoad && options?.modelUrl && !workerRef.current && !autoLoadTriggeredRef.current) {
      autoLoadTriggeredRef.current = true;
      console.info('[AI] 🚀 Auto-preloading model on mount...');
      init(options.modelUrl);
    }
  }, []); // Empty deps - only run once on mount

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const init = async (modelUrl: string) => {
    // Terminate old worker if exists (prevent memory leak)
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
      setIsReady(false);
      isReadyRef.current = false; // Reset ref
    }
    
    setIsLoading(true);
    console.log('[AI] 🔧 Creating new worker...');
    const w = new Worker(new URL('../workers/detector.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = w;
    
    w.onmessage = (e: MessageEvent<WorkerMsg>) => {
      if (e.data.type === 'ready') {
        setIsReady(true);
        isReadyRef.current = true; // Update ref immediately
        setIsLoading(false);
        const provider = e.data.provider ?? 'wasm';
        backendRef.current = provider;
        setBackend(provider);
        console.info('[AI] ✅ Worker ready with', provider, '- isReadyRef set to true');
        return;
      }
      if (e.data.type === 'inference') {
        busyRef.current = false;
        const now = performance.now();
        if (e.data.provider) {
          backendRef.current = e.data.provider;
          setBackend(e.data.provider);
        }
        // Throttle UI updates to ~14 Hz
        if (now - lastUiUpdateRef.current > 70) {
          setLastDetections(e.data.detections);
          lastUiUpdateRef.current = now;
        }
        setLastStats({ count: e.data.detections.length, timeMs: e.data.timeMs, at: now, maxConfidence: e.data.maxConfidence ?? 0 });
        if (now - lastLogRef.current > 1000) {
          const provider = backendRef.current;
          const maxConf = e.data.maxConfidence ?? 0;
          console.info(`[AI] ${provider} • ${e.data.timeMs.toFixed(1)}ms • ${e.data.detections.length} potholes • max conf: ${(maxConf * 100).toFixed(1)}%`);
          lastLogRef.current = now;
        }
        return;
      }
      if (e.data.type === 'error') {
        console.error('[Detection Error]:', e.data.message);
        busyRef.current = false;
        return;
      }
    };
    
    w.postMessage({ type: 'init', modelUrl });
  };

  const sendVideoFrame = async (video: HTMLVideoElement) => {
    if (!workerRef.current) {
      console.warn('[AI] ⚠️ Worker not initialized');
      return false;
    }
    if (!isReadyRef.current) { // Check ref instead of state
      console.warn('[AI] ⚠️ Worker not ready (isReadyRef:', isReadyRef.current, ')');
      return false;
    }
    if (busyRef.current) {
      // Don't log busy every time, too spammy
      return false;
    }
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn('[AI] ⚠️ Video dimensions invalid:', video.videoWidth, 'x', video.videoHeight);
      return false;
    }
    busyRef.current = true;
    
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(video);
      console.log(`[AI] 📸 Sending frame: ${video.videoWidth}x${video.videoHeight}`);
      workerRef.current.postMessage({ type: 'frame', bitmap, width: video.videoWidth, height: video.videoHeight }, [bitmap as any]);
      bitmap = null; // Transferred, don't close
      return true;
    } catch (e) {
      console.error('[AI] ❌ Frame send error:', e);
      busyRef.current = false;
      if (bitmap) bitmap.close(); // Clean up on error
      return false;
    }
  };

  const stop = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'stop' });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsReady(false);
    isReadyRef.current = false; // Reset ref
    setIsLoading(false);
  };

  return {
    init,
    sendVideoFrame,
    stop,
    isReady,
    isReadyRef, // Export ref for closure-safe access in detection loops
    isLoading,
    lastDetections,
    lastStats,
    backend,
  };
}
