import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { threadKey, useTypingStore } from './typingStore';

const thread = { kind: 'feed' as const, id: 'post' };
const typists = () => useTypingStore.getState().byThread[threadKey(thread)] ?? {};

beforeEach(() => {
  vi.useFakeTimers();
  useTypingStore.setState({ byThread: {} });
});
afterEach(() => { vi.useRealTimers(); });

describe('typing indicator store', () => {
  it('shows a typist for six seconds after their last signal', () => {
    useTypingStore.getState().markTyping(thread, 1, 'Kari');
    vi.advanceTimersByTime(5999);
    expect(Object.keys(typists())).toEqual(['1']);
    vi.advanceTimersByTime(1);
    expect(typists()).toEqual({});
  });

  it('a new signal extends the time instead of expiring early', () => {
    useTypingStore.getState().markTyping(thread, 1, 'Kari');
    vi.advanceTimersByTime(4000);
    useTypingStore.getState().markTyping(thread, 1, 'Kari');
    vi.advanceTimersByTime(4000);
    expect(Object.keys(typists())).toEqual(['1']);
    vi.advanceTimersByTime(2000);
    expect(typists()).toEqual({});
  });

  it('clearTyping removes one person at once and keeps the others', () => {
    useTypingStore.getState().markTyping(thread, 1, 'Kari');
    useTypingStore.getState().markTyping(thread, 2, 'Ola');
    useTypingStore.getState().clearTyping(thread, 1);
    expect(Object.keys(typists())).toEqual(['2']);
  });

  it('threads are kept apart', () => {
    useTypingStore.getState().markTyping({ kind: 'event', id: 'post' }, 1, 'Kari');
    expect(typists()).toEqual({});
  });
});
