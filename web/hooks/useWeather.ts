'use client';
import { useEffect, useState } from 'react';
import type { LatLng } from '@/lib/geo';
import type { WeatherView } from '@/lib/types';

// Client-side weather fetch (Open-Meteo, free, no key, CORS-enabled). Done from
// the browser — which sits near the user and isn't subject to serverless egress
// quirks — so weather loads reliably in production even if the server-side fetch
// (used for the incident feed) is slow or blocked from Vercel's region.
const CODES: Record<number, string> = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog',
  48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow',
  75: 'Heavy snow', 80: 'Rain showers', 81: 'Heavy showers', 82: 'Violent showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Severe thunderstorm',
};

const REFRESH_MS = 10 * 60 * 1000;

export function useWeather(coords: LatLng | null): WeatherView | null {
  const [weather, setWeather] = useState<WeatherView | null>(null);
  const key = coords ? `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}` : '';

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;

    const load = async () => {
      try {
        const p = new URLSearchParams({
          latitude: coords.lat.toFixed(4),
          longitude: coords.lng.toFixed(4),
          current:
            'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m',
          temperature_unit: 'fahrenheit',
          wind_speed_unit: 'kmh',
          timezone: 'auto',
        });
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?${p.toString()}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return;
        const j = await res.json();
        const c = j.current || {};
        if (cancelled || c.temperature_2m == null) return;
        const code = c.weather_code ?? null;
        setWeather({
          observedAt: c.time ?? '',
          temperatureF: c.temperature_2m ?? null,
          apparentTempF: c.apparent_temperature ?? null,
          precipitationMm: c.precipitation ?? null,
          windSpeedKmh: c.wind_speed_10m ?? null,
          humidityPct: c.relative_humidity_2m ?? null,
          weatherCode: code,
          condition: code != null ? CODES[code] ?? 'Unknown' : 'Unknown',
        });
      } catch {
        /* keep last-good weather; the server payload is the fallback */
      }
    };

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return weather;
}
