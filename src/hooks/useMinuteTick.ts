import { useEffect, useState } from 'react';

// Single shared interval — starts on first subscriber, stops on last.
const subscribers = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  if (subscribers.size === 1) {
    intervalId = setInterval(() => {
      for (const s of subscribers) s();
    }, 60_000);
  }
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

/** Re-renders the calling component once per minute. All consumers share one interval. */
export function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((t) => t + 1)), []);
}
