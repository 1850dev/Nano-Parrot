<script lang="ts">
  import { performanceMetrics, trackingData } from '$lib/stores';
  
  // Props from parent (Nano-specific metrics)
  export let processingTime = 0;
  export let isStreaming = false;
  
  // Derived from stores
  $: fps = $performanceMetrics.fps.toFixed(1);
  $: tracking = $performanceMetrics.trackingTimeMs ? $performanceMetrics.trackingTimeMs.toFixed(1) : '0.0';
  $: trackCount = Object.keys($trackingData).length;
  $: activeCount = Object.values($trackingData).filter((t: any) => t.matched).length;
</script>

<div class="nano-performance-monitor">
  <!-- Track Status -->
  <div class="metric-row highlight">
    <span class="metric-label">TRACKS</span>
    <span class="metric-value track-value">{activeCount}/{trackCount}</span>
  </div>

  <div class="divider"></div>

  <!-- FPS -->
  <div class="metric-row">
    <span class="metric-label">FPS</span>
    <span class="metric-value fps-value">{fps}</span>
  </div>

  <!-- Tracker -->
  <div class="metric-row">
    <span class="metric-label">TRACK</span>
    <span class="metric-value track-time">{tracking}ms</span>
  </div>

  <!-- Nano Processing -->
  <div class="metric-row" class:streaming={isStreaming}>
    <span class="metric-label">NANO</span>
    <span class="metric-value nano-time">
      {#if isStreaming}
        <span class="streaming-indicator"></span>
      {/if}
      {processingTime}ms
    </span>
  </div>
</div>

<style>
  .nano-performance-monitor {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background-color: var(--black-70);
    backdrop-filter: blur(12px);
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 11px;
    font-family: 'SF Mono', 'Consolas', monospace;
    color: var(--text-secondary);
    pointer-events: none;
    user-select: none;
    min-width: 100px;
    border: 1px solid var(--white-10);
  }

  .metric-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .metric-row.highlight {
    padding-bottom: 4px;
  }

  .metric-label {
    color: var(--text-secondary);
    font-weight: 500;
    letter-spacing: 0.05em;
  }

  .metric-value {
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .track-value {
    color: var(--orange);
    font-size: 14px;
  }

  .fps-value {
    color: #4ade80; /* green-400 */
  }

  .track-time {
    color: #22d3ee; /* cyan-400 */
  }

  .nano-time {
    color: var(--light-purple);
  }

  .metric-row.streaming .nano-time {
    color: var(--orange);
  }

  .streaming-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--orange);
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .divider {
    height: 1px;
    background-color: var(--white-10);
    margin: 2px 0;
  }
</style>
