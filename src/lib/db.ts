/**
 * IndexedDB Management for Analytics Logs
 */

const DB_NAME = 'LocalSLM_Analytics';
const DB_VERSION = 3; // v3: Added summarized_sessions store
const STORE_NAME = 'sessions';
const SUMMARIZED_STORE_NAME = 'summarized_sessions';

export interface AnalysisEvent {
  timestamp: number;
  targetUid: string;  // Added: target person ID
  prompt: string;
  result: string;
}

export interface UserSession {
  sessionId: string;    // Primary Key (Application Session ID)
  firstSeen: number;    // Timestamp
  lastSeen: number;     // Timestamp (updated continually)
  duration: number;     // seconds
  events: AnalysisEvent[];
}

export interface SummarizedSession {
  sessionId: string;
  timestamp: number;       // firstSeen (来店日時)
  duration_seconds: number;
  demographics: {
    gender: string;                        // 最頻値 of sex
    age_group: string;                     // 最頻値 of age
    fashion_style: Record<string, number>; // fashion term → count
  };
}

let dbInstance: IDBDatabase | null = null;

/**
 * Initialize the Database
 */
export async function initDB(): Promise<void> {
  if (dbInstance) return;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Database error:', event);
      reject('Failed to open database');
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      console.log('IndexedDB initialized');
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create sessions store if not exists
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
        objectStore.createIndex('firstSeen', 'firstSeen', { unique: false });
      }

      // v3: Create summarized_sessions store
      if (!db.objectStoreNames.contains(SUMMARIZED_STORE_NAME)) {
        const summaryStore = db.createObjectStore(SUMMARIZED_STORE_NAME, { keyPath: 'sessionId' });
        summaryStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * Wrapper for transactions
 */
function performTransaction(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => void, storeName: string = STORE_NAME): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
        reject(new Error("Database not initialized"));
        return;
    }
    const transaction = dbInstance.transaction([storeName], mode);
    const store = transaction.objectStore(storeName);
    
    try {
      callback(store);
    } catch (e) {
      reject(e);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) => reject(event);
  });
}

/**
 * Start a new user session
 */
export async function startSession(sessionId: string): Promise<void> {
  if (!dbInstance) await initDB();
  
  const session: UserSession = {
    sessionId,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    duration: 0,
    events: []
  };

  return performTransaction('readwrite', (store) => {
    // Only add if not exists to avoid overwriting on page refresh if logic allows
    // For now, we assume simple unique sessions per runtime or handle duplicates logic elsewhere
    store.put(session); 
  });
}

/**
 * Update the "lastSeen" time for an existing session
 */
export async function updateSessionHeartbeat(sessionId: string): Promise<void> {
  if (!dbInstance) return;

  return new Promise((resolve, reject) => {
    const transaction = dbInstance!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(sessionId);

    request.onsuccess = () => {
      const data = request.result as UserSession;
      if (data) {
        data.lastSeen = Date.now();
        data.duration = (data.lastSeen - data.firstSeen) / 1000;
        store.put(data);
      }
      resolve();
    };
    
    request.onerror = () => reject(request.error);
  });
}

/**
 * Add an analysis result (VLM output) to a specific user session
 */
export async function addAnalysisLog(sessionId: string, targetUid: string, prompt: string, result: string): Promise<void> {
  if (!dbInstance) return;

  return new Promise((resolve, reject) => {
    const transaction = dbInstance!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(sessionId);

    request.onsuccess = () => {
      const data = request.result as UserSession;
      if (data) {
        data.events.push({
          timestamp: Date.now(),
          targetUid,
          prompt,
          result
        });
        // Also update heartbeat
        data.lastSeen = Date.now();
        data.duration = (data.lastSeen - data.firstSeen) / 1000;
        store.put(data);
      } else {
          console.warn(`Session ${sessionId} not found for logging.`);
      }
      resolve();
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * End a user session (finalize)
 */
export async function endSession(sessionId: string): Promise<void> {
  return updateSessionHeartbeat(sessionId);
}

/**
 * Get all sessions (for debugging/export)
 */
export async function getAllSessions(): Promise<UserSession[]> {
  if (!dbInstance) await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = dbInstance!.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a specific session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  if (!dbInstance) await initDB();

  return performTransaction('readwrite', (store) => {
    store.delete(sessionId);
  });
}

/**
 * Clear all sessions
 */
export async function clearAllSessions(): Promise<void> {
  if (!dbInstance) await initDB();

  return performTransaction('readwrite', (store) => {
    store.clear();
  });
}

// =============================================
// Summarized Sessions (for Bayesian Network)
// =============================================

/**
 * Get a single session by ID (needed by aggregator)
 */
export async function getSession(sessionId: string): Promise<UserSession | null> {
  if (!dbInstance) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = dbInstance!.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(sessionId);

    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save a summarized session record
 */
export async function saveSummarizedSession(data: SummarizedSession): Promise<void> {
  if (!dbInstance) await initDB();

  return performTransaction('readwrite', (store) => {
    store.put(data);
  }, SUMMARIZED_STORE_NAME);
}

/**
 * Get all summarized sessions (for export / Bayesian network training)
 */
export async function getAllSummarizedSessions(): Promise<SummarizedSession[]> {
  if (!dbInstance) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = dbInstance!.transaction([SUMMARIZED_STORE_NAME], 'readonly');
    const store = transaction.objectStore(SUMMARIZED_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
