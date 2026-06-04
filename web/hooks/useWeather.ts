'use client';
import { useEffect, useState } from 'react';
import type { LatLng } from '@/lib/geo';
import type { WeatherView } from '@/lib/types';

// Client-side weather, fetched in the browser after geolocation resolves, for the
// EXACT coordinates passed in. Two independent CORS-enabled providers so weather
// still loads when one is down (Open-Meteo's free tier 502s often — verified):
//   1. Open-Meteo (richer fields) →
//   2. wttr.in (j1 JSON, has temp/feels/precip/wind/humidity/condition).
// On total failure it retries with backoff instead of waiting the full interval.

const CODES: Record<number, string> = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog',
  48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow',
  75: 'Heavy snow', 80: 'Rain showers', 81: 'Heavy showers', 82: 'Violent showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Severe thunderstorm',
};

const REFRESH_MS = 10 * 60 * 1000;
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function withTimeout(url: string, ms: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fromOpenMeteo(c: LatLng): Promise<WeatherView | null> {
  const p = new URLSearchParams({
    latitude: c.lat.toFixed(4),
    longitude: c.lng.toFixed(4),
    current:
      'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'kmh',
    timezone: 'auto',
  });
  const res = await withTimeout(`https://api.open-meteo.com/v1/forecast?${p.toString()}`, 6000);
  if (!res || !res.ok) return null;
  const j = await res.json().catch(() => null);
  const cur = j?.current;
  if (!cur || cur.temperature_2m == null) return null;
  const code = cur.weather_code ?? null;
  return {
    observedAt: cur.time ?? '',
    temperatureF: num(cur.temperature_2m),
    apparentTempF: num(cur.apparent_temperature),
    precipitationMm: num(cur.precipitation),
    windSpeedKmh: num(cur.wind_speed_10m),
    humidityPct: num(cur.relative_humidity_2m),
    weatherCode: code,
    condition: code != null ? CODES[code] ?? 'Unknown' : 'Unknown',
  };
}

async function fromWttr(c: LatLng): Promise<WeatherView | null> {
  const res = await withTimeout(`https://wttr.in/${c.lat.toFixed(4)},${c.lng.toFixed(4)}?format=j1`, 7000);
  if (!res || !res.ok) return null;
  const j = await res.json().catch(() => null);
  const cur = j?.current_condition?.[0];
  if (!cur || cur.temp_F == null) return null;
  return {
    observedAt: cur.localObsDateTime ?? '',
    temperatureF: num(cur.temp_F),
    apparentTempF: num(cur.FeelsLikeF),
    precipitationMm: num(cur.precipMM),
    windSpeedKmh: num(cur.windspeedKmph),
    humidityPct: num(cur.humidity),
    weatherCode: null,
    condition: cur.weatherDesc?.[0]?.value ?? 'Unknown',
  };
}

export interface WeatherState {
  weather: WeatherView | null;
  loading: boolean;
}

export function useWeather(coords: LatLng | null): WeatherState {
  const [weather, setWeather] = useState<WeatherView | null>(null);
  const [loading, setLoading] = useState(false);
  const key = coords ? `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}` : '';

  useEffect(() => {
    if (!coords) {
      setWeather(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let backoff: ReturnType<typeof setTimeout> | null = null;
    // New location: clear the prior reading so we show "Loading…", not stale weather.
    setWeather(null);
    setLoading(true);

    const attempt = async () => {
      const w = (await fromOpenMeteo(coords)) ?? (await fromWttr(coords));
      if (cancelled) return;
      if (w) {
        setWeather(w);
        setLoading(false);
      } else {
        // Both providers failed (e.g. Open-Meteo 502 + wttr.in hiccup). Keep the
        // loading state (a retry is pending) instead of flashing "unavailable".
        console.warn('[weather] both providers failed; retrying in 30s');
        if (backoff) clearTimeout(backoff);
        backoff = setTimeout(attempt, 30000);
      }
    };

    attempt();
    const id = setInterval(attempt, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (backoff) clearTimeout(backoff);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { weather, loading };
}
