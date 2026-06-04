'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardData } from '@/lib/types';

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export interface DashboardState {
  data: DashboardData | null; // last-good payload (kept on error)
  loading: boolean;
  error: string | null;
  lastUpdated: number | null; // epoch ms of last successful fetch
  syncTick: number; // increments on each successful fetch (drives sync-sweep)
  refresh: () => void;
}

// Fetches /api/dashboard on mount, then every 5 minutes. On error it KEEPS the
// last good payload on screen and surfaces `error` so the UI can show a soft
// banner instead of going blank — important for a live demo on flaky wifi.
export function useDashboard(): DashboardState {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [syncTick, setSyncTick] = useState(0);
  const inFlight = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DashboardData;
      setData(json);
      setError(null);
      setLastUpdated(Date.now());
      setSyncTick((t) => t + 1);
    } catch (err) {
      setError((err as Error).message || 'fetch failed');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    fetchOnce();
    const id = setInterval(fetchOnce, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchOnce]);

  return { data, loading, error, lastUpdated, syncTick, refresh: fetchOnce };
}

export { REFRESH_MS };
