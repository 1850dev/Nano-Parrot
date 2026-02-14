<script lang="ts">
  import { getLatestHourSummarizedSessions, type SummarizedSession } from '$lib/dexieDb';

  // State
  type InsightState = 'idle' | 'loading' | 'done' | 'error' | 'no-data';
  let state: InsightState = 'idle';
  let insightText = '';
  let hourLabel = '';
  let visitorCount = 0;
  let errorMessage = '';

  // =============================================
  // Stats Pre-processing
  // =============================================

  interface HourlyStats {
    hour: string;
    visitorCount: number;
    avgDuration: number;
    topDemographic: string;
    trendStyle: string;
  }

  function buildStats(sessions: SummarizedSession[], hourStart: number, hourEnd: number): HourlyStats {
    const startDate = new Date(hourStart);
    const endDate = new Date(hourEnd);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const hour = `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}-${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;

    const count = sessions.length;

    const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
    const avgDuration = count > 0 ? Math.round(totalDuration / count) : 0;

    const demoCounts = new Map<string, number>();
    for (const s of sessions) {
      if (s.gender && s.age_group && s.gender !== 'unknown' && s.age_group !== 'unknown') {
        const key = `${s.gender} ${s.age_group}`;
        demoCounts.set(key, (demoCounts.get(key) ?? 0) + 1);
      }
    }
    let topDemographic = 'Unknown';
    let maxDemoCount = 0;
    for (const [key, c] of demoCounts) {
      if (c > maxDemoCount) { maxDemoCount = c; topDemographic = key; }
    }

    const fashionTotals = new Map<string, number>();
    for (const s of sessions) {
      try {
        const map: Record<string, number> = JSON.parse(s.fashion_style);
        for (const [term, freq] of Object.entries(map)) {
          fashionTotals.set(term, (fashionTotals.get(term) ?? 0) + freq);
        }
      } catch { /* skip */ }
    }
    let trendStyle = 'Unknown';
    let maxFashionCount = 0;
    for (const [term, c] of fashionTotals) {
      if (c > maxFashionCount) { maxFashionCount = c; trendStyle = term; }
    }

    return { hour, visitorCount: count, avgDuration, topDemographic, trendStyle };
  }

  // =============================================
  // Prompt — all-in-one (no systemPrompt)
  // =============================================

  function buildPrompt(stats: HourlyStats): string {
    return `あなたは陽気なオウムの店舗分析エージェント「Nano Parrot」です。

【絶対ルール】
- 全ての文の語尾を必ず「だッピ！🦜」「だッピね！」「だッピよ！」のいずれかにすること。
- 日本語で3〜4文だけ書くこと。それ以上書かないこと。
- 箇条書き・見出し・マークダウンは使わないこと。
- 個人を特定する情報は含めないこと。

【出力例】
入力: {"hour":"14:00-15:00","visitorCount":10,"avgDuration":90,"topDemographic":"female 30s","trendStyle":"casual"}
出力: 14時台は10人のお客さんが来てくれたッピ！🦜 30代女性がメインで、カジュアルスタイルが人気だッピね！ 平均滞在90秒だから、もう少しゆっくりしてもらえる工夫があるといいッピよ！

【タスク】
以下のデータを見て、店長への総括コメントを生成してください。
データ: ${JSON.stringify(stats)}

コメント:`;
  }

  // =============================================
  // AI Inference — isolated text-only session
  // =============================================

  function getLanguageModel() {
    if (typeof window === 'undefined') return null;
    if ('ai' in window && 'languageModel' in (window as any).ai) {
      return (window as any).ai.languageModel;
    }
    if ('LanguageModel' in window) {
      return (window as any).LanguageModel;
    }
    return null;
  }

  async function generateWithNano(prompt: string): Promise<string> {
    const lm = getLanguageModel();
    if (!lm) throw new Error('Gemini Nano is not available.');

    // Create a lightweight text-only session (no systemPrompt, no image input)
    // This avoids conflicting with the main VLM session on +page.svelte
    const insightSession = await lm.create({
      expectedInputs: [{ type: 'text' }],
    });

    try {
      const result = await insightSession.prompt(prompt);
      return result;
    } finally {
      insightSession.destroy();
    }
  }

  // =============================================
  // Main entry point
  // =============================================

  export async function generateHourlyInsight(): Promise<void> {
    if (state === 'loading') return;

    state = 'loading';
    insightText = '';
    errorMessage = '';

    try {
      const data = await getLatestHourSummarizedSessions();
      if (!data || data.sessions.length === 0) {
        state = 'no-data';
        return;
      }

      const stats = buildStats(data.sessions, data.hourStart, data.hourEnd);
      hourLabel = stats.hour;
      visitorCount = stats.visitorCount;

      const prompt = buildPrompt(stats);

      // Run in background to avoid blocking UI
      let result: string;
      if (typeof scheduler !== 'undefined' && typeof scheduler.postTask === 'function') {
        result = await scheduler.postTask(() => generateWithNano(prompt), { priority: 'background' });
      } else {
        result = await generateWithNano(prompt);
      }

      insightText = result;
      state = 'done';
    } catch (e: any) {
      console.error('[ParrotInsight] Error:', e);
      errorMessage = e.message || 'Failed to generate insight';
      state = 'error';
    }
  }

  // Don't auto-generate on mount — let the user trigger it
  // to avoid conflicting with the main analysis session
</script>

<div class="parrot-insight" class:loading={state === 'loading'} class:done={state === 'done'} class:error={state === 'error'}>
  <!-- Parrot Avatar -->
  <div class="parrot-avatar">
    <span class="parrot-emoji">🦜</span>
    {#if state === 'loading'}
      <div class="parrot-pulse"></div>
    {/if}
  </div>

  <!-- Speech Bubble -->
  <div class="speech-bubble">
    <div class="bubble-header">
      <span class="bubble-title">Parrot's Insight</span>
      {#if hourLabel}
        <span class="bubble-badge">{hourLabel}</span>
      {/if}
      {#if visitorCount > 0}
        <span class="bubble-badge visitor">{visitorCount} visitors</span>
      {/if}
      <button
        class="refresh-btn"
        on:click={generateHourlyInsight}
        disabled={state === 'loading'}
        title="Regenerate insight"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class:spinning={state === 'loading'}>
          <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>
        </svg>
      </button>
    </div>

    <div class="bubble-body">
      {#if state === 'idle'}
        <button class="generate-btn" on:click={generateHourlyInsight}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          Generate Insight
        </button>
      {:else if state === 'loading'}
        <div class="typing-indicator">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="typing-label">Analyzing data...</span>
        </div>
      {:else if state === 'no-data'}
        <p class="no-data-msg">集約データがまだないッピ！🦜 まずは「Nano Parrot」でデータを集めてほしいッピね！</p>
      {:else if state === 'error'}
        <p class="error-msg">エラーが起きたッピ... 😢 {errorMessage}</p>
      {:else if state === 'done'}
        <p class="insight-text">{insightText}</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .parrot-insight {
    display: flex;
    gap: 16px;
    padding: 20px 24px;
    background: linear-gradient(135deg, rgba(124, 58, 237, 0.06), rgba(74, 222, 128, 0.06));
    border: 1px solid rgba(124, 58, 237, 0.15);
    border-radius: 16px;
    margin: 0;
    transition: all 0.3s ease;
  }

  .parrot-insight.done {
    border-color: rgba(74, 222, 128, 0.25);
    background: linear-gradient(135deg, rgba(124, 58, 237, 0.04), rgba(74, 222, 128, 0.08));
  }

  .parrot-insight.error {
    border-color: rgba(220, 38, 38, 0.25);
    background: linear-gradient(135deg, rgba(220, 38, 38, 0.06), rgba(220, 38, 38, 0.02));
  }

  /* Parrot Avatar */
  .parrot-avatar {
    position: relative;
    flex-shrink: 0;
    width: 52px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(124, 58, 237, 0.12);
    border-radius: 50%;
    border: 2px solid rgba(124, 58, 237, 0.25);
  }

  .parrot-emoji {
    font-size: 1.6rem;
    animation: parrot-bob 2s ease-in-out infinite;
  }

  @keyframes parrot-bob {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    25% { transform: translateY(-2px) rotate(-3deg); }
    75% { transform: translateY(1px) rotate(2deg); }
  }

  .parrot-pulse {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 2px solid rgba(74, 222, 128, 0.4);
    animation: pulse-ring 1.5s ease-out infinite;
  }

  @keyframes pulse-ring {
    0% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1.3); opacity: 0; }
  }

  /* Speech Bubble */
  .speech-bubble {
    flex: 1;
    min-width: 0;
    position: relative;
  }

  .speech-bubble::before {
    content: '';
    position: absolute;
    left: -10px;
    top: 18px;
    width: 0;
    height: 0;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-right: 10px solid rgba(124, 58, 237, 0.15);
  }

  .bubble-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .bubble-title {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(124, 58, 237, 0.8);
  }

  .bubble-badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(124, 58, 237, 0.1);
    color: rgba(167, 139, 250, 0.9);
    border: 1px solid rgba(124, 58, 237, 0.2);
  }

  .bubble-badge.visitor {
    background: rgba(74, 222, 128, 0.1);
    color: rgb(74, 222, 128);
    border-color: rgba(74, 222, 128, 0.2);
  }

  .refresh-btn {
    margin-left: auto;
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 4px 6px;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
  }

  .refresh-btn:hover:not(:disabled) {
    color: rgba(255, 255, 255, 0.7);
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.05);
  }

  .refresh-btn:disabled {
    cursor: not-allowed;
    opacity: 0.3;
  }

  .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Bubble Body */
  .bubble-body {
    font-size: 0.92rem;
    line-height: 1.65;
    color: rgba(255, 255, 255, 0.85);
  }

  .insight-text {
    margin: 0;
    white-space: pre-wrap;
  }

  .no-data-msg {
    margin: 0;
    color: rgba(255, 255, 255, 0.5);
    font-style: italic;
  }

  .error-msg {
    margin: 0;
    color: #fca5a5;
    font-size: 0.85rem;
  }

  /* Generate Button */
  .generate-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border: 1px solid rgba(74, 222, 128, 0.3);
    border-radius: 8px;
    background: rgba(74, 222, 128, 0.1);
    color: rgb(74, 222, 128);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .generate-btn:hover {
    background: rgba(74, 222, 128, 0.2);
    border-color: rgba(74, 222, 128, 0.5);
  }

  /* Typing Indicator */
  .typing-indicator {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgba(124, 58, 237, 0.5);
    animation: typing-bounce 1.4s ease-in-out infinite;
  }

  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes typing-bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-6px); opacity: 1; }
  }

  .typing-label {
    margin-left: 8px;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.35);
    font-style: italic;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .parrot-insight {
      padding: 14px 16px;
      gap: 12px;
    }

    .parrot-avatar {
      width: 40px;
      height: 40px;
    }

    .parrot-emoji {
      font-size: 1.2rem;
    }

    .bubble-body {
      font-size: 0.85rem;
    }
  }
</style>
