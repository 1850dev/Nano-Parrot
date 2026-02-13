// Store for tracking data
import { writable } from 'svelte/store';

export interface TrackedObject {
  id: string;
  bbox: [number, number, number, number]; // [x, y, w, h] in pixels or normalized? Tracker impl decides. Let's assume pixels for easier display.
  score: number;
  label?: string;
  firstSeen: number;
  lastSeen: number;
  matched: boolean;
}

// Map of ID -> TrackedObject
export const trackingData = writable<Record<string, TrackedObject>>({});

// Inference Status Store
export interface InferenceStatus {
    phase: 'idle' | 'encoding' | 'generating';
    startTime: number;
    elapsedTime: number; // in seconds, updated periodically
    partialText: string;
}

export const inferenceStatus = writable<InferenceStatus>({
    phase: 'idle',
    startTime: 0,
    elapsedTime: 0,
    partialText: ''
});

export interface PerformanceMetrics {
    fps: number;
    trackingTimeMs: number;
    inferenceTimeMs: number;
    memoryUsageMB?: number; 
}

export const performanceMetrics = writable<PerformanceMetrics>({
    fps: 0,
    trackingTimeMs: 0,
    inferenceTimeMs: 0,
    memoryUsageMB: 0
});
