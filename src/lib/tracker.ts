/**
 * User Tracker using MediaPipe Object Detector
 * Tracks 'person' class with unique IDs
 * Optimized with requestIdleCallback for better UI performance
 */
import { 
    ObjectDetector, 
    FilesetResolver 
} from '@mediapipe/tasks-vision';
import { trackingData } from './stores';
import { generateID } from './utils';
import { TRACKER_CONFIG, getWasmPath, getModelPath, getFallbackPaths } from './config';

let objectDetector: ObjectDetector | null = null;
const runningMode = 'VIDEO';
let lastVideoTime = -1;

interface LocalTrack {
  id: string;
  bbox: [number, number, number, number]; // [x, y, w, h] normalized
  score: number;
  firstSeen: number;
  lastSeen: number;
  matched: boolean;
  consecutiveFrames: number; // For temporal consistency
  isConfirmed: boolean;      // Visible to UI only when confirmed
}

let localTracks: LocalTrack[] = []; 
let currentSessionId = 'unknown';

/**
 * Initialize MediaPipe Object Detector
 */
export async function initializeTracker(sessionId: string): Promise<void> {
  currentSessionId = sessionId;
  if (objectDetector) return;

  console.log('Initializing Object Detector...');
  const fallback = getFallbackPaths();
  
  try {
      // 1. Resolve WASM Path
      let vision;
      try {
          vision = await FilesetResolver.forVisionTasks(getWasmPath());
      } catch (e) {
          if (!import.meta.env.DEV) {
              console.warn('Failed to load WASM from CDN, falling back to local...', e);
              vision = await FilesetResolver.forVisionTasks(fallback.wasm);
          } else {
              throw e;
          }
      }
      
      // 2. Resolve Model Path
      const modelPath = getModelPath();

      try {
        objectDetector = await ObjectDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: 'GPU'
            },
            scoreThreshold: TRACKER_CONFIG.lowScoreThreshold,
            runningMode: runningMode,
            categoryAllowlist: ['person']
        });
      } catch (e) {
          if (!import.meta.env.DEV && modelPath !== fallback.model) {
             console.warn('Failed to load Model from CDN, falling back to local...', e);
             objectDetector = await ObjectDetector.createFromOptions(vision, {
                baseOptions: {
                  modelAssetPath: fallback.model,
                  delegate: 'GPU'
                },
                scoreThreshold: TRACKER_CONFIG.lowScoreThreshold,
                runningMode: runningMode,
                categoryAllowlist: ['person']
            });
          } else {
              throw e;
          }
      }
      
      console.log('Object Detector initialized');
  } catch (e) {
      console.error('Failed to initialize Object Detector', e);
  }
}

/**
 * Calculate IoU (Intersection over Union) between two boxes
 * box: [x, y, w, h]
 */
export function calculateIoU(boxA: [number, number, number, number], boxB: [number, number, number, number]): number {
  const x1 = Math.max(boxA[0], boxB[0]);
  const y1 = Math.max(boxA[1], boxB[1]);
  const x2 = Math.min(boxA[0] + boxA[2], boxB[0] + boxB[2]);
  const y2 = Math.min(boxA[1] + boxA[3], boxB[1] + boxB[3]);

  const intersectionW = Math.max(0, x2 - x1);
  const intersectionH = Math.max(0, y2 - y1);
  const intersectionArea = intersectionW * intersectionH;

  const areaA = boxA[2] * boxA[3];
  const areaB = boxB[2] * boxB[3];
  const unionArea = areaA + areaB - intersectionArea;

  if (unionArea === 0) return 0;
  return intersectionArea / unionArea;
}

/**
 * Process a video frame and update tracking
 * @param {HTMLVideoElement} video 
 */
export async function processFrame(video: HTMLVideoElement): Promise<void> {
  if (!objectDetector) return;

  // MediaPipe efficientdet_lite0 expects timeline updates
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    
    // 1. Detect
    const startTimeMs = performance.now();
    const result = objectDetector.detectForVideo(video, startTimeMs);
    
    // Convert to normalized coordinates [x, y, w, h] 0-1
    const vidW = video.videoWidth;
    const vidH = video.videoHeight;

    if (vidW === 0 || vidH === 0) return;

    const currentDetections = result.detections
      .map(d => {
         // d.boundingBox is in pixels
         const bbox: [number, number, number, number] = [
             d.boundingBox!.originX / vidW,
             d.boundingBox!.originY / vidH,
             d.boundingBox!.width / vidW,
             d.boundingBox!.height / vidH
         ];
         return {
          bbox: bbox,
          score: d.categories[0].score
        };
      })
      // 1.5 Geometric Filtering
      .filter(d => {
          const [, , w, h] = d.bbox;
          const area = w * h;
          if (area < TRACKER_CONFIG.minAreaRatio) return false;
          
          const aspectRatio = w / h;
          if (aspectRatio > TRACKER_CONFIG.maxAspectRatio || aspectRatio < TRACKER_CONFIG.minAspectRatio) return false;
          
          return true;
      });

    // 2. Track (IoU Matching)
    const now = Date.now();
    
    // Mark all existing tracks as potentially missing first
    localTracks.forEach(t => t.matched = false);

    currentDetections.forEach(det => {
      let bestIoU = 0;
      let bestMatchIndex = -1;

      // Find best match in existing tracks
      localTracks.forEach((track, index) => {
        const iou = calculateIoU(track.bbox, det.bbox);
        if (iou > bestIoU) {
          bestIoU = iou;
          bestMatchIndex = index;
        }
      });

      if (bestIoU > TRACKER_CONFIG.iouThreshold && bestMatchIndex !== -1) {
        // Update existing track
        const track = localTracks[bestMatchIndex];
        track.bbox = det.bbox;
        track.score = det.score;
        track.lastSeen = now;
        track.matched = true;
        
        // Update confirmation info
        track.consecutiveFrames++;
        if (track.consecutiveFrames >= TRACKER_CONFIG.confirmationFrames) {
             track.isConfirmed = true;
        }

      } else {
        // Create new track
        // Hysteresis: New tracks require higher score
        if (det.score < TRACKER_CONFIG.highScoreThreshold) return;

        const newId = generateID();
        localTracks.push({
          id: newId,
          bbox: det.bbox,
          score: det.score,
          firstSeen: now,
          lastSeen: now,
          matched: true,
          consecutiveFrames: 1,
          isConfirmed: false // Pending confirmation
        });
        
        // Start Session (Should we wait for confirmation? Maybe not, to log 'firstSeen' correctly)
        // But to avoid trash in DB, let's wait until confirmed OR just create it but don't show it?
        // Let's create session entry now, but maybe flag it as 'short-lived' later if it disappears.
        // For now, simple approach: Create session immediately. 
        // Improvement: Only start session when confirmed.
        // startSession(newId, currentSessionId); 
      }
    });

    // 3. Prune old tracks
    const activeTracks: LocalTrack[] = [];
    localTracks.forEach(t => {
        if ((now - t.lastSeen) < TRACKER_CONFIG.gracePeriodMs) {
            activeTracks.push(t);
        } else {
            // Track is being removed (timeout)
            // If it was a confirmed session, mark it as ended
        }
    });
    localTracks = activeTracks;

    // 4. Update Store
    const storeUpdate: Record<string, any> = {};
    localTracks.forEach(t => {
      // We only expose active or recently seen tracks
      // AND only if they are confirmed!
      if (t.isConfirmed) {
          storeUpdate[t.id] = { ...t };
      }
    });
    trackingData.set(storeUpdate);
  }
}

/**
 * Dispose the tracker resources
 */
export function disposeTracker(): void {
  if (objectDetector) {
    objectDetector.close();
    objectDetector = null;
  }
  localTracks = [];
  trackingData.set({});
}
