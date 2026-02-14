<script lang="ts">
    import { slide } from 'svelte/transition';
    import type { NanoAnalysisResult } from '$lib/main';

    // History: one entry per analysis frame, containing all detected persons
    export let history: Array<{results: NanoAnalysisResult[], timestamp: string}> = [];
    export let isAnalyzing = false;
    export let streamingText = '';
    export let annotatedImageUrl: string = '';
</script>

<div class="results-container">
    <div class="results-header">
        <h2 class="results-title">
            <span class="status-dot" class:active={isAnalyzing}></span>
            Analysis Feed
        </h2>
        <span class="results-count">{history.length} frames</span>
    </div>
    
    <div class="results-list">
        <!-- Annotated Image Preview (what AI sees) -->
        {#if annotatedImageUrl}
            <div class="annotated-preview">
                <div class="preview-header">
                    <span class="preview-label">📷 AI Input Preview</span>
                </div>
                <img src={annotatedImageUrl} alt="Annotated frame sent to AI" class="preview-image" />
            </div>
        {/if}

        <!-- Streaming Output (Live Generation) -->
        {#if streamingText}
            <div class="result-item streaming" in:slide|local={{ duration: 200 }}>
                <div class="result-item-header">
                    <span class="uid-badge streaming">GENERATING</span>
                    <span class="timestamp live">
                        <span class="cursor-blink">|</span>
                    </span>
                </div>
                <p class="description streaming-text">
                    {streamingText}
                </p>
            </div>
        {/if}

        {#if history.length === 0 && !streamingText}
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" class="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Waiting for analysis...</span>
            </div>
        {:else}
            <!-- History: Each entry is one frame with multiple persons -->
            {#each history as frame, i (frame.timestamp + i)}
                <div 
                    class="result-item {i === 0 ? 'latest' : 'history'}"
                    style="opacity: {Math.max(0.2, 1.0 - (i * 0.12))}"
                    in:slide|local={{ duration: 200 }}
                >
                    <div class="result-item-header">
                        <span class="uid-badge {i === 0 ? '' : 'history'}">
                            {frame.results.length} person{frame.results.length !== 1 ? 's' : ''}
                        </span>
                        <span class="timestamp">{frame.timestamp}</span>
                    </div>
                    
                    <!-- All persons in this frame -->
                    <div class="frame-results">
                        {#each frame.results as person}
                            <div class="person-result">
                                <span class="person-uid">{person.uid}</span>
                                <div class="person-details">
                                    {#if person.age}
                                        <span class="detail-tag age">{person.age}</span>
                                    {/if}
                                    {#if person.sex}
                                        <span class="detail-tag sex">{person.sex}</span>
                                    {/if}
                                    {#if person.fashion}
                                        <span class="detail-tag fashion">{person.fashion}</span>
                                    {/if}
                                    {#if person.emotion}
                                        <span class="detail-tag emotion">{person.emotion}</span>
                                    {/if}
                                    {#if person.action}
                                        <span class="detail-tag action">{person.action}</span>
                                    {/if}
                                    {#if person.direction}
                                        <span class="detail-tag direction">{person.direction}</span>
                                    {/if}
                                    {#if person.accessories}
                                        <span class="detail-tag accessories">{person.accessories}</span>
                                    {/if}
                                    {#if person.posture}
                                        <span class="detail-tag posture">{person.posture}</span>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</div>

<style>
    .results-container {
        background-color: var(--bg-secondary);
        border-radius: 12px;
        overflow: hidden;
        border: var(--border-width) var(--border-style) var(--border-color);
        display: flex;
        flex-direction: column;
        height: 100%;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
    }

    .results-header {
        padding: 12px 16px;
        background-color: var(--bg-primary);
        border-bottom: var(--border-width) var(--border-style) var(--border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
        position: sticky;
        top: 0;
        z-index: 10;
    }

    .results-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: var(--text-secondary);
    }

    .status-dot.active {
        background-color: var(--light-purple);
        box-shadow: 0 0 8px var(--light-purple);
        animation: pulse 2s infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }

    .results-count {
        font-size: 12px;
        color: var(--text-secondary);
    }

    .results-list {
        flex: 1;
        overflow-y: hidden;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .results-list::-webkit-scrollbar {
        width: 6px;
    }

    .results-list::-webkit-scrollbar-track {
        background: transparent;
    }

    .results-list::-webkit-scrollbar-thumb {
        background: var(--white-30);
        border-radius: 3px;
    }

    .empty-state {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary);
        gap: 8px;
        opacity: 0.5;
    }

    .empty-icon {
        width: 32px;
        height: 32px;
    }

    .result-item {
        background-color: var(--black-50);
        border-radius: 8px;
        padding: 12px;
        border-left: 4px solid var(--light-purple);
        transition: background-color 0.2s ease;
        position: relative;
    }

    .result-item.latest {
        border-left-color: var(--orange);
        background-color: var(--orange-10);
    }

    .result-item.history {
        border-left-color: var(--purple-50);
    }

    .result-item:hover {
        background-color: var(--black-30);
    }

    .result-item::after {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        width: 32px;
        height: 32px;
        background: linear-gradient(to bottom left, var(--light-purple-10), transparent);
        pointer-events: none;
    }

    .result-item-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 8px;
    }

    .uid-badge {
        font-family: monospace;
        font-size: 11px;
        font-weight: 700;
        color: var(--light-purple);
        background-color: var(--purple-30);
        padding: 2px 6px;
        border-radius: 4px;
    }

    .uid-badge.history {
        background-color: var(--black-50);
        color: var(--text-secondary);
    }

    .timestamp {
        font-size: 10px;
        font-family: monospace;
        color: var(--text-secondary);
    }

    .timestamp.live {
        color: var(--orange);
        font-weight: 700;
        animation: pulse 2s infinite;
    }

    .uid-badge.streaming {
        background: linear-gradient(90deg, var(--light-purple) 0%, var(--orange) 100%);
        color: var(--white);
        animation: gradient-shift 2s ease infinite;
    }

    @keyframes gradient-shift {
        0%, 100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
    }

    .result-item.streaming {
        border-left-color: var(--light-purple);
        background: linear-gradient(135deg, var(--purple-10) 0%, var(--bg-secondary) 100%);
    }

    .streaming-text {
        font-family: monospace;
        white-space: pre-wrap;
        word-break: break-word;
    }

    .cursor-blink {
        animation: blink 1s step-end infinite;
        font-weight: bold;
    }

    @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
    }

    .description {
        font-size: 13px;
        line-height: 1.5;
        color: var(--text-primary);
        font-weight: 300;
    }

    /* Frame results - multiple persons per frame */
    .frame-results {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .person-result {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 6px 8px;
        background-color: var(--black-30);
        border-radius: 6px;
    }

    .person-uid {
        font-family: monospace;
        font-size: 12px;
        font-weight: 700;
        color: var(--orange);
        min-width: 24px;
    }

    .person-details {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        flex: 1;
    }

    .detail-tag {
        font-size: 10px;
        font-weight: 500;
        padding: 2px 6px;
        border-radius: 4px;
        background-color: var(--black-50);
        color: var(--text-primary);
    }

    .detail-tag.age {
        background-color: var(--purple-30);
        color: var(--light-purple);
    }

    .detail-tag.sex {
        background-color: var(--orange-10);
        color: var(--orange);
    }

    .detail-tag.fashion,
    .detail-tag.emotion,
    .detail-tag.action,
    .detail-tag.direction,
    .detail-tag.accessories,
    .detail-tag.posture {
        background-color: var(--black-50);
        color: var(--text-secondary);
    }

    /* Annotated Image Preview */
    .annotated-preview {
        background-color: var(--black-50);
        border-radius: 8px;
        border: 1px solid var(--border-color);
    }

    .preview-header {
        padding: 6px 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: var(--black-30);
        border-bottom: 1px solid var(--border-color);
    }

    .preview-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .preview-image {
        width: 100%;
        display: block;
    }

</style>
