import { describe, it, expect } from 'vitest';
import { computeMode, buildFashionFrequencyMap, buildSummarizedSession, getHourFloor } from './sessionAggregator';
import type { UserSession } from './dexieDb';

describe('sessionAggregator', () => {
  describe('computeMode', () => {
    it('should return the most frequent value', () => {
      expect(computeMode(['30s', '20s', '30s', '40s', '30s'])).toBe('30s');
    });

    it('should return first-seen value on tie', () => {
      expect(computeMode(['male', 'female', 'male', 'female'])).toBe('male');
    });

    it('should return "unknown" for empty array', () => {
      expect(computeMode([])).toBe('unknown');
    });

    it('should handle single value', () => {
      expect(computeMode(['female'])).toBe('female');
    });
  });

  describe('buildFashionFrequencyMap', () => {
    it('should count fashion terms across multiple events', () => {
      const result = buildFashionFrequencyMap([
        'casual jacket',
        'casual glasses',
        'formal suit',
      ]);
      expect(result).toEqual({
        casual: 2,
        jacket: 1,
        glasses: 1,
        formal: 1,
        suit: 1,
      });
    });

    it('should handle comma-separated terms', () => {
      const result = buildFashionFrequencyMap(['red,blue', 'blue,green']);
      expect(result).toEqual({ red: 1, blue: 2, green: 1 });
    });

    it('should return empty object for empty array', () => {
      expect(buildFashionFrequencyMap([])).toEqual({});
    });

    it('should lowercase all terms', () => {
      const result = buildFashionFrequencyMap(['Casual', 'CASUAL', 'casual']);
      expect(result).toEqual({ casual: 3 });
    });
  });

  describe('getHourFloor', () => {
    it('should floor to the start of the hour', () => {
      // 2026-02-14 13:45:32.123
      const d = new Date(2026, 1, 14, 13, 45, 32, 123);
      const floor = getHourFloor(d.getTime());
      const result = new Date(floor);
      expect(result.getHours()).toBe(13);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it('should not change an already-floored time', () => {
      const d = new Date(2026, 1, 14, 13, 0, 0, 0);
      expect(getHourFloor(d.getTime())).toBe(d.getTime());
    });
  });

  describe('buildSummarizedSession', () => {
    function makeSession(events: Array<Record<string, string>>): UserSession {
      return {
        sessionId: 'session-1',
        firstSeen: 1000,
        lastSeen: 46000,
        duration: 45,
        events: events.map((data, i) => ({
          timestamp: 1000 + i * 1000,
          targetUid: 'user-1',
          prompt: 'test prompt',
          result: JSON.stringify(data),
        })),
      };
    }

    it('should aggregate events into a flat summary', () => {
      const session = makeSession([
        { age: '30s', sex: 'female', fashion: 'casual jacket' },
        { age: '30s', sex: 'female', fashion: 'casual glasses' },
        { age: '20s', sex: 'male',   fashion: 'formal suit' },
      ]);

      const result = buildSummarizedSession(session);

      expect(result.sessionId).toBe('session-1');
      expect(result.timestamp).toBe(1000);
      expect(result.duration).toBe(45);
      expect(result.gender).toBe('female');
      expect(result.age_group).toBe('30s');
      // fashion_style is JSON-encoded
      expect(JSON.parse(result.fashion_style)).toEqual({
        casual: 2,
        jacket: 1,
        glasses: 1,
        formal: 1,
        suit: 1,
      });
    });

    it('should handle events with missing fields gracefully', () => {
      const session = makeSession([
        { age: '20s' },
        { sex: 'male', fashion: 'hat' },
      ]);

      const result = buildSummarizedSession(session);

      expect(result.age_group).toBe('20s');
      expect(result.gender).toBe('male');
      expect(JSON.parse(result.fashion_style)).toEqual({ hat: 1 });
    });

    it('should handle empty events array', () => {
      const session: UserSession = {
        sessionId: 'empty',
        firstSeen: 0,
        lastSeen: 0,
        duration: 0,
        events: [],
      };

      const result = buildSummarizedSession(session);

      expect(result.gender).toBe('unknown');
      expect(result.age_group).toBe('unknown');
      expect(JSON.parse(result.fashion_style)).toEqual({});
      expect(result.duration).toBe(0);
    });

    it('should skip events with invalid JSON result', () => {
      const session: UserSession = {
        sessionId: 'bad-json',
        firstSeen: 0,
        lastSeen: 5000,
        duration: 5,
        events: [
          { timestamp: 1000, targetUid: 'u1', prompt: 'p', result: 'not-json' },
          { timestamp: 2000, targetUid: 'u1', prompt: 'p', result: JSON.stringify({ age: '40s', sex: 'female', fashion: 'dress' }) },
        ],
      };

      const result = buildSummarizedSession(session);

      expect(result.age_group).toBe('40s');
      expect(result.gender).toBe('female');
    });
  });
});
