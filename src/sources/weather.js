// Fetches current San Francisco weather from Open-Meteo (free, no API key).
// This is the genuinely time-varying signal in the pipeline — accumulating it
// hourly is what builds real history for the model to learn from.
import { config } from '../config.js';

const BASE = 'https://api.open-meteo.com/v1/forecast';

const CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation',
  'rain',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
  'wind_gusts_10m',
  'relative_humidity_2m',
  'is_day',
];

// WMO weather interpretation codes → short label, for prompts and readability.
export const WEATHER_CODES = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle',
  55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Rain showers',
  81: 'Heavy showers', 82: 'Violent showers', 95: 'Thunderstorm',
  96: 'Thunderstorm w/ hail', 99: 'Severe thunderstorm',
};

export function describeWeatherCode(code) {
  return WEATHER_CODES[code] ?? `code ${code}`;
}

export async function fetchWeather() {
  const params = new URLSearchParams({
    latitude: String(config.location.latitude),
    longitude: String(config.location.longitude),
    current: CURRENT_FIELDS.join(','),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'kmh',
    timezone: 'GMT',
  });

  const res = await fetch(`${BASE}?${params.toString()}`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const c = data.current || {};

  // "2026-06-04T09:00" → "2026-06-04 09:00:00" for ClickHouse DateTime.
  const forecastTime = c.time
    ? `${String(c.time).replace('T', ' ')}:00`
    : null;

  return {
    forecast_time: forecastTime,
    latitude: data.latitude,
    longitude: data.longitude,
    temperature_f: c.temperature_2m ?? null,
    apparent_temp_f: c.apparent_temperature ?? null,
    precipitation_mm: c.precipitation ?? null,
    rain_mm: c.rain ?? null,
    weather_code: c.weather_code ?? null,
    cloud_cover_pct: c.cloud_cover ?? null,
    wind_speed_kmh: c.wind_speed_10m ?? null,
    wind_gust_kmh: c.wind_gusts_10m ?? null,
    humidity_pct: c.relative_humidity_2m ?? null,
    is_day: c.is_day ?? null,
  };
}
