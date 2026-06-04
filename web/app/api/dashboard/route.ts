// GET /api/dashboard?lat=&lng= — the single endpoint the UI polls.
//
// Location-aware: returns the nearest ERs to the caller's coordinates (live GPS,
// or the San Francisco default when none is given) from the national CMS-derived
// directory, each enriched with live weather, a busyness forecast, and distance.
// The recommendation blends proximity and predicted load. ClickHouse model
// forecasts (currently SF only) override the heuristic where a facility matches.
//
// Resilient by design: ClickHouse and the model are optional — the national
// directory + live weather + heuristic always produce a full, useful response.
import { NextResponse, type NextRequest } from 'next/server';
import { safeQuery } from '@/lib/clickhouse';
import { nearestHospitals, shortName, isNearSF } from '@/lib/national';
import { heuristicPrediction, levelFromScore } from '@/lib/busyness';
import { buildIncidents } from '@/lib/incidents';
import type {
  DashboardData,
  DashboardLocation,
  HospitalBaseline,
  HospitalPrediction,
  HospitalView,
  Recommendation,
  WeatherView,
} from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SF_DEFAULT = { lat: 37.7749, lng: -122.4194 };
const NEAREST_N = 15;

const WEATHER_CODES: Record<number, string> = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog',
  48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow',
  75: 'Heavy snow', 80: 'Rain showers', 81: 'Heavy showers', 82: 'Violent showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Severe thunderstorm',
};

interface PredictionRow {
  facility_id: string;
  busy_score: number;
  busy_level: string;
  confidence: number;
  reasoning: string;
  key_factors: string[];
}
interface HistoryRow {
  facility_id: string;
  hr: number;
  score: number;
}

// Live current weather for any coordinates (Open-Meteo, free, no key, worldwide).
//
// Open-Meteo has two free hosts; we try the primary then a backup, each attempt
// with its own short timeout, so a slow/blocked host doesn't drop weather. Runs
// server-side (Node runtime) — no CORS, no key — and logs the real failure
// reason to the function logs if every attempt fails.
const WEATHER_HOSTS = [
  'https://api.open-meteo.com/v1/forecast',
  'https://api.open-meteo.com/v1/forecast', // retry primary once before giving up
];

async function fetchWeatherOnce(url: string, ms: number): Promise<WeatherView | null> {
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(ms),
    headers: { 'User-Agent': 'er-wait-oracle/1.0 (+https://github.com/chezzz439-arch/er-wait-oracle)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const c = j.current || {};
  if (c.temperature_2m == null) throw new Error('no current data');
  const code = c.weather_code ?? null;
  return {
    observedAt: c.time ?? '',
    temperatureF: c.temperature_2m ?? null,
    apparentTempF: c.apparent_temperature ?? null,
    precipitationMm: c.precipitation ?? null,
    windSpeedKmh: c.wind_speed_10m ?? null,
    humidityPct: c.relative_humidity_2m ?? null,
    weatherCode: code,
    condition: code != null ? WEATHER_CODES[code] ?? 'Unknown' : 'Unknown',
  };
}

async function fetchWeather(lat: number, lng: number): Promise<WeatherView | null> {
  const qs = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current:
      'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'kmh',
    timezone: 'auto',
  }).toString();

  let lastErr = '';
  for (const host of WEATHER_HOSTS) {
    try {
      return await fetchWeatherOnce(`${host}?${qs}`, 4500);
    } catch (err) {
      lastErr = (err as Error).message;
    }
  }
  console.warn('[weather] Open-Meteo unavailable:', lastErr);
  return null;
}

function parseCoord(v: string | null, lo: number, hi: number): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
}

export async function GET(req: NextRequest) {
  const now = new Date();
  const sp = req.nextUrl.searchParams;
  const lat = parseCoord(sp.get('lat'), -90, 90);
  const lng = parseCoord(sp.get('lng'), -180, 180);
  const hasGps = lat != null && lng != null;
  const origin = hasGps ? { lat, lng } : SF_DEFAULT;

  const nearby = nearestHospitals(origin, NEAREST_N);

  // ClickHouse model forecasts + history (optional; currently SF facilities).
  const ids = nearby.map((n) => `'${n.hospital.id}'`).join(',') || "''";
  const [predRows, histRows, weather] = await Promise.all([
    safeQuery<PredictionRow>(`
      SELECT facility_id, busy_score, busy_level, confidence, reasoning, key_factors
      FROM predictions
      WHERE predicted_at = (SELECT max(predicted_at) FROM predictions)
        AND facility_id IN (${ids})`),
    safeQuery<HistoryRow>(`
      SELECT facility_id,
             toHour(toTimeZone(predicted_at, 'America/Los_Angeles')) AS hr,
             round(avg(busy_score)) AS score
      FROM predictions
      WHERE predicted_at >= now() - INTERVAL 14 DAY
        AND facility_id IN (${ids})
      GROUP BY facility_id, hr`),
    fetchWeather(origin.lat, origin.lng),
  ]);

  const predById = new Map(predRows.map((r) => [r.facility_id, r]));
  const histById = new Map<string, (number | null)[]>();
  for (const r of histRows) {
    let arr = histById.get(r.facility_id);
    if (!arr) {
      arr = new Array(24).fill(null);
      histById.set(r.facility_id, arr);
    }
    if (r.hr >= 0 && r.hr < 24) arr[r.hr] = Math.round(Number(r.score));
  }

  const hospitals: HospitalView[] = nearby.map(({ hospital: h, miles }) => {
    const baseline: HospitalBaseline = {
      edv: h.edv,
      edvOrdinal: h.edvOrdinal,
      op18b: h.op18b,
      op22: h.op22,
    };

    const modelRow = predById.get(h.id);
    let prediction: HospitalPrediction;
    if (modelRow) {
      const score = Math.round(modelRow.busy_score);
      prediction = {
        busyScore: score,
        busyLevel: (modelRow.busy_level as HospitalPrediction['busyLevel']) || levelFromScore(score),
        confidence: modelRow.confidence,
        reasoning: modelRow.reasoning,
        keyFactors: modelRow.key_factors || [],
        source: 'model',
      };
    } else {
      prediction = heuristicPrediction(baseline, weather, now);
    }

    return {
      facilityId: h.id,
      name: h.name,
      shortName: shortName(h.name),
      address: h.address,
      city: h.city,
      state: h.state,
      lat: h.lat,
      lng: h.lng,
      hasEd: true,
      distanceMiles: Number(miles.toFixed(1)),
      baseline,
      prediction,
      history: histById.get(h.id) ?? new Array(24).fill(null),
    };
  });

  // ── Combined proximity + busyness recommendation ──────────────────────────
  // Pick the ER that minimizes a blend of predicted load and travel distance,
  // so a much closer ER wins unless it's substantially busier.
  let recommendation: Recommendation | null = null;
  if (hospitals.length) {
    const scoreOf = (h: HospitalView) => {
      const distScore = Math.min(100, (h.distanceMiles ?? 0) * 6); // ~16 mi → 100
      return 0.55 * h.prediction.busyScore + 0.45 * distScore;
    };
    const ranked = [...hospitals].sort((a, b) => {
      const d = scoreOf(a) - scoreOf(b);
      return d !== 0 ? d : (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0);
    });
    const best = ranked[0];
    const nearest = [...hospitals].sort(
      (a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0)
    )[0];
    const isNearest = best.facilityId === nearest.facilityId;
    const dist = best.distanceMiles;
    const rationale =
      `Best balance of distance and predicted load near you` +
      (dist != null ? ` — about ${dist} mi away` : '') +
      ` with ${best.prediction.busyLevel} load (${best.prediction.busyScore}/100)` +
      (isNearest ? ', and it’s also your closest ER.' : `.`) +
      (best.baseline.op18b ? ` Typical visit runs ~${best.baseline.op18b} min once seen.` : '');
    recommendation = {
      facilityId: best.facilityId,
      name: best.name,
      shortName: best.shortName,
      busyScore: best.prediction.busyScore,
      busyLevel: best.prediction.busyLevel,
      reasoning: best.prediction.reasoning,
      rationale,
      etaMinutes: best.baseline.op18b,
      distanceMiles: best.distanceMiles,
    };
  }

  const nearSF = isNearSF(origin);
  const nearestCity = hospitals[0];
  const label = hasGps
    ? nearestCity?.city
      ? `Near ${nearestCity.city}, ${nearestCity.state}`
      : 'Near you'
    : 'San Francisco, CA';
  const location: DashboardLocation = {
    lat: origin.lat,
    lng: origin.lng,
    label,
    source: hasGps ? 'gps' : 'default',
  };

  const anyModel = predRows.length > 0;
  const payload: DashboardData = {
    generatedAt: now.toISOString(),
    predictedAt: null,
    horizonHours: 4,
    predictionSource: anyModel ? 'model' : 'heuristic',
    weather,
    location,
    hospitals,
    recommendation,
    incidents: buildIncidents(now, weather, {
      nearSF,
      nearbyIds: hospitals.slice(0, 3).map((h) => h.facilityId),
    }),
    hasHistory: histRows.length > 0,
    dataState: hospitals.length ? 'ok' : 'no-data',
    notice: anyModel
      ? null
      : 'Busyness shown is a transparent estimate from CMS baselines, time of day, and live local weather — there is no public real-time ER feed.',
  };

  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}
