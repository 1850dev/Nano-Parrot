<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { goto } from '$app/navigation';
    import { base } from '$app/paths';
    import {
        isNanoAvailable,
        createNanoSession,
        analyzeFrameWithNanoStreaming,
        destroyNanoSession,
        setLoadingProgressCallback,
        warmupNano,
        updatePromptConfig,
        type NanoAnalysisResult,
        type ModelLoadingProgress
    } from '$lib/main';
    import { trackingData, performanceMetrics } from '$lib/stores';
    import { promptSettings, generateSystemPrompt, generateResponseSchema } from '$lib/promptSettings';
    import { initializeTracker, processFrame, disposeTracker } from '$lib/tracker';
    import * as db from '$lib/dexieDb';
    import { checkAndTriggerAggregation } from '$lib/sessionAggregator';
    import { generateID } from '$lib/utils';
    import ViewFinder from '$lib/components/ViewFinder.svelte';
    import ResultsDisplay from '$lib/components/ResultsDisplay.svelte';
    import SplashScreen from '$lib/components/SplashScreen.svelte';
    import AnalysisSettings from '$lib/components/AnalysisSettings.svelte';

    let videoElement: HTMLVideoElement;
    let canvasElement: HTMLCanvasElement;
    let isAnalyzing = false;
    let isTracking = false;
    let errorMsg = '';
    let nanoAvailable = false;
    let stream: MediaStream | null = null;
    let analysisTimeout: ReturnType<typeof setTimeout> | null = null;
    let trackingInterval: ReturnType<typeof setInterval> | null = null;
    
    // Wake Lock for preventing device sleep
    let wakeLock: WakeLockSentinel | null = null;
    
    // Splash Screen State
    let showSplash = true;
    let isMobile = false;
    let isSafari = false;
    
    // Settings Panel State
    let showSettings = false;
    
    // UI State
    let processingTime = 0;
    let modelLoadingState: ModelLoadingProgress = { state: 'idle', loaded: 0, total: 0, percent: 0 };
    let isModelReady = false;
    
    // Session State: Map UID -> { sessionId, startTime, lastSeen }
    let activeSessions = new Map<string, { sessionId: string; startTime: number; lastSeen: number }>();
    
    // Session management constants
    const MIN_SESSION_DURATION = 1000; // 1 second - sessions shorter than this are deleted
    const SESSION_TIMEOUT = 5000; // 5 seconds grace period before ending session (must exceed inference time ~2.7s)

    // Analysis results display - keep a history like captions on main page
    let recentResults: NanoAnalysisResult[] = [];
    // History: one entry per analysis frame, containing all detected persons
    let resultsHistory: Array<{results: NanoAnalysisResult[], timestamp: string}> = [];
    let streamingText = ''; // Current streaming output

    // Subscribe to prompt settings and update config when changed
    $: if (browser && $promptSettings) {
        const systemPrompt = generateSystemPrompt($promptSettings);
        const responseSchema = generateResponseSchema($promptSettings);
        updatePromptConfig(systemPrompt, responseSchema);
    }

    onMount(async () => {
        if (!browser) return;

        // Detect mobile and Safari
        isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        
        // Check URL parameters for skip splash option
        const urlParams = new URLSearchParams(window.location.search);
        const skipSplash = urlParams.get('skip') === 'true' || urlParams.get('skip_splash') === 'true';
        if (skipSplash) {
            sessionStorage.setItem('hasExplored', 'true');
        }

        // Check if user has already seen splash this session
        const hasExplored = sessionStorage.getItem('hasExplored');
        if (hasExplored) {
            showSplash = false;
        }

        try {
            // 1. Check Nano Availability
            nanoAvailable = await isNanoAvailable();
            
            // 2. If splash is shown and API is available, start warmup in background
            if (showSplash && nanoAvailable) {
                // Initialize and warmup while user reads splash screen
                initializeNano().then(() => warmupNano());
            }
            
            // 3. If splash is not shown, initialize immediately
            if (!showSplash && nanoAvailable) {
                await initializeNano();
                await warmupNano();
            }

        } catch (e) {
            console.error(e);
            errorMsg = `Initialization Failed: ${e}`;
        }
    });

    async function initializeNano() {
        // Set up loading progress callback
        setLoadingProgressCallback((progress) => {
            modelLoadingState = progress;
            if (progress.state === 'ready') {
                isModelReady = true;
            }
        });

        // Start Nano Session (pre-warm) - this may trigger model download
        await createNanoSession();
        isModelReady = true; // Ensure ready after session created
    }

    function handleSplashClose() {
        showSplash = false;
        if (nanoAvailable) {
            initializeNano();
        }
    }

    async function initTrackerSystem() {
         if (isTracking) return;
         if (!videoElement || !canvasElement) return;

         try {
             canvasElement.width = videoElement.videoWidth;
             canvasElement.height = videoElement.videoHeight;

             await initializeTracker('nano-session');
             startTrackingLoop();
         } catch (e) {
             console.error("Tracker Init Failed:", e);
         }
    }

    /**
     * Request Wake Lock to prevent device sleep
     */
    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('[Nano] Wake Lock acquired');
                
                // Re-acquire wake lock if released (e.g., when tab becomes visible again)
                wakeLock.addEventListener('release', () => {
                    console.log('[Nano] Wake Lock was released');
                });
            } catch (err) {
                console.warn('[Nano] Wake Lock request failed:', err);
            }
        } else {
            console.warn('[Nano] Wake Lock API not supported');
        }
    }
    
    /**
     * Release Wake Lock
     */
    async function releaseWakeLock() {
        if (wakeLock) {
            try {
                await wakeLock.release();
                wakeLock = null;
                console.log('[Nano] Wake Lock released');
            } catch (err) {
                console.warn('[Nano] Wake Lock release failed:', err);
            }
        }
    }
    
    /**
     * Re-acquire Wake Lock when page becomes visible
     */
    function handleVisibilityChange() {
        if (document.visibilityState === 'visible' && isTracking) {
            requestWakeLock();
        }
    }

    function handleCameraReady() {
        console.log('[Nano] Camera ready, initializing tracker...');
        initTrackerSystem();
        
        // Acquire Wake Lock when camera starts
        requestWakeLock();
        
        // Listen for visibility changes to re-acquire wake lock
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Start analysis loop after a short delay to let tracker stabilize
        setTimeout(() => {
            console.log('[Nano] Starting analysis loop...');
            startAnalysisLoop();
        }, 1000);
    }

    onDestroy(() => {
        // Clear timers
        if (analysisTimeout) clearTimeout(analysisTimeout);
        if (trackingInterval) clearInterval(trackingInterval);
        
        isTracking = false;
        isAnalyzing = false;
        
        // Release Wake Lock
        releaseWakeLock();
        
        // Remove visibility change listener
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        
        disposeTracker();
        destroyNanoSession();
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }
        // End all active DB sessions (delete short ones)
        const now = Date.now();
        activeSessions.forEach((sessionData, uid) => {
            const duration = now - sessionData.startTime;
            if (duration >= MIN_SESSION_DURATION) {
                db.endSession(sessionData.sessionId);
            } else {
                // Session too short, delete it
                db.deleteSession(sessionData.sessionId);
                console.log(`[Nano] Deleted short session for ${uid} (${Math.round(duration)}ms)`);
            }
        });
    });

    /**
     * Cleanup sessions for users who have disappeared from tracking
     */
    function cleanupStaleSessions(currentTrackIds: Set<string>) {
        const now = Date.now();
        const toRemove: string[] = [];
        
        activeSessions.forEach((sessionData, uid) => {
            if (!currentTrackIds.has(uid)) {
                // User not in current frame
                const timeSinceLastSeen = now - sessionData.lastSeen;
                
                if (timeSinceLastSeen > SESSION_TIMEOUT) {
                    // Grace period expired
                    const sessionDuration = now - sessionData.startTime;
                    
                    if (sessionDuration >= MIN_SESSION_DURATION) {
                        db.endSession(sessionData.sessionId);
                        console.log(`[Nano] Ended session for ${uid} (${Math.round(sessionDuration/1000)}s)`);
                    } else {
                        db.deleteSession(sessionData.sessionId);
                        console.log(`[Nano] Deleted short session for ${uid} (${Math.round(sessionDuration)}ms)`);
                    }
                    
                    toRemove.push(uid);
                }
            }
        });
        
        // Remove from map
        toRemove.forEach(uid => activeSessions.delete(uid));
    }

    /**
     * Tracking loop using setInterval for background tab resilience
     * setInterval continues running (throttled to ~1s) when tab is inactive
     */
    function startTrackingLoop() {
        if (isTracking) return;
        isTracking = true;

        const TARGET_FPS = 8;  // Lower FPS to avoid Violation warnings
        const INTERVAL = 1000 / TARGET_FPS; // ~125ms
        
        let lastReport = performance.now();
        let frames = 0;
        let accumTime = 0;

        trackingInterval = setInterval(async () => {
            if (!isTracking) {
                if (trackingInterval) clearInterval(trackingInterval);
                return;
            }
            
            const start = performance.now();
            
            if (videoElement && videoElement.readyState >= 2) {
                await processFrame(videoElement);
            }
            
            const end = performance.now();
            const duration = end - start;
            
            // Performance Reporting
            frames++;
            accumTime += duration;
            if (end - lastReport >= 500) {
                const timeSpan = end - lastReport;
                const currentFps = (frames / timeSpan) * 1000;
                const avgTrackTime = accumTime / frames;
                
                performanceMetrics.update(m => ({
                    ...m,
                    fps: currentFps,
                    trackingTimeMs: avgTrackTime
                }));
                
                lastReport = end;
                frames = 0;
                accumTime = 0;
            }
        }, INTERVAL);
    }

    function startAnalysisLoop() {
        if (isAnalyzing) return;
        isAnalyzing = true;

        const loop = async () => {
            if (!isAnalyzing) return;
            const startTime = performance.now();

            try {
                // Get current tracks from store
                let currentTracksStore: any = {};
                const unsubscribe = trackingData.subscribe(d => currentTracksStore = d);
                unsubscribe();
                
                // Get values from the store object
                const currentTracks = Object.values(currentTracksStore) as any[];
                
                // Get IDs of currently matched tracks (for cleanup)
                // Include ALL UIDs the tracker still holds (not just matched in latest frame).
                // The tracker already manages its own gracePeriod for removing stale tracks,
                // so a track in the store = person still considered present.
                const currentTrackIds = new Set(
                    currentTracks
                        .filter((t: any) => t.id)
                        .map((t: any) => t.id.toString())
                );
                
                // Cleanup stale sessions (users who disappeared)
                cleanupStaleSessions(currentTrackIds);

                if (currentTracks.length > 0) {
                     // Filter valid tracks: must have ID and be confirmed (stable)
                     const validTracks = currentTracks.filter((t: any) => 
                         t.id && t.isConfirmed && t.matched
                     );

                     if (validTracks.length > 0) {
                        const now = Date.now();
                        
                        // 1. Manage Sessions - only for confirmed, matched tracks
                        for (const t of validTracks) {
                            const uid = t.id.toString();
                            if (!activeSessions.has(uid)) {
                                const newSessionId = generateID('long');
                                db.startSession(newSessionId);
                                activeSessions.set(uid, {
                                    sessionId: newSessionId,
                                    startTime: now,
                                    lastSeen: now
                                });
                                console.log(`[Nano] Starting new session for User ${uid}: ${newSessionId}`);
                            } else {
                                // Update lastSeen
                                const sessionData = activeSessions.get(uid)!;
                                sessionData.lastSeen = now;
                            }
                        }

                        // 2. Analyze with streaming
                        // Ensure video is ready
                         if (videoElement && videoElement.readyState >= 2) {
                            streamingText = ''; // Reset streaming text
                            
                            const analysisResponse = await analyzeFrameWithNanoStreaming(
                                videoElement, 
                                validTracks,
                                (partialText) => {
                                    // Update streaming text on each chunk
                                    streamingText = partialText;
                                }
                            );
                            
                            streamingText = ''; // Clear after complete
                            
                            const { results, prompt } = analysisResponse;
                            
                            // 3. Log Results with actual prompt - serialize structured data as JSON
                            for (const res of results) {
                                const sessionData = activeSessions.get(res.uid?.toString());
                                if (sessionData && res.uid) {
                                    // Build result object including only non-null/defined properties
                                    const resultObj: Record<string, any> = {};
                                    const fields = ['age','sex','fashion','emotion','action','direction','accessories','posture'];
                                    for (const f of fields) {
                                        // Include value if it's not null or undefined
                                        if (res[f] !== null && typeof res[f] !== 'undefined') {
                                            resultObj[f] = res[f];
                                        }
                                    }
                                    const resultJson = JSON.stringify(resultObj);
                                    await db.addAnalysisLog(sessionData.sessionId, res.uid.toString(), prompt, resultJson);
                                    // Trigger hourly aggregation check
                                    checkAndTriggerAggregation();
                                }
                            }
                            
                            // Update local results for UI
                            recentResults = results;
                            
                            // Append to history - group all results per frame (like captions on main page)
                            if (results.length > 0) {
                                const timestamp = new Date().toLocaleTimeString();
                                resultsHistory = [
                                    { results, timestamp },
                                    ...resultsHistory.slice(0, 9) // Keep last 10 entries
                                ];
                            }
                         }
                     }
                }

            } catch (err) {
                console.error("Analysis loop error:", err);
            }

            const duration = performance.now() - startTime;
            processingTime = Math.round(duration);

            // Continue immediately after completion using setTimeout
            // setTimeout continues running when tab is inactive (unlike rAF)
            if (isAnalyzing) {
                analysisTimeout = setTimeout(loop, 0);
            }
        };

        loop();
    }
</script>

{#if showSplash}
    <SplashScreen 
        {isMobile} 
        {isSafari} 
        {nanoAvailable}
        on:close={handleSplashClose}
    />
{/if}

<div class="nano-page" class:hidden={showSplash}>
    <!-- Header / Status -->
    <header class="nano-header">
        <div class="header-content">
            <div class="header-left">
                <h1 class="nano-title">
                    <span class="title-accent">Nano Parrot</span>
                    <span class="title-sub">🦜</span>
                </h1>
                <div class="status-bar">
                    <span class="status-item" class:online={nanoAvailable} class:offline={!nanoAvailable}>
                        <span class="status-dot"></span>
                        PROMPT API: {nanoAvailable ? 'ONLINE' : 'OFFLINE'}
                    </span>
                    <span class="status-item" class:online={isModelReady} class:loading={modelLoadingState.state === 'downloading' || modelLoadingState.state === 'creating'}>
                        <span class="status-dot" class:pulse={modelLoadingState.state === 'downloading' || modelLoadingState.state === 'creating'}></span>
                        {#if modelLoadingState.state === 'downloading'}
                            MODEL: DOWNLOADING {modelLoadingState.percent}%
                        {:else if modelLoadingState.state === 'creating'}
                            MODEL: INITIALIZING...
                        {:else if isModelReady}
                            MODEL: READY
                        {:else}
                            MODEL: WAITING
                        {/if}
                    </span>
                </div>
                {#if errorMsg}
                    <div class="error-banner">
                        {errorMsg}
                    </div>
                {/if}
            </div>
            
            <div class="header-actions">
                <button class="settings-btn" on:click={() => showSettings = true} title="Analysis Settings">
                    ⚙️
                </button>
                <a href="{base}/logs" class="logs-link" on:click|preventDefault={() => {
                    const win = window.open(`${base}/logs`, 'nano_parrot_logs');
                    if (win) win.focus();
                }}>
                    View Logs
                </a>
            </div>
        </div>
    </header>

    <!-- Main Content Area -->
    <main class="nano-main">
        <!-- Viewfinder -->
        <div class="viewfinder-section">
            <ViewFinder 
                bind:videoElement 
                bind:viewFinderCanvas={canvasElement} 
                isCapturing={!showSplash}
                {processingTime}
                isStreaming={streamingText.length > 0}
                on:camera-ready={handleCameraReady}
            />
        </div>

        <!-- Results Feed -->
        <aside class="results-section">
            <ResultsDisplay history={resultsHistory} {isAnalyzing} {streamingText} />
        </aside>
    </main>
</div>

<!-- Analysis Settings Modal -->
<AnalysisSettings bind:isOpen={showSettings} />

<style>
    .nano-page {
        display: flex;
        flex-direction: column;
        height: 100vh;
        width: 100%;
        background-color: var(--bg-primary);
        overflow: hidden;
        font-family: 'Söhne', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .nano-page.hidden {
        display: none;
    }

    .nano-header {
        background-color: var(--bg-secondary);
        border-bottom: var(--border-width) var(--border-style) var(--border-color);
        padding: 16px 24px;
        z-index: 20;
    }

    .header-content {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
    }

    .header-left {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .nano-title {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin: 0;
    }

    .title-accent {
        font-size: 22px;
        font-weight: 700;
        background: linear-gradient(135deg, var(--light-purple) 0%, var(--orange) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        letter-spacing: -0.02em;
    }

    .title-sub {
        font-size: 16px;
        font-weight: 400;
        color: var(--text-secondary);
    }

    .header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .settings-btn {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        font-size: 18px;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .settings-btn:hover {
        background: rgba(171, 104, 255, 0.2);
        border-color: var(--light-purple);
    }

    .status-bar {
        display: flex;
        align-items: center;
        gap: 16px;
        font-size: 12px;
        font-family: monospace;
    }

    .status-item {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--text-secondary);
    }

    .status-item.online {
        color: var(--light-purple);
    }

    .status-item.offline {
        color: var(--orange);
    }

    .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: var(--text-secondary);
    }

    .status-item.online .status-dot {
        background-color: var(--light-purple);
        box-shadow: 0 0 6px var(--light-purple);
    }

    .status-item.offline .status-dot {
        background-color: var(--orange);
    }

    .status-item.loading {
        color: #f0b429;
    }

    .status-item.loading .status-dot {
        background-color: #f0b429;
    }

    .status-dot.pulse {
        animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(1.2); }
    }

    .error-banner {
        margin-top: 8px;
        padding: 8px 12px;
        background-color: var(--orange-10);
        border: 1px solid var(--orange-50);
        border-radius: 6px;
        font-size: 13px;
        color: var(--orange);
    }

    .logs-link {
        padding: 8px 16px;
        background-color: var(--light-purple-30);
        border: 1px solid var(--light-purple-50);
        border-radius: 6px;
        color: var(--text-primary);
        font-size: 12px;
        font-weight: 600;
        text-decoration: none;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        transition: all 0.2s ease;
    }

    .logs-link:hover {
        background-color: var(--light-purple-50);
        border-color: var(--light-purple);
    }

    .nano-main {
        flex: 1;
        display: flex;
        gap: 24px;
        padding: 24px;
        min-height: 0;
        overflow: hidden;
    }

    .viewfinder-section {
        flex: 2;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .results-section {
        flex: 1;
        min-width: 300px;
        max-width: 400px;
        display: flex;
        flex-direction: column;
    }

    @media (max-width: 1024px) {
        .nano-main {
            flex-direction: column;
        }

        .results-section {
            max-width: none;
            max-height: 300px;
        }
    }

    @media (max-width: 768px) {
        .nano-header {
            padding: 12px 16px;
        }

        .header-content {
            flex-direction: column;
            gap: 12px;
        }

        .logs-link {
            align-self: flex-start;
        }

        .nano-main {
            padding: 16px;
            gap: 16px;
        }

        .status-bar {
            flex-wrap: wrap;
            gap: 8px;
        }
    }
</style>