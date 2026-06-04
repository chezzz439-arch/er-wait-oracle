'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from '@/lib/geo';

type GeoStatus = 'idle' | 'prompting' | 'granted' | 'denied' | 'unavailable';

export interface GeolocationState {
  coords: LatLng | null;
  accuracy: number | null; // meters of the current best fix
  status: GeoStatus;
  request: () => void;
  clear: () => void;
}

const GOOD_ENOUGH_M = 100; // stop refining once within 100 m…
const REFINE_WINDOW_MS = 10000; // …or after 10 s, whichever comes first
const POOR_ACCURACY_M = 500; // a fix worse than this triggers one fresh retry
// maximumAge:0 forces a brand-new GPS read every time (never the cached position).
const GEO_OPTS: PositionOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

// Browser geolocation with progressive refinement:
//   • getCurrentPosition for the initial exact fix (high accuracy, no cache).
//   • then watchPosition to refine — adopt a reading only if it's MORE accurate
//     (smaller accuracy in meters); stop once under 100 m or after 10 s.
//   • exposes `accuracy` so the map can show a "±50 m" indicator on the dot.
// Auto-fires once on load (Chrome/Firefox prompt without a gesture); the
// LocationBanner button is the gesture path for Safari/iOS. A manual request()
// is never deduped against the auto-attempt, so a tap always re-tries.
export function useGeolocation(): GeolocationState {
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');

  const watchId = useRef<number | null>(null);
  const watchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bestAcc = useRef<number>(Infinity);
  const retried = useRef(false); // one fresh retry per request() when the fix is poor

  const stopWatch = useCallback(() => {
    if (watchId.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
    if (watchTimer.current) {
      clearTimeout(watchTimer.current);
      watchTimer.current = null;
    }
  }, []);

  // Adopt a position only if it's the first fix or strictly more accurate.
  const accept = useCallback(
    (pos: GeolocationPosition) => {
      const acc = pos.coords.accuracy ?? Infinity;
      // strictly more accurate only (bestAcc starts at Infinity, so the first
      // finite fix is still adopted) — avoids dot jitter on equal-accuracy reads.
      if (acc < bestAcc.current) {
        bestAcc.current = acc;
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(Number.isFinite(acc) ? Math.round(acc) : null);
      }
      setStatus('granted');
      if (acc <= GOOD_ENOUGH_M) stopWatch();
    },
    [stopWatch]
  );

  const startWatch = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation || watchId.current != null) return;
    try {
      watchId.current = navigator.geolocation.watchPosition(accept, () => {}, GEO_OPTS);
      watchTimer.current = setTimeout(stopWatch, REFINE_WINDOW_MS);
    } catch {
      /* watch unsupported — the initial fix still stands */
    }
  }, [accept, stopWatch]);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    stopWatch();
    bestAcc.current = Infinity;
    retried.current = false;
    setStatus('prompting');

    // Adopt the fix, then: if it's poor (>500m) retry ONCE with a fresh read;
    // otherwise, if not yet within 100m, refine via watchPosition.
    const handle = (pos: GeolocationPosition) => {
      accept(pos);
      const acc = pos.coords.accuracy ?? Infinity;
      if (acc > POOR_ACCURACY_M && !retried.current) {
        retried.current = true;
        try {
          navigator.geolocation.getCurrentPosition(handle, () => {}, GEO_OPTS);
        } catch {
          /* ignore — the first fix still stands */
        }
      } else if (acc > GOOD_ENOUGH_M) {
        startWatch();
      }
    };

    try {
      navigator.geolocation.getCurrentPosition(
        handle,
        (err) => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
        GEO_OPTS
      );
    } catch {
      // Some browsers throw synchronously (e.g. insecure context) — never wedge.
      setStatus('unavailable');
    }
  }, [accept, startWatch, stopWatch]);

  // Auto-attempt once on mount (the spec's unconditional getCurrentPosition).
  const autoFired = useRef(false);
  useEffect(() => {
    if (!autoFired.current) {
      autoFired.current = true;
      request();
    }
    return () => stopWatch();
  }, [request, stopWatch]);

  const clear = useCallback(() => {
    stopWatch();
    bestAcc.current = Infinity;
    setCoords(null);
    setAccuracy(null);
    setStatus('idle');
  }, [stopWatch]);

  return { coords, accuracy, status, request, clear };
}
