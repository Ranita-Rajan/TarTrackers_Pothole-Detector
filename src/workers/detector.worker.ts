// Detector Worker: YOLO pothole detection with ONNX Runtime Web

let ort: typeof import('onnxruntime-web') | null = null;
let session: import('onnxruntime-web').InferenceSession | null = null;
let inputName = '';
let outputName = '';
let busy = false;

const INPUT_SIZE = 640; // 640x640 input for YOLOv8
const CONF_THRESHOLD = 0.30; // Confidence threshold (30% - stricter filtering)

// Reusable buffers for performance
let offscreen: OffscreenCanvas | null = null;
let offctx: OffscreenCanvasRenderingContext2D | null = null;
let chw: Float32Array | null = null;
let currentProvider: string | null = null;

type InitMsg = { type: 'init'; modelUrl: string };
type FrameMsg = { type: 'frame'; bitmap: ImageBitmap; width: number; height: number };
type StopMsg = { type: 'stop' };
type Msg = InitMsg | FrameMsg | StopMsg;
type DetectionResult = { detections: Detection[]; maxConfidence: number };

self.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      const provider = await initOrt(msg.modelUrl);
      currentProvider = provider;
      // @ts-ignore
      (self as any).postMessage({ type: 'ready', provider });
      return;
    }
    
    if (msg.type === 'frame') {
      if (!session || busy) {
        msg.bitmap.close();
        return;
      }
      busy = true;
      const t0 = performance.now();
      const result = await runInference(msg.bitmap, msg.width, msg.height);
      const dt = performance.now() - t0;
      // @ts-ignore
      (self as any).postMessage({ 
        type: 'inference', 
        detections: result.detections, 
        frameW: msg.width, 
        frameH: msg.height, 
        timeMs: dt,
        provider: currentProvider,
        maxConfidence: result.maxConfidence
      });
      busy = false;
      return;
    }
    
    if (msg.type === 'stop') {
      session = null;
      // Clean up canvas resources to free memory
      offscreen = null;
      offctx = null;
      chw = null;
      return;
    }
  } catch (err: any) {
    console.error('[Worker] Error:', err);
    // @ts-ignore
    (self as any).postMessage({ type: 'error', message: String(err?.message || err) });
    busy = false;
  }
};

async function initOrt(modelUrl: string): Promise<string> {
  console.log('[Worker] 🚀 Initializing ONNX Runtime...');
  console.log('[Worker] 📁 Model URL:', modelUrl);
  
  if (!ort) {
    console.log('[Worker] 📦 Importing onnxruntime-web...');
    ort = await import('onnxruntime-web');
    ort.env.wasm.simd = true;
    ort.env.wasm.numThreads = 1; // Workers are not cross-origin isolated during dev; multi-thread would fail
    ort.env.wasm.wasmPaths = '/onnxruntime/';
    console.log('[Worker] ✅ ONNX Runtime imported');
  }

  // Try WebGPU first (fastest), then WebGL, then WASM fallback
  // WebGPU is 2-3x faster than WASM but requires Chrome 113+ / Edge 113+
  const providers: import('onnxruntime-web').InferenceSession.SessionOptions['executionProviders'] = ['webgpu', 'webgl', 'wasm'];

  for (const provider of providers) {
    try {
      const providerName = typeof provider === 'string' ? provider : provider?.name || 'custom';
      
      // Skip WebGL in workers (not available)
      if (providerName === 'webgl') {
        console.log('[Worker] ⏭️ Skipping WebGL (not available in workers)');
        continue;
      }
      
      console.log(`[Worker] 🔄 Trying ${providerName.toUpperCase()} backend...`);
      
      session = await ort!.InferenceSession.create(modelUrl, {
        executionProviders: [provider],
        graphOptimizationLevel: 'all',
      });
      inputName = session.inputNames[0];
      outputName = session.outputNames[0];

      console.log(`[Worker] ✅ Session created with ${providerName.toUpperCase()}`);
      console.log(`[Worker] 📊 Input: ${inputName}, Output: ${outputName}`);

      // Warmup inference
      console.log('[Worker] 🔥 Running warmup inference...');
      const zero = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
      const tensor = new ort!.Tensor('float32', zero, [1, 3, INPUT_SIZE, INPUT_SIZE]);
      const warmupStart = performance.now();
      await session.run({ [inputName]: tensor });
      const warmupTime = performance.now() - warmupStart;
      console.log(`[Worker] ✅ Warmup complete in ${warmupTime.toFixed(0)}ms`);

      console.log(`[Worker] 🎉 Model loaded successfully with ${providerName.toUpperCase()}`);
      return providerName;
    } catch (err) {
      const providerName = typeof provider === 'string' ? provider : provider?.name || 'custom';
      console.warn(`[Worker] ⚠️ ${providerName.toUpperCase()} failed:`, err);
    }
  }
  throw new Error('❌ No compatible backend found. Model may be incompatible.');
}async function runInference(bitmap: ImageBitmap, frameW: number, frameH: number): Promise<DetectionResult> {
  // Prepare canvas once
  if (!offscreen) {
    offscreen = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
    offctx = offscreen.getContext('2d', { willReadFrequently: true })!;
    console.log('[Worker] 🎨 Canvas initialized');
  }
  if (!chw) {
    chw = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
    console.log('[Worker] 📦 CHW buffer allocated');
  }

  // Letterbox into 640x640 keeping aspect (simple fit)
  const sx = 0, sy = 0, sWidth = bitmap.width, sHeight = bitmap.height;
  offctx!.clearRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  offctx!.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, INPUT_SIZE, INPUT_SIZE);
  bitmap.close();

  const img = offctx!.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
  // Convert RGBA -> CHW float32 [0,1]
  const size = INPUT_SIZE * INPUT_SIZE;
  for (let i = 0; i < size; i++) {
    const r = img[i * 4] / 255;
    const g = img[i * 4 + 1] / 255;
    const b = img[i * 4 + 2] / 255;
    chw[i] = r;
    chw[size + i] = g;
    chw[2 * size + i] = b;
  }

  const tensor = new ort!.Tensor('float32', chw, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const results = await session!.run({ [inputName]: tensor });
  const output = results[outputName] as import('onnxruntime-web').Tensor;
  const arr = output.data as Float32Array;
  const dims = (output.dims || []) as number[];
  
  // DEBUG: Log on first inference only
  if (!currentProvider) {
    console.log('[Worker] 📊 First inference - Output shape:', dims);
    console.log('[Worker] 📊 Output length:', arr.length);
    console.log('[Worker] 📊 First 10 values:', Array.from(arr.slice(0, 10)));
  }
  
  // Parse detections based on output shape
  let result: DetectionResult = { detections: [], maxConfidence: 0 };
  
  // YOLOv8 standard format: [1, 5, 8400] with rows [x, y, w, h, conf]
  if (dims.length === 3 && dims[1] === 5 && dims[2] === 8400) {
    result = processYOLOv8_5xN(arr, dims, frameW, frameH, INPUT_SIZE, CONF_THRESHOLD);
  } 
  // Alternative formats
  else if (dims.length === 3 && dims[1] >= 5 && dims[2] >= 1000) {
    result = processYOLOv8_5xN(arr, dims, frameW, frameH, INPUT_SIZE, CONF_THRESHOLD);
  } else if (dims.length === 2 && dims[1] >= 5) {
    result = processFlat5(arr, frameW, frameH, INPUT_SIZE, CONF_THRESHOLD);
  } else if (arr.length % 5 === 0) {
    result = processFlat5(arr, frameW, frameH, INPUT_SIZE, CONF_THRESHOLD);
  } else {
    console.warn('[Worker] ⚠️ Unknown output shape:', dims);
    result = { detections: [], maxConfidence: 0 };
  }
  
  // Log detections
  if (result.detections.length > 0) {
    console.log(`[Worker]  Found ${result.detections.length} pothole(s) - Max conf: ${(result.maxConfidence * 100).toFixed(1)}%`);
  }
  
  return result;
}

type Detection = { bbox: [number, number, number, number]; confidence: number; class: string };

// YOLOv8 common export: [1, 5, N] with rows [x,y,w,h,conf]
function processYOLOv8_5xN(outputData: Float32Array, dims: number[], imgW: number, imgH: number, input: number, confTh: number): DetectionResult {
  const n = dims[2];
  const stride = n;
  const raw: Detection[] = [];
  let maxConf = 0;
  const xs = 0 * stride;
  const ys = 1 * stride;
  const ws = 2 * stride;
  const hs = 3 * stride;
  const cs = 4 * stride;
  for (let i = 0; i < n; i++) {
    const conf = outputData[cs + i];
    if (conf > maxConf) maxConf = conf;
    if (conf < confTh) continue;
    const x = outputData[xs + i];
    const y = outputData[ys + i];
    const w = outputData[ws + i];
    const h = outputData[hs + i];
    const xMin = (x - w / 2) * (imgW / input);
    const yMin = (y - h / 2) * (imgH / input);
    raw.push({ bbox: [xMin, yMin, w * (imgW / input), h * (imgH / input)], confidence: conf, class: 'pothole' });
  }
  return { detections: nms(raw, 0.45), maxConfidence: maxConf };
}

// Fallback: flat [N*5] with [x,y,w,h,conf]
function processFlat5(outputData: Float32Array, imgW: number, imgH: number, input: number, confTh: number): DetectionResult {
  const n = Math.floor(outputData.length / 5);
  const raw: Detection[] = [];
  let maxConf = 0;
  for (let i = 0; i < n; i++) {
    const x = outputData[i * 5 + 0];
    const y = outputData[i * 5 + 1];
    const w = outputData[i * 5 + 2];
    const h = outputData[i * 5 + 3];
    const conf = outputData[i * 5 + 4];
    if (conf > maxConf) maxConf = conf;
    if (conf < confTh) continue;
    const xMin = (x - w / 2) * (imgW / input);
    const yMin = (y - h / 2) * (imgH / input);
    raw.push({ bbox: [xMin, yMin, w * (imgW / input), h * (imgH / input)], confidence: conf, class: 'pothole' });
  }
  return { detections: nms(raw, 0.45), maxConfidence: maxConf };
}

function nms(boxes: Detection[], iouTh = 0.45): Detection[] {
  boxes.sort((a, b) => b.confidence - a.confidence);
  const out: Detection[] = [];
  for (const b of boxes) {
    let keep = true;
    for (const s of out) {
      if (iou(b.bbox, s.bbox) > iouTh) { keep = false; break; }
    }
    if (keep) out.push(b);
  }
  return out;
}

function iou(a: [number, number, number, number], b: [number, number, number, number]) {
  const [ax, ay, aw, ah] = a; const [bx, by, bw, bh] = b;
  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const ua = aw * ah + bw * bh - inter;
  return ua <= 0 ? 0 : inter / ua;
}
