export interface Detection {
    trackingId: string;
    boundingBox: {
        originX: number;
        originY: number;
        width: number;
        height: number;
    };
    categories: { score: number; categoryName: string }[];
}

export interface NanoAnalysisResult {
    uid: string;
    age: string;
    sex: string;
    fashion: string;
    emotion: string;
    action: string;
    direction: string;
    accessories: string;
    posture: string;
}

let session: any = null; // Kept for pre-warming and clone() reuse

// Session readiness signaling — allows analyzeFrame to wait for preload
let sessionReadyResolve: (() => void) | null = null;
let sessionReadyPromise: Promise<void> | null = null;

function resetSessionReadyPromise() {
    sessionReadyPromise = new Promise<void>((resolve) => {
        if (session) {
            resolve(); // Already ready
        } else {
            sessionReadyResolve = resolve;
        }
    });
}
// Initialize on module load
resetSessionReadyPromise();

// === Model Loading State ===
export type ModelLoadingState = 'idle' | 'creating' | 'downloading' | 'ready' | 'error';
export interface ModelLoadingProgress {
    state: ModelLoadingState;
    loaded: number;  // bytes loaded
    total: number;   // total bytes
    percent: number; // 0-100
}

let loadingProgressCallback: ((progress: ModelLoadingProgress) => void) | null = null;

export function setLoadingProgressCallback(callback: (progress: ModelLoadingProgress) => void) {
    loadingProgressCallback = callback;
}

// === Prompt Management ===
// Default system prompt (can be overridden by promptSettings)
const DEFAULT_SYSTEM_PROMPT = `Analyze each person. Use the exact UID provided.
age: child/teen/20s/30s/40s/50s/60s+
sex: male/female
fashion: brief clothing description (3 words max)`;

// Default JSON Schema for structured output
const DEFAULT_RESPONSE_SCHEMA = {
    type: "array",
    items: {
        type: "object",
        properties: {
            uid: { type: "string" },
            age: { 
                type: "string",
                enum: ["child", "teen", "20s", "30s", "40s", "50s", "60s+"]
            },
            sex: { 
                type: "string",
                enum: ["male", "female"]
            },
            fashion: { type: "string" }
        },
        required: ["uid", "age", "sex", "fashion"]
    }
};

// Dynamic prompt and schema (set from promptSettings)
let currentSystemPrompt = DEFAULT_SYSTEM_PROMPT;
let currentResponseSchema = DEFAULT_RESPONSE_SCHEMA;

/**
 * Update the system prompt and schema dynamically
 * Call this when prompt settings change
 */
export function updatePromptConfig(systemPrompt: string, responseSchema: object) {
    currentSystemPrompt = systemPrompt;
    currentResponseSchema = responseSchema as any;
    console.log('[Nano] Prompt config updated');
}

// === Image Processing ===
import { VLM_CONFIG } from './config';

/**
 * Create a resized canvas from video/canvas preserving aspect ratio
 */
function createResizedCanvas(source: HTMLVideoElement | HTMLCanvasElement): HTMLCanvasElement {
    const maxSize = VLM_CONFIG.maxImageSize;
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    
    // Calculate new dimensions preserving aspect ratio
    let newWidth = sourceWidth;
    let newHeight = sourceHeight;
    
    if (sourceWidth > maxSize || sourceHeight > maxSize) {
        const aspectRatio = sourceWidth / sourceHeight;
        
        if (sourceWidth > sourceHeight) {
            newWidth = maxSize;
            newHeight = Math.round(maxSize / aspectRatio);
        } else {
            newHeight = maxSize;
            newWidth = Math.round(maxSize * aspectRatio);
        }
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0, newWidth, newHeight);
    
    console.log(`[Nano] Resized image: ${sourceWidth}x${sourceHeight} -> ${newWidth}x${newHeight}`);
    
    return canvas;
}

/**
 * Create a canvas with bounding boxes and UID labels overlaid on the video frame.
 * This annotated canvas is sent to the AI so it can visually identify each person.
 */
function createAnnotatedCanvas(
    source: HTMLVideoElement | HTMLCanvasElement,
    detections: any[]
): HTMLCanvasElement {
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

    const canvas = document.createElement('canvas');
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const ctx = canvas.getContext('2d')!;

    // 1. Draw the raw video frame
    ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight);

    // 2. Draw bounding boxes and UID labels
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#00FF00';
    ctx.fillStyle = '#00FF00';
    ctx.font = 'bold 24px Arial';

    for (const det of detections) {
        const bbox = det.bbox;
        if (!bbox || bbox.length < 4) continue;

        const bx = bbox[0] * sourceWidth;
        const by = bbox[1] * sourceHeight;
        const bw = bbox[2] * sourceWidth;
        const bh = bbox[3] * sourceHeight;

        // Draw bounding box
        ctx.strokeRect(bx, by, bw, bh);

        // Draw UID label with background for readability
        const uid = det.id?.toString() || det.trackingId || '?';
        const label = `UID: ${uid}`;
        const textMetrics = ctx.measureText(label);
        const labelH = 28;
        const labelY = Math.max(by - labelH - 2, 0);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(bx, labelY, textMetrics.width + 12, labelH);
        ctx.fillStyle = '#00FF00';
        ctx.fillText(label, bx + 6, labelY + 22);
    }

    console.log(`[Nano] Annotated image: ${sourceWidth}x${sourceHeight} with ${detections.length} boxes`);
    return canvas;
}

// Helper to standardise API access
function getLanguageModel() {
    if (typeof window === 'undefined') return null;
    
    if ('ai' in window && 'languageModel' in (window as any).ai) {
        return (window as any).ai.languageModel;
    }
    // Fallback for environments exposing LanguageModel globally
    if ('LanguageModel' in window) {
        return (window as any).LanguageModel;
    }
    return null;
}

export async function isNanoAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    console.log('[Nano] Checking availability...');

    const lm = getLanguageModel();
    if (!lm) {
        console.warn('[Nano] Neither window.ai.languageModel nor window.LanguageModel is defined');
        return false;
    }

    try {
        console.log('[Nano] Language Model API found. Checking capabilities/availability...');

        // Some versions use .availability() (Standard)
        if (typeof lm.availability === 'function') {
            const availability = await lm.availability({
                 expectedInputs: [
                    { type: "text", languages: ["en", "ja"] },
                    { type: "image" }
                ]
            });
            console.log(`[Nano] Availability status: ${availability}`);

            // Retry without args if 'no' (sometimes specific modality checks fail in early impls)
            if (availability === 'no') {
                const basicAvail = await lm.availability();
                console.log(`[Nano] Basic Availability (no args): ${basicAvail}`);
                if (basicAvail !== 'no') {
                     console.warn('[Nano] WARN: Image input might not be supported, but proceeding.');
                     return true;
                }
            }
            return availability !== 'no';
        }

        // Fallback: If capabilities exists (Older spec)
        if (typeof lm.capabilities === 'function') {
             const caps = await lm.capabilities();
             console.log(`[Nano] Capabilities: ${JSON.stringify(caps)}`);
             return caps.available !== 'no';
        }

        // If neither exists but the object/class exists, assume "maybe" valid
        return true;
    } catch (e) {
        console.error('[Nano] Error checking availability:', e);
        return false;
    }
}

export async function createNanoSession(): Promise<any> {
    if (session) return session;

    const lm = getLanguageModel();
    if (!lm) {
        throw new Error('Prompt API is not available.');
    }

    try {
        console.log('[Nano] Creating session...');

        // Notify loading start (will show 'creating' until download starts or session ready)
        if (loadingProgressCallback) {
            loadingProgressCallback({ state: 'creating', loaded: 0, total: 0, percent: 0 });
        }

        const options: any = {
            expectedInputs: [
                { type: "text", languages: ["en", "ja"] },
                { type: "image" }
            ],
            systemPrompt: currentSystemPrompt,
            // Monitor callback for download progress
            monitor(m: any) {
                m.addEventListener('downloadprogress', (e: any) => {
                    const loaded = e.loaded || 0;
                    const total = e.total || 0;
                    const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
                    
                    console.log(`[Nano] Model download: ${percent}% (${Math.round(loaded/1024/1024)}MB / ${Math.round(total/1024/1024)}MB)`);
                    
                    if (loadingProgressCallback) {
                        loadingProgressCallback({ state: 'downloading', loaded, total, percent });
                    }
                });
            }
        };

        // Try standard create
        session = await lm.create(options);

        // Notify loading complete
        if (loadingProgressCallback) {
            loadingProgressCallback({ state: 'ready', loaded: 0, total: 0, percent: 100 });
        }

        console.log('[Nano] Gemini Nano session created (pre-warm)');
        // Signal that the session is ready for clone() usage
        if (sessionReadyResolve) {
            sessionReadyResolve();
            sessionReadyResolve = null;
        }
        return session;
    } catch (e) {
        console.error('Failed to create Gemini Nano session:', e);
        if (loadingProgressCallback) {
            loadingProgressCallback({ state: 'error', loaded: 0, total: 0, percent: 0 });
        }
        throw e;
    }
}

/**
 * Warm up the model with a simple prompt to reduce first-inference latency
 * Call this during splash screen to pre-heat the model
 */
export async function warmupNano(): Promise<void> {
    if (!session) {
        await createNanoSession();
    }
    
    try {
        console.log('[Nano] Warming up model with initial prompt...');
        const start = performance.now();
        
        // Simple text-only prompt to warm up the model
        const response = await session.prompt('Say "ready" in one word.');
        
        const elapsed = Math.round(performance.now() - start);
        console.log(`[Nano] Warmup complete in ${elapsed}ms. Response: ${response}`);
    } catch (e) {
        console.warn('[Nano] Warmup prompt failed (non-critical):', e);
        // Non-critical - don't throw, just log
    }
}

/**
 * Reset the Nano session (useful when hitting token limits)
 */
export async function resetNanoSession(): Promise<any> {
    console.log('[Nano] Resetting session...');
    destroyNanoSession();
    return createNanoSession();
}

export async function destroyNanoSession() {
    if (session) {
        session.destroy();
        session = null;
        // Reset promise so next createNanoSession can signal readiness
        resetSessionReadyPromise();
    }
}

export interface NanoStreamingResponse {
    results: NanoAnalysisResult[];
    prompt: string;
    annotatedImageDataUrl?: string;
}

/**
 * Streaming version of analyzeFrameWithNano
 * @param onChunk - Callback for each streaming chunk (partial text)
 * @returns Final parsed results with the prompt used
 */
export async function analyzeFrameWithNanoStreaming(
    videoOrCanvas: HTMLVideoElement | HTMLCanvasElement | Blob,
    detections: any[],
    onChunk?: (partialText: string) => void
): Promise<NanoStreamingResponse> {
    const lm = getLanguageModel();
    if (!lm) {
        throw new Error('Prompt API is not available.');
    }
    
    // Wait for the preloaded session to be ready, then clone() it.
    // clone() creates a fresh session with same config but no conversation history,
    // avoiding token limit issues while reusing the already-loaded model (fast).
    if (!session && sessionReadyPromise) {
        console.log('[Nano] Waiting for preloaded session to be ready...');
        await sessionReadyPromise;
    }
    
    let requestSession: any;
    if (session) {
        console.log('[Nano] Cloning preloaded session (fast path)');
        requestSession = await session.clone();
    } else {
        // Fallback: no preload was triggered at all (should not happen in normal flow)
        console.warn('[Nano] No preloaded session available, creating new session (slow path)');
        requestSession = await lm.create({
            expectedInputs: [
                { type: "text", languages: ["en", "ja"] },
                { type: "image" }
            ],
            systemPrompt: currentSystemPrompt
        });
    }

    // 1. Format detections for prompt
    const idsStr = detections.map(d => {
        if (d.id && Array.isArray(d.bbox)) {
             return `[UID: ${d.id}, Box: {ymin: ${d.bbox[1]}, xmin: ${d.bbox[0]}, width: ${d.bbox[2]}, height: ${d.bbox[3]}}]`;
        }

        const trackingId = d.trackingId || d.id || 'unknown';
        const box = d.boundingBox || (d.bbox ? { originX: d.bbox[0], originY: d.bbox[1], width: d.bbox[2], height: d.bbox[3] } : null);

        if (box) {
             return `[UID: ${trackingId}, Box: {ymin: ${box.originY || box.y}, xmin: ${box.originX || box.x}, width: ${box.width || box.w}, height: ${box.height || box.h}}]`;
        }
        return `[UID: ${trackingId}]`;
    }).join('\n');

    console.log('Analyzing IDs:', idsStr);

    // User prompt - no examples to avoid confusion
    const promptText = `Describe persons: ${idsStr}`;

    let annotatedImageDataUrl: string | undefined;
    try {
        // Create annotated canvas with bounding boxes, then resize for AI
        let visualSource: HTMLCanvasElement | Blob;
        if (videoOrCanvas instanceof Blob) {
            visualSource = videoOrCanvas;
        } else {
            // Draw bounding boxes + UIDs on the frame, then resize
            const annotatedCanvas = createAnnotatedCanvas(videoOrCanvas, detections);
            const resizedCanvas = createResizedCanvas(annotatedCanvas);
            visualSource = resizedCanvas;
            // Generate data URL for preview in Analysis Feed
            annotatedImageDataUrl = resizedCanvas.toDataURL('image/jpeg', 0.7);
        }

        const visualInput = { type: "image", value: visualSource };

        // Use streaming API with JSON schema constraint
        const stream = await requestSession.promptStreaming([
            {
                role: "user",
                content: [
                    { type: "text", value: promptText },
                    visualInput
                ]
            }
        ], {
            responseConstraint: currentResponseSchema
        });

        let fullText = '';

        for await (const chunk of stream) {
            // promptStreaming returns delta chunks, need to accumulate
            fullText += chunk;
            if (onChunk) {
                onChunk(fullText);
            }
        }

        // Destroy this request's session immediately (no history needed)
        requestSession.destroy();

        console.log('Gemini Nano Raw Result:', fullText);

        // Try to parse JSON from final result
        const cleanResult = fullText.replace(/```json/g, '').replace(/```/g, '').trim();
        try {
            return { results: JSON.parse(cleanResult), prompt: promptText, annotatedImageDataUrl };
        } catch (parseError) {
            console.warn('Failed to parse JSON, returning raw text as single result');
            // Return raw text as a fallback result (use structured fields)
            return { results: [{ uid: 'raw', age: 'unknown', sex: 'unknown', fashion: cleanResult, emotion: 'unknown', action: 'unknown', direction: 'unknown', accessories: 'unknown', posture: 'unknown'}], prompt: promptText, annotatedImageDataUrl };
        }

    } catch (e) {
        console.error('Nano Analysis Failed:', e);
        return { results: [], prompt: promptText, annotatedImageDataUrl };
    }
}

// Keep original non-streaming version for compatibility
export async function analyzeFrameWithNano(
    videoOrCanvas: HTMLVideoElement | HTMLCanvasElement | Blob,
    detections: any[]
): Promise<NanoStreamingResponse> {
    return analyzeFrameWithNanoStreaming(videoOrCanvas, detections);
}
