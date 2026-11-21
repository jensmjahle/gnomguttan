import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatRelativeTime } from './relativeTime';

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-28T12:00:00');
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
  afterEach(() => { vi.useRealTimers(); });

  const ago = (ms: number) => now.getTime() - ms;

  it.each([
    [10_000, 'nå nettopp'],
    [5 * 60_000, '5 min siden'],
    [3 * 3600_000, '3 t siden'],
    [2 * 86400_000, '2 d siden'],
  ])('%i ms ago → %s', (ms, expected) => {
    expect(formatRelativeTime(ago(ms))).toBe(expected);
  });

  it('falls back to a date after a week', () => {
    expect(formatRelativeTime(new Date('2026-10-10T08:05:00').getTime())).toBe('10. okt. 08:05');
  });
});
