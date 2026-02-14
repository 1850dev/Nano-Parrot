/**
 * Configuration for Nano-Parrot
 * MediaPipe Object Detector + Chrome Built-in AI (Prompt API)
 */

// === MediaPipe Object Detector Configuration ===
const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm';
const MEDIAPIPE_MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';

// Local fallback paths
const LOCAL_WASM_PATH = '/wasm';
const LOCAL_MODEL_PATH = '/models/efficientdet_lite0.tflite';

// Tracker Configuration
export const TRACKER_CONFIG = {
  iouThreshold: 0.3,        // Threshold to match existing object
  gracePeriodMs: 2000,      // Time before removing a lost ID
  highScoreThreshold: 0.50, // New object creation threshold
  lowScoreThreshold: 0.30,  // Existing object tracking threshold
  confirmationFrames: 3,    // Frames required to confirm a track
  minAreaRatio: 0.005,      // 0.5% of screen area
  maxAspectRatio: 4.0,      // Height/Width shouldn't be too extreme
  minAspectRatio: 0.25
};

// VLM Analysis Configuration (Chrome Built-in AI)
export const VLM_CONFIG = {
  maxImageSize: 728,        // Max dimension for resized images
  systemPrompt: `Analyze each person. Use the exact UID provided.
age: child/teen/20s/30s/40s/50s/60s+
sex: male/female
fashion: brief clothing description (3 words max)`
};

// Default application settings
export const DEFAULT_CONFIG = {
  analysisIntervalMs: 3000, // Time between VLM analyses
  maxTrackedUsers: 10       // Maximum concurrent tracked users
};

/**
 * Get MediaPipe WASM path based on environment
 */
export function getWasmPath(): string {
  if (import.meta.env?.DEV) {
    return LOCAL_WASM_PATH;
  }
  return MEDIAPIPE_CDN;
}

/**
 * Get MediaPipe model path based on environment
 */
export function getModelPath(): string {
  if (import.meta.env?.DEV) {
    return LOCAL_MODEL_PATH;
  }
  return MEDIAPIPE_MODEL_CDN;
}

/**
 * Get fallback paths for production (when CDN fails)
 */
export function getFallbackPaths() {
  return {
    wasm: LOCAL_WASM_PATH,
    model: LOCAL_MODEL_PATH
  };
}

// Get config with optional env overrides
export function getConfig() {
  return { ...DEFAULT_CONFIG };
}
