'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from '@/lib/geo';

type GeoStatus = 'idle' | 'prompting' | 'granted' | 'denied' | 'unavailable';

export interface GeolocationState {
  coords: LatLng | null;
  status: GeoStatus;
  request: () => void;
  clear: () => void;
}

// Browser geolocation tuned for reliability across browsers:
//   • On mount we check the Permissions API. If already granted, we fetch
//     silently (no prompt). Otherwise we leave it to a user gesture — Safari/iOS
//     will NOT show a prompt for an auto-fired getCurrentPosition() on load, so
//     the visible "Use my location" banner is what actually triggers the prompt.
//   • request() is safe to call from a click handler (the reliable path) or once
//     automatically; we de-dupe so we never stack prompts.
export function useGeolocation(): GeolocationState {
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const inFlight = useRef(false);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus('prompting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus('granted');
        inFlight.current = false;
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
        inFlight.current = false;
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }, []);

  // On mount, auto-fetch only when permission is already granted; reflect a
  // prior denial. A fresh "prompt" state waits for the user to tap the banner.
  useEffect(() => {
    let cancelled = false;
    const perms = (navigator as { permissions?: { query?: (d: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
    if (perms?.query) {
      perms
        .query({ name: 'geolocation' as PermissionName })
        .then((res) => {
          if (cancelled) return;
          if (res.state === 'granted') request();
          else if (res.state === 'denied') setStatus('denied');
          // 'prompt' → wait for the user gesture (banner)
        })
        .catch(() => {
          /* Permissions API unsupported — leave it to the banner. */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [request]);

  const clear = useCallback(() => {
    setCoords(null);
    setStatus('idle');
    inFlight.current = false;
  }, []);

  return { coords, status, request, clear };
}
