'use client';
import { useEffect, useState } from 'react';

// Returns the fraction (0..1) of time elapsed since the last refresh toward the
// next one, plus the seconds remaining — drives the SVG countdown ring and label.
// Re-anchors whenever `anchor` (lastUpdated epoch ms) changes.
export function useCountdown(anchor: number | null, periodMs: number): {
  fraction: number;
  secondsLeft: number;
} {
  const [now, setNow] = useState(() => (anchor ?? 0) + 0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!anchor) return { fraction: 0, secondsLeft: Math.round(periodMs / 1000) };
  const elapsed = Math.max(0, now - anchor);
  const remaining = Math.max(0, periodMs - elapsed);
  return {
    fraction: Math.min(1, elapsed / periodMs),
    secondsLeft: Math.ceil(remaining / 1000),
  };
}
