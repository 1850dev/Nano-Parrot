/**
 * Dexie.js Database Layer for Analytics
 * 
 * Wraps the existing IndexedDB 'LocalSLM_Analytics' with Dexie.js
 * for cleaner queries (especially range-based hourly lookups).
 */
import Dexie, { type Table } from 'dexie';

// =============================================
// Schema Interfaces
// =============================================

export interface AnalysisEvent {
  timestamp: number;
  targetUid: string;
  prompt: string;
  result: string;
}

export interface UserSession {
  sessionId: string;
  firstSeen: number;
  lastSeen: number;
  duration: number;       // seconds
  events: AnalysisEvent[];
}

export interface SummarizedSession {
  sessionId: string;
  timestamp: number;         // firstSeen (来店日時)
  duration: number;          // seconds
  gender: string;            // 最頻値 of sex
  age_group: string;         // 最頻値 of age
  fashion_style: string;     // JSON-encoded Record<string, number>
}

// =============================================
// Dexie Database Definition
// =============================================

class AnalyticsDB extends Dexie {
  sessions!: Table<UserSession, string>;
  summarized_sessions!: Table<SummarizedSession, string>;

  constructor() {
    super('LocalSLM_Analytics');

    // Version history — Dexie manages schema migrations automatically.
    // We define all stores that have ever existed.
    // Dexie only indexes columns listed here; other data is still stored.
    this.version(4).stores({
      sessions: '&sessionId, firstSeen, lastSeen',
      summarized_sessions: '&sessionId, timestamp, duration, gender, age_group',
    });
  }
}

export const db = new AnalyticsDB();

// =============================================
// Session Operations (raw logs)
// =============================================

/**
 * Start a new user session
 */
export async function startSession(sessionId: string): Promise<void> {
  const session: UserSession = {
    sessionId,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    duration: 0,
    events: [],
  };
  await db.sessions.put(session);
}

/**
 * Update the "lastSeen" time for an existing session
 */
export async function updateSessionHeartbeat(sessionId: string): Promise<void> {
  const data = await db.sessions.get(sessionId);
  if (data) {
    data.lastSeen = Date.now();
    data.duration = (data.lastSeen - data.firstSeen) / 1000;
    await db.sessions.put(data);
  }
}

/**
 * Add an analysis result (VLM output) to a specific user session
 */
export async function addAnalysisLog(
  sessionId: string,
  targetUid: string,
  prompt: string,
  result: string
): Promise<void> {
  const data = await db.sessions.get(sessionId);
  if (data) {
    data.events.push({
      timestamp: Date.now(),
      targetUid,
      prompt,
      result,
    });
    data.lastSeen = Date.now();
    data.duration = (data.lastSeen - data.firstSeen) / 1000;
    await db.sessions.put(data);
  } else {
    console.warn(`Session ${sessionId} not found for logging.`);
  }
}

/**
 * End a user session (finalize)
 */
export async function endSession(sessionId: string): Promise<void> {
  return updateSessionHeartbeat(sessionId);
}

/**
 * Get a single session by ID
 */
export async function getSession(sessionId: string): Promise<UserSession | null> {
  return (await db.sessions.get(sessionId)) ?? null;
}

/**
 * Get all sessions
 */
export async function getAllSessions(): Promise<UserSession[]> {
  return db.sessions.toArray();
}

/**
 * Get sessions whose firstSeen falls within a specific hour.
 * @param hourStart - Timestamp for the start of the hour (e.g., 13:00:00.000)
 */
export async function getSessionsByHour(hourStart: number): Promise<UserSession[]> {
  const hourEnd = hourStart + 60 * 60 * 1000; // +1 hour
  return db.sessions
    .where('firstSeen')
    .between(hourStart, hourEnd, true, false) // [inclusive, exclusive)
    .toArray();
}

/**
 * Delete a specific session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await db.sessions.delete(sessionId);
}

/**
 * Clear all sessions
 */
export async function clearAllSessions(): Promise<void> {
  await db.sessions.clear();
}

// =============================================
// Summarized Sessions (for Bayesian Network)
// =============================================

/**
 * Save a summarized session record
 */
export async function saveSummarizedSession(data: SummarizedSession): Promise<void> {
  await db.summarized_sessions.put(data);
}

/**
 * Save multiple summarized sessions in a single transaction
 */
export async function bulkSaveSummarizedSessions(data: SummarizedSession[]): Promise<void> {
  await db.summarized_sessions.bulkPut(data);
}

/**
 * Get all summarized sessions
 */
export async function getAllSummarizedSessions(): Promise<SummarizedSession[]> {
  return db.summarized_sessions.toArray();
}

/**
 * Get count of summarized sessions
 */
export async function getSummarizedSessionCount(): Promise<number> {
  return db.summarized_sessions.count();
}

/**
 * Clear all summarized sessions
 */
export async function clearAllSummarizedSessions(): Promise<void> {
  await db.summarized_sessions.clear();
}

/**
 * Get all summarized sessions from the most recent hour that has data.
 * Example: if now is 03:00, checks 02:00-03:00 first, then 01:00-02:00, etc.
 * Returns the sessions from the first hour window that contains data.
 */
export async function getLatestHourSummarizedSessions(): Promise<{
  sessions: SummarizedSession[];
  hourStart: number;
  hourEnd: number;
} | null> {
  // Get the most recent record to determine which hour has data
  const latest = await db.summarized_sessions
    .orderBy('timestamp')
    .reverse()
    .first();

  if (!latest) return null;

  // Floor to the start of that hour
  const d = new Date(latest.timestamp);
  d.setMinutes(0, 0, 0);
  const hourStart = d.getTime();
  const hourEnd = hourStart + 60 * 60 * 1000;

  // Get all sessions in that hour
  const sessions = await db.summarized_sessions
    .where('timestamp')
    .between(hourStart, hourEnd, true, false)
    .toArray();

  return { sessions, hourStart, hourEnd };
}
