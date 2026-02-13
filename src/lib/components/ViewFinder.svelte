<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { trackingData } from '$lib/stores';
  import { get } from 'svelte/store';
  import NanoPerformanceMonitor from './PerformanceMonitor.svelte';

  // Nano用ViewFinder - コントロールなし、自動スタート
  export let videoElement: HTMLVideoElement;
  export let viewFinderCanvas: HTMLCanvasElement;
  export let isCapturing = false;
  
  // Performance props from parent
  export let processingTime = 0;
  export let isStreaming = false;

  const dispatch = createEventDispatcher();

  let liveCaptionStream: MediaStream | null = null;
  let renderLoopRunning = false;

  // React to isCapturing prop change
  $: if (isCapturing && !liveCaptionStream) {
      startCamera();
  } else if (!isCapturing && liveCaptionStream) {
      stopCamera();
  }

  onDestroy(() => {
      stopCamera();
  });

  async function startCamera() {
      try {
          // Standard webcam resolution (16:9)
          // Prompt API accepts HTMLVideoElement directly, no specific resolution requirement
          const constraints: MediaStreamConstraints = {
              video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 15, max: 30 }
              } 
          };

          liveCaptionStream = await navigator.mediaDevices.getUserMedia(constraints);
          
          if (videoElement) {
              videoElement.srcObject = liveCaptionStream;
              
              // Wait for video to be ready
              await new Promise<void>((resolve) => {
                  videoElement.onloadeddata = () => {
                      videoElement.play();
                      resolve();
                  }
                  if (videoElement.readyState >= 2) {
                      videoElement.play();
                      resolve();
                  }
              });

              // Give it a moment to stabilize
              await new Promise(r => setTimeout(r, 500));
              
              // Start the render loop
              runRenderLoop();
              
              dispatch('camera-ready');
          }
      } catch (e) {
          console.error("Camera error:", e);
          alert('Could not access webcam. Please check permissions.');
      }
  }

  function stopCamera() {
      if (liveCaptionStream) {
          liveCaptionStream.getTracks().forEach(t => t.stop());
          liveCaptionStream = null;
      }
      if (videoElement) {
          videoElement.srcObject = null;
      }
      renderLoopRunning = false;
  }

  function runRenderLoop() {
      if (!isCapturing || renderLoopRunning) return;
      renderLoopRunning = true;

      const loop = () => {
          if (!isCapturing) {
              renderLoopRunning = false;
              return;
          }
          
          if (videoElement && viewFinderCanvas && videoElement.readyState >= 2) {
              const ctx = viewFinderCanvas.getContext('2d');
              if (ctx) {
                  // Ensure canvas size matches video size
                  if (viewFinderCanvas.width !== videoElement.videoWidth || 
                      viewFinderCanvas.height !== videoElement.videoHeight) {
                      viewFinderCanvas.width = videoElement.videoWidth || 1280;
                      viewFinderCanvas.height = videoElement.videoHeight || 720;
                  }

                  const w = viewFinderCanvas.width;
                  const h = viewFinderCanvas.height;

                  // 1. Draw Video (Mirrored)
                  ctx.save();
                  ctx.translate(w, 0);
                  ctx.scale(-1, 1);
                  ctx.drawImage(videoElement, 0, 0, w, h);
                  ctx.restore();

                  // 2. Draw Tracks
                  const tracks = get(trackingData);
                  const trackList = Object.values(tracks);
                  
                  if (trackList.length > 0) {
                      ctx.lineWidth = 4;
                      ctx.strokeStyle = '#FF5F1E'; // var(--orange)
                      ctx.fillStyle = '#FF5F1E';
                      ctx.font = 'bold 24px Arial';
                      
                      trackList.forEach((track: any) => {
                          if (!track.matched) return;
                          
                          // Calculate Mirrored Coordinates
                          const nx = track.bbox[0];
                          const ny = track.bbox[1];
                          const nw = track.bbox[2];
                          const nh = track.bbox[3];

                          const bx = (1 - nx - nw) * w;
                          const by = ny * h;
                          const bw = nw * w;
                          const bh = nh * h;
                          
                          ctx.strokeRect(bx, by, bw, bh);
                          ctx.fillText(track.id, bx, Math.max(by - 10, 24));
                      });
                  }
              }
          }
          requestAnimationFrame(loop);
      }
      loop();
  }
</script>

<div class="viewfinder-container">
    <!-- Performance Monitor (Top-Left) -->
    <div class="performance-overlay">
        <NanoPerformanceMonitor {processingTime} {isStreaming} />
    </div>
    
    <div class="viewfinder-wrapper">
        <!-- Hidden Video Element -->
        <video bind:this={videoElement} autoplay muted playsinline style="display: none;"></video>
        
        <!-- Canvas ViewFinder -->
        <canvas bind:this={viewFinderCanvas} style="width: 100%; height: 100%; object-fit: contain;"></canvas>

        {#if !isCapturing}
          <div class="inactive-overlay">
              <span>Camera Inactive</span>
          </div>
        {/if}
    </div>
</div>

<style>
    .viewfinder-container {
        position: relative;
        background-color: var(--bg-primary);
        border-radius: 12px;
        overflow: hidden;
        border: var(--border-width) var(--border-style) var(--border-color);
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    .performance-overlay {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 10;
    }

    .viewfinder-wrapper {
        flex: 1;
        position: relative;
        aspect-ratio: 16 / 9;
        background-color: var(--bg-secondary);
    }

    .inactive-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--black-70);
        backdrop-filter: blur(4px);
        z-index: 20;
        color: var(--text-secondary);
        font-size: 14px;
    }
</style>
