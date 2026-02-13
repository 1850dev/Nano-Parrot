/**
 * Session Aggregator — Hourly Event-Driven
 *
 * Aggregates raw per-frame inference logs into summarized records
 * for Bayesian Network training data.
 *
 * Trigger: "hour rollover" — when the current hour advances past lastProcessedHour.
 * Execution: scheduler.postTask(priority: 'background') to avoid blocking the main thread.
 */
import {
  getSessionsByHour,
  getAllSessions,
  bulkSaveSummarizedSessions,
  type AnalysisEvent,
  type UserSession,
  type SummarizedSession,
} from './dexieDb';

// Type declarations for the Scheduling API (not yet in all TS libs)
declare global {
  interface Scheduler {
    postTask<T>(callback: () => T | Promise<T>, options?: { priority?: 'user-blocking' | 'user-visible' | 'background' }): Promise<T>;
  }
  // eslint-disable-next-line no-var
  var scheduler: Scheduler | undefined;
}

// =============================================
// Pure aggregation helpers (testable)
// =============================================

/**
 * Compute the mode (most frequent value) from an array of strings.
 * In case of a tie, returns the value that appeared first.
 */
export function computeMode(values: string[]): string {
  if (values.length === 0) return 'unknown';

  const counts = new Map<string, number>();
  let maxCount = 0;
  let mode = values[0];

  for (const v of values) {
    const count = (counts.get(v) ?? 0) + 1;
    counts.set(v, count);
    if (count > maxCount) {
      maxCount = count;
      mode = v;
    }
  }

  return mode;
}

/**
 * Build a frequency map of fashion terms across all events.
 * Each event's fashion field is split into individual terms.
 */
export function buildFashionFrequencyMap(fashionValues: string[]): Record<string, number> {
  const freq: Record<string, number> = {};

  for (const raw of fashionValues) {
    const terms = raw
      .split(/[,\/\s]+/)
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);

    for (const term of terms) {
      freq[term] = (freq[term] ?? 0) + 1;
    }
  }

  return freq;
}

interface ParsedEvent {
  age?: string;
  sex?: string;
  fashion?: string;
  [key: string]: any;
}

function parseEventResult(event: AnalysisEvent): ParsedEvent | null {
  try {
    return JSON.parse(event.result);
  } catch {
    return null;
  }
}

/**
 * Build a SummarizedSession from a raw UserSession.
 * Pure function for testability.
 */
export function buildSummarizedSession(session: UserSession): SummarizedSession {
  const parsed = session.events
    .map(parseEventResult)
    .filter((p): p is ParsedEvent => p !== null);

  const ages = parsed.map(p => p.age).filter((v): v is string => !!v);
  const sexes = parsed.map(p => p.sex).filter((v): v is string => !!v);
  const fashions = parsed.map(p => p.fashion).filter((v): v is string => !!v);

  const durationSeconds = Math.round((session.lastSeen - session.firstSeen) / 1000);

  return {
    sessionId: session.sessionId,
    timestamp: session.firstSeen,
    duration: durationSeconds,
    gender: computeMode(sexes),
    age_group: computeMode(ages),
    fashion_style: JSON.stringify(buildFashionFrequencyMap(fashions)),
  };
}

// =============================================
// Hour utilities
// =============================================

const LAST_PROCESSED_HOUR_KEY = 'aggregator_lastProcessedHour';

/**
 * Get the hour-floor timestamp for a given time.
 * e.g., 13:45:32 → 13:00:00.000 as epoch ms
 */
export function getHourFloor(timestampMs: number): number {
  const d = new Date(timestampMs);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

/**
 * Get the last processed hour from localStorage.
 * Returns null if never set.
 */
export function getLastProcessedHour(): number | null {
  const val = localStorage.getItem(LAST_PROCESSED_HOUR_KEY);
  return val ? Number(val) : null;
}

/**
 * Set the last processed hour in localStorage.
 */
export function setLastProcessedHour(hourTimestamp: number): void {
  localStorage.setItem(LAST_PROCESSED_HOUR_KEY, String(hourTimestamp));
}

// =============================================
// Background task runner
// =============================================

/**
 * Runs a function in the background via scheduler.postTask if available,
 * otherwise falls back to setTimeout.
 */
function runInBackground<T>(fn: () => T | Promise<T>): Promise<T> {
  if (typeof scheduler !== 'undefined' && typeof scheduler.postTask === 'function') {
    return scheduler.postTask(fn, { priority: 'background' }) as Promise<T>;
  }
  // Fallback: setTimeout(0) to yield to main thread
  return new Promise<T>((resolve, reject) => {
    setTimeout(async () => {
      try {
        resolve(await fn());
      } catch (e) {
        reject(e);
      }
    }, 0);
  });
}

// =============================================
// Aggregation entry points
// =============================================

/**
 * Aggregate all sessions within a specific hour.
 * @param targetHourTimestamp - The hour-floor timestamp (e.g., 13:00:00.000)
 * @returns Number of sessions aggregated
 */
export async function aggregateHourlyData(targetHourTimestamp: number): Promise<number> {
  return runInBackground(async () => {
    const sessions = await getSessionsByHour(targetHourTimestamp);

    if (sessions.length === 0) {
      console.log(`[Aggregator] No sessions found for hour ${new Date(targetHourTimestamp).toLocaleTimeString()}`);
      return 0;
    }

    // Filter out sessions with no events
    const validSessions = sessions.filter(s => s.events.length > 0);
    if (validSessions.length === 0) {
      console.log(`[Aggregator] All ${sessions.length} sessions have no events, skipping.`);
      return 0;
    }

    const summaries = validSessions.map(buildSummarizedSession);
    await bulkSaveSummarizedSessions(summaries);

    console.log(
      `[Aggregator] Aggregated ${summaries.length} sessions for hour ${new Date(targetHourTimestamp).toLocaleTimeString()}`
    );
    return summaries.length;
  });
}

/**
 * Aggregate ALL sessions across all time (Force Aggregate).
 * Used by the debug button on the Logs page.
 * @param onProgress - Optional progress callback (processed, total)
 * @returns Total number of sessions aggregated
 */
export async function aggregateAllData(
  onProgress?: (processed: number, total: number) => void
): Promise<number> {
  return runInBackground(async () => {
    const allSessions = await getAllSessions();
    const validSessions = allSessions.filter(s => s.events.length > 0);

    if (validSessions.length === 0) {
      console.log('[Aggregator] No sessions with events found.');
      return 0;
    }

    // Process in chunks to avoid large memory spikes
    const CHUNK_SIZE = 50;
    let totalProcessed = 0;

    for (let i = 0; i < validSessions.length; i += CHUNK_SIZE) {
      const chunk = validSessions.slice(i, i + CHUNK_SIZE);
      const summaries = chunk.map(buildSummarizedSession);
      await bulkSaveSummarizedSessions(summaries);
      totalProcessed += summaries.length;

      if (onProgress) {
        onProgress(totalProcessed, validSessions.length);
      }
    }

    console.log(`[Aggregator] Force aggregated ${totalProcessed} sessions total.`);
    return totalProcessed;
  });
}

/**
 * Check if the hour has rolled over and trigger aggregation if needed.
 * Called after every addAnalysisLog to detect the hour boundary.
 */
export async function checkAndTriggerAggregation(): Promise<void> {
  const now = Date.now();
  const currentHour = getHourFloor(now);
  const lastProcessed = getLastProcessedHour();

  // First run — initialize without aggregating
  if (lastProcessed === null) {
    setLastProcessedHour(currentHour);
    console.log(`[Aggregator] Initialized lastProcessedHour to ${new Date(currentHour).toLocaleTimeString()}`);
    return;
  }

  // Hour has advanced — aggregate the previous hour(s)
  if (currentHour > lastProcessed) {
    console.log(
      `[Aggregator] Hour rollover detected: ${new Date(lastProcessed).toLocaleTimeString()} → ${new Date(currentHour).toLocaleTimeString()}`
    );

    // Aggregate each missed hour (handles cases where multiple hours passed)
    let hour = lastProcessed;
    while (hour < currentHour) {
      await aggregateHourlyData(hour);
      hour += 60 * 60 * 1000; // next hour
    }

    setLastProcessedHour(currentHour);
  }
}
