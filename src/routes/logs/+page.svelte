<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { liveQuery } from 'dexie';
  import { db, deleteSession, clearAllSessions, getSummarizedSessionCount, type UserSession } from '$lib/dexieDb';
  import { aggregateAllData } from '$lib/sessionAggregator';
  import { AVAILABLE_FIELDS } from '$lib/promptSettings';
  import { slide } from 'svelte/transition';
  import ParrotInsight from '$lib/components/ParrotInsight.svelte';

  let sessions: UserSession[] = [];
  let loading = true;
  let searchTerm = '';
  let expandedRows: Set<string> = new Set();
  let sortField: keyof UserSession | 'eventCount' = 'lastSeen';
  let sortDesc = true;

  // Aggregation state
  let summarizedCount = 0;
  let isAggregating = false;
  let aggregateProgress = '';

  // Parse structured result from JSON string. Return object of parsed fields or { raw }
  function parseResult(result: string): Record<string, any> {
    try {
      const parsed = JSON.parse(result);
      if (parsed && typeof parsed === 'object') return parsed;
      return { raw: result };
    } catch {
      return { raw: result };
    }
  }

  // Live query — auto-updates when IndexedDB changes
  let subscription: any;

  onMount(() => {
    const observable = liveQuery(async () => {
      const [allSessions, summaryCount] = await Promise.all([
        db.sessions.toArray(),
        db.summarized_sessions.count(),
      ]);
      return { allSessions, summaryCount };
    });

    subscription = observable.subscribe({
      next: (data) => {
        sessions = data.allSessions;
        summarizedCount = data.summaryCount;
        loading = false;
      },
      error: (err) => {
        console.error('[LiveQuery]', err);
        loading = false;
      },
    });
  });

  onDestroy(() => {
    subscription?.unsubscribe();
  });

  async function handleDelete(sessionId: string) {
    if (!confirm('Delete this session log?')) return;
    await deleteSession(sessionId);
    // liveQuery will auto-update sessions
    expandedRows.delete(sessionId);
    expandedRows = expandedRows; 
  }

  async function handleClearAll() {
    if (!confirm('Are you sure you want to delete ALL logs? This cannot be undone.')) return;
    await clearAllSessions();
    // liveQuery will auto-update sessions
    expandedRows = new Set();
  }

  function exportJSON() {
    const dataStr = JSON.stringify(sessions, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lfm_logs_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleForceAggregate() {
    if (isAggregating) return;
    isAggregating = true;
    aggregateProgress = 'Starting...';
    try {
      const count = await aggregateAllData((processed, total) => {
        aggregateProgress = `${processed} / ${total} sessions`;
      });
      aggregateProgress = `Done! ${count} sessions aggregated.`;
      summarizedCount = await getSummarizedSessionCount();
      setTimeout(() => { aggregateProgress = ''; }, 3000);
    } catch (e) {
      console.error(e);
      aggregateProgress = 'Error during aggregation.';
    } finally {
      isAggregating = false;
    }
  }

  function toggleExpand(sessionId: string) {
    if (expandedRows.has(sessionId)) {
      expandedRows.delete(sessionId);
    } else {
      expandedRows.add(sessionId);
    }
    expandedRows = expandedRows;
  }

  function formatDate(ts: number) {
    return new Date(ts).toLocaleString();
  }

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds.toFixed(0)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  }

  $: filteredSessions = sessions
    .filter(s => {
      const term = searchTerm.toLowerCase();
      return (
        s.sessionId?.toLowerCase().includes(term) ||
        s.events.some(e => e.prompt.toLowerCase().includes(term) || e.result.toLowerCase().includes(term) || e.targetUid?.toLowerCase().includes(term))
      );
    })
    .sort((a, b) => {
      let valA: any = a[sortField as keyof UserSession];
      let valB: any = b[sortField as keyof UserSession];
      
      if (sortField === 'eventCount') {
          valA = a.events.length;
          valB = b.events.length;
      }

      if (valA < valB) return sortDesc ? 1 : -1;
      if (valA > valB) return sortDesc ? -1 : 1;
      return 0;
    });

  $: totalEvents = sessions.reduce((sum, s) => sum + s.events.length, 0);
</script>

<div class="log-viewer">
  <!-- Header -->
  <header class="log-header">
    <div class="header-left">
      <a href="/" class="back-link">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </a>
      <div class="header-title">
        <h1>Log Viewer</h1>
        <span class="header-subtitle">Session Analytics Dashboard</span>
      </div>
    </div>
    <div class="header-stats">
      <div class="stat-item">
        <span class="stat-value">{sessions.length}</span>
        <span class="stat-label">Sessions</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-value">{totalEvents}</span>
        <span class="stat-label">Events</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-value">{summarizedCount}</span>
        <span class="stat-label">Summarized</span>
      </div>
    </div>
  </header>

  <!-- Parrot Insight -->
  <div class="insight-section">
    <ParrotInsight />
  </div>

  <!-- Toolbar -->
  <div class="toolbar">
    <div class="search-box">
      <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
      </svg>
      <input 
        type="text" 
        bind:value={searchTerm}
        placeholder="Search by Session ID, target UID, prompt..." 
        class="search-input"
      />
      {#if searchTerm}
        <button class="search-clear" on:click={() => searchTerm = ''}>×</button>
      {/if}
    </div>

    <div class="toolbar-actions">
      <button on:click={exportJSON} class="btn btn-primary" disabled={sessions.length===0}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        <span>Export</span>
      </button>
      <button on:click={handleClearAll} class="btn btn-danger" disabled={sessions.length===0}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        <span>Clear All</span>
      </button>
    </div>
  </div>

  <!-- Content -->
  <main class="log-content">
    {#if loading}
      <div class="empty-state">
        <div class="loading-spinner"></div>
        <p>Loading logs...</p>
      </div>
    {:else if filteredSessions.length === 0}
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--light-purple-30)" stroke-width="1">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
        </svg>
        <p class="empty-title">No logs found</p>
        {#if sessions.length > 0}
          <p class="empty-subtitle">Clear the search filter to see all results.</p>
        {:else}
          <p class="empty-subtitle">Start using the app to generate tracking data.</p>
        {/if}
      </div>
    {:else}
      <div class="table-container">
        <table class="log-table">
          <thead>
            <tr>
              <th class="sortable" class:active={sortField==='sessionId'} on:click={() => { if(sortField==='sessionId') sortDesc = !sortDesc; else { sortField='sessionId'; sortDesc=true;} }}>
                <span>Session ID</span>
                {#if sortField === 'sessionId'}<span class="sort-icon">{sortDesc ? '↓' : '↑'}</span>{/if}
              </th>
              <th class="sortable" class:active={sortField==='firstSeen'} on:click={() => { if(sortField==='firstSeen') sortDesc = !sortDesc; else { sortField='firstSeen'; sortDesc=true;} }}>
                <span>First Seen</span>
                {#if sortField === 'firstSeen'}<span class="sort-icon">{sortDesc ? '↓' : '↑'}</span>{/if}
              </th>
              <th class="sortable" class:active={sortField==='lastSeen'} on:click={() => { if(sortField==='lastSeen') sortDesc = !sortDesc; else { sortField='lastSeen'; sortDesc=true;} }}>
                <span>Last Seen</span>
                {#if sortField === 'lastSeen'}<span class="sort-icon">{sortDesc ? '↓' : '↑'}</span>{/if}
              </th>
              <th class="sortable" class:active={sortField==='duration'} on:click={() => { if(sortField==='duration') sortDesc = !sortDesc; else { sortField='duration'; sortDesc=true;} }}>
                <span>Duration</span>
                {#if sortField === 'duration'}<span class="sort-icon">{sortDesc ? '↓' : '↑'}</span>{/if}
              </th>
              <th class="sortable" class:active={sortField==='eventCount'} on:click={() => { if(sortField==='eventCount') sortDesc = !sortDesc; else { sortField='eventCount'; sortDesc=true;} }}>
                <span>Events</span>
                {#if sortField === 'eventCount'}<span class="sort-icon">{sortDesc ? '↓' : '↑'}</span>{/if}
              </th>
              <th class="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredSessions as session (session.sessionId)}
              <tr class:expanded={expandedRows.has(session.sessionId)}>
                <td class="session-cell">{session.sessionId}</td>
                <td class="date-cell">{formatDate(session.firstSeen)}</td>
                <td class="date-cell">{formatDate(session.lastSeen)}</td>
                <td class="duration-cell">{formatDuration(session.duration)}</td>
                <td class="events-cell">
                  <span class="event-count" class:has-events={session.events.length > 0}>
                    {session.events.length}
                  </span>
                </td>
                <td class="actions-cell">
                  <button class="btn-icon" on:click={() => toggleExpand(session.sessionId)} title={expandedRows.has(session.sessionId) ? 'Hide details' : 'Show details'}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class:rotated={expandedRows.has(session.sessionId)}>
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </button>
                  <button class="btn-icon btn-icon-danger" on:click={() => handleDelete(session.sessionId)} title="Delete session">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </td>
              </tr>
              {#if expandedRows.has(session.sessionId)}
                <tr class="detail-row" transition:slide|local>
                  <td colspan="6">
                    <div class="detail-panel">
                      <div class="detail-header">
                        <h4>Event History</h4>
                        <span class="detail-count">{session.events.length} event{session.events.length !== 1 ? 's' : ''}</span>
                      </div>
                      {#if session.events.length === 0}
                        <p class="no-events">No analysis events recorded for this session.</p>
                      {:else}
                        <div class="event-list">
                          {#each [...session.events].reverse() as event, i}
                            {@const parsed = parseResult(event.result)}
                            <div class="event-card">
                              <div class="event-header">
                                <span class="event-number">#{session.events.length - i}</span>
                                <span class="event-time">{formatDate(event.timestamp)}</span>
                              </div>
                              <div class="event-body">
                                <div class="event-section">
                                  <span class="event-label">Target UID</span>
                                  <div class="event-target">{event.targetUid || 'N/A'}</div>
                                </div>
                                <div class="event-section">
                                  <span class="event-label">Prompt</span>
                                  <div class="event-prompt">{event.prompt}</div>
                                </div>
                                <div class="event-section">
                                  <span class="event-label">Result</span>
                                  {#if parsed.raw}
                                    <div class="event-result">{parsed.raw}</div>
                                  {:else}
                                    <div class="event-result structured">
                                      {#each AVAILABLE_FIELDS as field}
                                        {#if parsed[field.key] !== undefined && parsed[field.key] !== null}
                                          <span class="result-tag {field.key}">{parsed[field.key]}</span>
                                        {/if}
                                      {/each}

                                      {#each Object.keys(parsed).filter(k => !AVAILABLE_FIELDS.find(f => f.key === k)) as extraKey}
                                        <span class="result-tag extra">{extraKey}: {parsed[extraKey]}</span>
                                      {/each}
                                    </div>
                                  {/if}
                                </div>
                              </div>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </main>
</div>

<style>
  .log-viewer {
    min-height: 100vh;
    background: var(--bg-primary);
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 32px;
    background: var(--bg-secondary);
    border-bottom: var(--border-width) var(--border-style) var(--border-color);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .back-link {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--black-30);
    color: var(--text-secondary);
    transition: all 0.2s ease;
  }

  .back-link:hover {
    background: var(--light-purple-30);
    color: var(--light-purple);
  }

  .header-title h1 {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0;
    color: var(--text-primary);
  }

  .header-subtitle {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .header-stats {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--light-purple);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-divider {
    width: 1px;
    height: 40px;
    background: var(--border-color);
  }

  /* Parrot Insight */
  .insight-section {
    padding: 16px 32px;
    border-bottom: 1px solid var(--black-30);
    background: var(--bg-primary);
  }

  /* Toolbar */
  .toolbar {
    display: flex;
    gap: 16px;
    padding: 16px 32px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--black-30);
    flex-wrap: wrap;
  }

  .search-box {
    flex: 1;
    min-width: 280px;
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 14px;
    color: var(--text-secondary);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 12px 40px 12px 44px;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 10px;
    color: var(--text-primary);
    font-size: 0.95rem;
    transition: all 0.2s ease;
  }

  .search-input::placeholder {
    color: var(--text-secondary);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--input-focus);
    box-shadow: 0 0 0 3px var(--light-purple-10);
  }

  .search-clear {
    position: absolute;
    right: 12px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--black-50);
    border: none;
    border-radius: 50%;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.2s ease;
  }

  .search-clear:hover {
    background: var(--light-purple-30);
    color: var(--text-primary);
  }

  .toolbar-actions {
    display: flex;
    gap: 8px;
  }

  /* Buttons */
  .btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border: none;
    border-radius: 10px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--black-30);
    color: var(--text-primary);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--black-50);
  }

  .btn-primary {
    background: var(--accent-primary);
    color: var(--text-primary);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--light-purple-70);
  }

  .btn-danger {
    background: rgba(220, 38, 38, 0.2);
    color: #fca5a5;
    border: 1px solid rgba(220, 38, 38, 0.3);
  }

  .btn-danger:hover:not(:disabled) {
    background: rgba(220, 38, 38, 0.4);
  }

  .btn-accent {
    background: rgba(74, 222, 128, 0.15);
    color: rgb(74, 222, 128);
    border: 1px solid rgba(74, 222, 128, 0.3);
  }

  .btn-accent:hover:not(:disabled) {
    background: rgba(74, 222, 128, 0.3);
  }

  .aggregate-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 32px;
    background: var(--black-30);
    font-size: 0.85rem;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border-color);
  }

  .aggregate-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--light-purple);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .aggregate-indicator.done {
    background: rgb(74, 222, 128);
    animation: none;
  }

  .aggregate-indicator.error {
    background: #fca5a5;
    animation: none;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: var(--black-30);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-icon:hover {
    background: var(--light-purple-30);
    color: var(--light-purple);
  }

  .btn-icon svg {
    transition: transform 0.2s ease;
  }

  .btn-icon svg.rotated {
    transform: rotate(180deg);
  }

  .btn-icon-danger:hover {
    background: rgba(220, 38, 38, 0.3);
    color: #fca5a5;
  }

  /* Content */
  .log-content {
    flex: 1;
    padding: 24px 32px;
    overflow-y: auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    text-align: center;
    color: var(--text-secondary);
  }

  .empty-title {
    font-size: 1.25rem;
    font-weight: 500;
    margin-top: 16px;
    color: var(--text-primary);
  }

  .empty-subtitle {
    font-size: 0.9rem;
    margin-top: 8px;
    color: var(--text-secondary);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--light-purple-30);
    border-top-color: var(--light-purple);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Table */
  .table-container {
    background: var(--bg-secondary);
    border-radius: 16px;
    border: var(--border-width) var(--border-style) var(--border-color);
    overflow: hidden;
  }

  .log-table {
    width: 100%;
    border-collapse: collapse;
  }

  .log-table th {
    padding: 16px 20px;
    text-align: left;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    background: var(--black-50);
    border-bottom: 1px solid var(--border-color);
  }

  .log-table th.sortable {
    cursor: pointer;
    user-select: none;
    transition: color 0.2s ease;
  }

  .log-table th.sortable:hover {
    color: var(--text-primary);
  }

  .log-table th.sortable.active {
    color: var(--light-purple);
  }

  .sort-icon {
    margin-left: 4px;
    opacity: 0.7;
  }

  .log-table td {
    padding: 16px 20px;
    border-bottom: 1px solid var(--black-30);
    vertical-align: middle;
  }

  .log-table tbody tr {
    transition: background 0.15s ease;
  }

  .log-table tbody tr:hover {
    background: var(--black-30);
  }

  .log-table tbody tr.expanded {
    background: var(--light-purple-10);
  }

  .uid-cell {
    font-family: 'Monaco', 'Menlo', monospace;
  }

  .uid-badge {
    display: inline-block;
    padding: 4px 10px;
    background: var(--light-purple-10);
    border: 1px solid var(--light-purple-30);
    border-radius: 6px;
    color: var(--light-purple);
    font-size: 0.85rem;
    font-weight: 500;
  }

  .session-cell {
    font-size: 0.8rem;
    color: var(--text-secondary);
    font-family: 'Monaco', 'Menlo', monospace;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .date-cell {
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  .duration-cell {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.9rem;
    color: var(--text-primary);
  }

  .event-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 8px;
    background: var(--black-50);
    border-radius: 14px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .event-count.has-events {
    background: rgba(74, 222, 128, 0.1);
    color: rgb(74, 222, 128);
    border: 1px solid rgba(74, 222, 128, 0.3);
  }

  .actions-col {
    text-align: right;
  }

  .actions-cell {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  /* Detail Row */
  .detail-row td {
    padding: 0;
    background: var(--black-30);
  }

  .detail-panel {
    padding: 24px;
    border-left: 3px solid var(--light-purple);
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .detail-header h4 {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .detail-count {
    font-size: 0.8rem;
    color: var(--text-secondary);
    background: var(--black-50);
    padding: 4px 10px;
    border-radius: 12px;
  }

  .no-events {
    color: var(--text-secondary);
    font-style: italic;
    font-size: 0.9rem;
  }

  .event-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .event-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    overflow: hidden;
  }

  .event-header {
    display: flex;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--black-50);
    border-bottom: 1px solid var(--black-30);
  }

  .event-number {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--light-purple);
  }

  .event-time {
    font-size: 0.8rem;
    color: var(--text-secondary);
    font-family: 'Monaco', 'Menlo', monospace;
  }

  .event-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .event-section .event-label {
    display: block;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }

  .event-prompt {
    font-size: 0.85rem;
    font-family: 'Monaco', 'Menlo', monospace;
    color: var(--text-secondary);
    background: var(--black-30);
    padding: 12px;
    border-radius: 8px;
    line-height: 1.5;
  }

  .event-result {
    font-size: 0.95rem;
    color: rgb(74, 222, 128);
    background: rgba(74, 222, 128, 0.1);
    padding: 12px;
    border-radius: 8px;
    border: 1px solid rgba(74, 222, 128, 0.3);
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .event-result.structured {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    background: transparent;
    border: none;
    padding: 0;
  }

  .result-tag {
    font-size: 0.85rem;
    font-weight: 500;
    padding: 6px 12px;
    border-radius: 6px;
  }

  .result-tag.age {
    background: var(--purple-30);
    color: var(--light-purple);
    border: 1px solid var(--light-purple-30);
  }

  .result-tag.sex {
    background: var(--orange-10);
    color: var(--orange);
    border: 1px solid var(--orange-50);
  }

  .result-tag.fashion,
  .result-tag.emotion,
  .result-tag.action,
  .result-tag.direction,
  .result-tag.accessories,
  .result-tag.posture {
    background: var(--black-30);
    color: var(--text-primary);
    border: 1px solid var(--white-10);
  }

  .event-target {
    font-size: 0.9rem;
    font-family: 'Monaco', 'Menlo', monospace;
    color: var(--light-purple);
    background: var(--light-purple-10);
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--light-purple-30);
    display: inline-block;
  }

  /* Scrollbar */
  .log-content::-webkit-scrollbar {
    width: 8px;
  }

  .log-content::-webkit-scrollbar-track {
    background: var(--bg-primary);
  }

  .log-content::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 4px;
  }

  .log-content::-webkit-scrollbar-thumb:hover {
    background: var(--light-purple-50);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .log-header {
      flex-direction: column;
      gap: 16px;
      padding: 16px;
    }

    .toolbar {
      flex-direction: column;
      padding: 12px 16px;
    }

    .toolbar-actions {
      justify-content: stretch;
    }

    .toolbar-actions .btn {
      flex: 1;
      justify-content: center;
    }

    .log-content {
      padding: 16px;
    }

    .log-table th,
    .log-table td {
      padding: 12px;
    }

    .btn span {
      display: none;
    }

    .btn svg {
      margin: 0;
    }
  }
</style>
