<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  export let isMobile = false;
  export let isSafari = false;
  export let nanoAvailable = false;

  const dispatch = createEventDispatcher();

  let loadingCanvas: HTMLCanvasElement;
  let loadingDots: any[] = [];
  let animationId: number;

  onMount(() => {
    startLoadingAnimation();
  });

  onDestroy(() => {
    if (animationId) cancelAnimationFrame(animationId);
  });

  function startLoadingAnimation() {
      if (!loadingCanvas) return;
      const ctx = loadingCanvas.getContext('2d');
      if (!ctx) return;

      loadingCanvas.width = window.innerWidth;
      loadingCanvas.height = window.innerHeight;

      // Create dots with purple/orange gradient colors
      const numDots = Math.floor((loadingCanvas.width * loadingCanvas.height) / 12000);
      loadingDots = [];
      for (let i = 0; i < numDots; i++) {
          const isPurple = Math.random() > 0.3;
          loadingDots.push({
              x: Math.random() * loadingCanvas.width,
              y: Math.random() * loadingCanvas.height,
              radius: Math.random() * 2 + 0.5,
              speed: Math.random() * 0.4 + 0.1,
              opacity: Math.random() * 0.6 + 0.2,
              blur: Math.random() > 0.7 ? Math.random() * 2 + 1 : 0,
              color: isPurple ? 'rgba(171, 104, 255,' : 'rgba(255, 149, 0,'
          });
      }

      function animate() {
          ctx!.clearRect(0, 0, loadingCanvas.width, loadingCanvas.height);
          
          loadingDots.forEach(dot => {
              dot.y += dot.speed;
              if (dot.y > loadingCanvas.height) {
                  dot.y = 0 - dot.radius;
                  dot.x = Math.random() * loadingCanvas.width;
              }
              
              ctx!.beginPath();
              ctx!.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
              ctx!.fillStyle = `${dot.color} ${dot.opacity})`;
              if (dot.blur > 0) ctx!.filter = `blur(${dot.blur}px)`;
              ctx!.fill();
              ctx!.filter = 'none';
          });
          
          animationId = requestAnimationFrame(animate);
      }
      animate();

      const handleResize = () => {
         if (loadingCanvas) {
             loadingCanvas.width = window.innerWidth;
             loadingCanvas.height = window.innerHeight;
         }
      };
      window.addEventListener('resize', handleResize);
  }

  function enterApp() {
      sessionStorage.setItem('hasExplored', 'true');
      dispatch('close');
  }
</script>

<div id="loading-screen" class="loading-screen">
    <canvas bind:this={loadingCanvas} class="loading-canvas"></canvas>
    <div class="loading-vignette"></div>
    
    <div class="loading-content">
        <div class="loading-header">
            <span class="parrot-emoji">🦜</span>
        </div>
        
        <div class="loading-title-section">
            <h1 class="loading-title">NANO PARROT</h1>
            <p class="loading-subtitle">Real-time Vision Analysis with Gemini Nano</p>
        </div>
        
        <div class="loading-description">
            <p>This demo showcases real-time person tracking and analysis using Chrome's built-in Prompt API (Gemini Nano).</p>
            <p>Everything runs entirely in your browser - no data is sent to any server.</p>
        </div>

        <div class="feature-list">
            <div class="feature-item">
                <span class="feature-icon">👁️</span>
                <span>Real-time person detection & tracking</span>
            </div>
            <div class="feature-item">
                <span class="feature-icon">🧠</span>
                <span>On-device AI analysis with Gemini Nano</span>
            </div>
            <div class="feature-item">
                <span class="feature-icon">🔒</span>
                <span>100% private - all processing is local</span>
            </div>
        </div>
        
        {#if isMobile}
            <div class="warning-box mobile-warning">
                <div class="warning-title">📱 Mobile Device Detected</div>
                <p>This demo requires a desktop browser with Chrome 128+ and experimental flags enabled.</p>
            </div>
        {/if}

        {#if isSafari}
            <div class="warning-box safari-warning">
                <div class="warning-title">🧭 Safari Not Supported</div>
                <p>Please use Chrome 128+ with Prompt API flags enabled.</p>
            </div>
        {/if}

        {#if !nanoAvailable && !isMobile && !isSafari}
            <div class="warning-box api-warning">
                <div class="warning-title">⚠️ Prompt API Not Available</div>
                <p>Enable the following Chrome flags:</p>
                <code>chrome://flags/#prompt-api-for-gemini-nano</code>
                <code>chrome://flags/#optimization-guide-on-device-model</code>
            </div>
        {/if}

        <div class="loading-action-section">
            {#if !isMobile && !isSafari}
                <button 
                    class="loading-explore-button" 
                    class:disabled={!nanoAvailable}
                    on:click={enterApp}
                    disabled={!nanoAvailable}
                >
                    <span>{nanoAvailable ? 'Start Tracking 🦜' : 'API Required'}</span>
                </button>
            {/if}
        </div>

        <div class="requirements">
            <p>Requires: Chrome 138+ with Prompt API enabled</p>
        </div>
    </div>
</div>

<style>
    .loading-screen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 50%, #16213e 100%);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .loading-canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
    }

    .loading-vignette {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.6) 100%);
        pointer-events: none;
    }

    .loading-content {
        position: relative;
        z-index: 10;
        text-align: center;
        max-width: 600px;
        padding: 40px;
    }

    .loading-header {
        display: flex;
        justify-content: center;
        align-items: center;
        margin-bottom: 24px;
    }

    .parrot-emoji {
        font-size: 120px;
        animation: float 3s ease-in-out infinite;
    }

    @keyframes float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-10px); }
    }

    .loading-title-section {
        margin-bottom: 24px;
    }

    .loading-title {
        font-size: 48px;
        font-weight: 800;
        background: linear-gradient(135deg, #ab68ff 0%, #ff9500 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        letter-spacing: 0.05em;
        margin: 0 0 12px 0;
    }

    .loading-subtitle {
        font-size: 18px;
        color: rgba(255, 255, 255, 0.7);
        margin: 0;
        font-weight: 400;
    }

    .loading-description {
        margin-bottom: 32px;
    }

    .loading-description p {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.6);
        line-height: 1.6;
        margin: 0 0 8px 0;
    }

    .feature-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 32px;
        text-align: left;
    }

    .feature-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .feature-icon {
        font-size: 20px;
    }

    .feature-item span:last-child {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.8);
    }

    .warning-box {
        padding: 16px 20px;
        border-radius: 8px;
        margin-bottom: 24px;
        text-align: left;
    }

    .warning-title {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 8px;
    }

    .warning-box p {
        font-size: 13px;
        margin: 0;
        line-height: 1.5;
    }

    .warning-box code {
        display: block;
        margin-top: 8px;
        padding: 8px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 4px;
        font-size: 11px;
        font-family: monospace;
        word-break: break-all;
    }

    .mobile-warning,
    .safari-warning,
    .api-warning {
        background: rgba(255, 149, 0, 0.15);
        border: 1px solid rgba(255, 149, 0, 0.3);
        color: #ff9500;
    }

    .loading-action-section {
        margin-bottom: 24px;
    }

    .loading-explore-button {
        padding: 16px 48px;
        font-size: 18px;
        font-weight: 700;
        background: linear-gradient(135deg, #ab68ff 0%, #ff9500 100%);
        border: none;
        border-radius: 12px;
        color: white;
        cursor: pointer;
        transition: all 0.3s ease;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .loading-explore-button:hover:not(.disabled) {
        transform: scale(1.05);
        box-shadow: 0 8px 32px rgba(171, 104, 255, 0.4);
    }

    .loading-explore-button.disabled {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.4);
        cursor: not-allowed;
    }

    .requirements {
        margin-top: 16px;
    }

    .requirements p {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.4);
        margin: 0;
    }

    @media (max-width: 768px) {
        .loading-content {
            padding: 24px;
        }

        .parrot-emoji {
            font-size: 80px;
        }

        .loading-title {
            font-size: 32px;
        }

        .loading-subtitle {
            font-size: 14px;
        }

        .loading-explore-button {
            padding: 14px 32px;
            font-size: 16px;
        }
    }
</style>
