'use client';
import { useCallback, useState } from 'react';
import type { LatLng } from '@/lib/geo';

type GeoStatus = 'idle' | 'prompting' | 'granted' | 'denied' | 'unavailable';

export interface GeolocationState {
  coords: LatLng | null;
  status: GeoStatus;
  request: () => void;
  clear: () => void;
}

// On-demand browser geolocation. We never auto-prompt — the user taps "Use my
// location", keeping it privacy-respecting. Coordinates stay in memory only.
export function useGeolocation(): GeolocationState {
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    setStatus('prompting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus('granted');
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const clear = useCallback(() => {
    setCoords(null);
    setStatus('idle');
  }, []);

  return { coords, status, request, clear };
}
