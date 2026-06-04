'use client';
import { useEffect, useState } from 'react';
import type { LatLng } from '@/lib/geo';

// Client-side reverse geocoding (OpenStreetMap Nominatim) to turn the user's exact
// coordinates into a neighborhood/street-level label instead of just a city.
// Runs in the browser (CORS-enabled; the page Referer satisfies Nominatim's usage
// policy) and only once per ~110m-rounded location, so it stays well within the
// 1 req/sec limit even as watchPosition refines the GPS fix.

interface NominatimAddress {
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  city_district?: string;
  hamlet?: string;
  road?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  'ISO3166-2-lvl4'?: string;
}

// "Civic Center, San Francisco" — most specific area + its city.
function buildLabel(a: NominatimAddress | undefined): string | null {
  if (!a) return null;
  const specific = a.neighbourhood || a.suburb || a.quarter || a.city_district || a.hamlet || a.road;
  const city = a.city || a.town || a.village || a.municipality || a.county;
  const stateCode = a['ISO3166-2-lvl4'] ? a['ISO3166-2-lvl4'].split('-').pop() : null;
  if (specific && city) return `${specific}, ${city}`;
  if (city) return stateCode ? `${city}, ${stateCode}` : city;
  return specific || null;
}

export function useReverseGeocode(coords: LatLng | null): string | null {
  const [label, setLabel] = useState<string | null>(null);
  // Round to ~3 decimals (~110m) so tiny GPS refinements don't re-query.
  const key = coords ? `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}` : '';

  useEffect(() => {
    if (!coords) {
      setLabel(null);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);

    (async () => {
      try {
        const url =
          `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}` +
          `&format=json&zoom=18&addressdetails=1&accept-language=en`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const next = buildLabel(json?.address);
        if (next) setLabel(next);
      } catch {
        /* keep the server-provided city label as fallback */
      } finally {
        clearTimeout(t);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return label;
}
