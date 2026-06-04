// GET /api/dashboard — the single endpoint the UI polls every 5 minutes.
//
// Resilient by design: it ALWAYS returns all 10 hospitals (from the static lookup)
// with coordinates, so the map renders even if ClickHouse is unreachable. Each
// hospital is enriched with its CMS baseline + either a real Claude forecast or the
// transparent heuristic estimate. The recommendation is the least-busy acute ER.
import { NextResponse } from 'next/server';
import { safeQuery } from '@/lib/clickhouse';
import {
  HOSPITAL_META,
  HOSPITAL_NAMES,
  HOSPITAL_ADDRESSES,
  prettifyName,
} from '@/lib/hospitals';
import { heuristicPrediction, levelFromScore } from '@/lib/busyness';
import { buildIncidents } from '@/lib/incidents';
import type {
  DashboardData,
  HospitalBaseline,
  HospitalPrediction,
  HospitalView,
  Recommendation,
  WeatherView,
} from '@/lib/types';

// Never cache — this is live data.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WEATHER_CODES: Record<number, string> = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog',
  48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow',
  75: 'Heavy snow', 80: 'Rain showers', 81: 'Heavy showers', 82: 'Violent showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Severe thunderstorm',
};

interface BaselineRow {
  facility_id: string;
  facility_name: string;
  address: string;
  measures: [string, string, number | null][];
}
interface PredictionRow {
  facility_id: string;
  facility_name: string;
  busy_score: number;
  busy_level: string;
  confidence: number;
  reasoning: string;
  key_factors: string[];
  predicted_at: string;
  horizon_hours: number;
}
interface WeatherRow {
  observed_at: string;
  temperature_f: number | null;
  apparent_temp_f: number | null;
  precipitation_mm: number | null;
  wind_speed_kmh: number | null;
  humidity_pct: number | null;
  weather_code: number | null;
}
interface HistoryRow {
  facility_id: string;
  hr: number; // SF local hour 0..23
  score: number; // avg busy_score recorded at that hour
}

const EDV_LABEL: Record<number, string> = { 1: 'low', 2: 'medium', 3: 'high', 4: 'very high' };

function baselineFromMeasures(measures: [string, string, number | null][]): HospitalBaseline {
  const map = new Map(measures.map((m) => [m[0], { raw: m[1], num: m[2] }]));
  const edvNum = map.get('EDV')?.num ?? null;
  const edvRaw = map.get('EDV')?.raw ?? null;
  return {
    edv: edvRaw && !/not available/i.test(edvRaw) ? edvRaw : edvNum ? EDV_LABEL[edvNum] : null,
    edvOrdinal: edvNum,
    op18b: map.get('OP_18b')?.num ?? null,
    op22: map.get('OP_22')?.num ?? null,
  };
}

export async function GET() {
  const now = new Date();

  const [predRows, baseRows, weatherRows, histRows] = await Promise.all([
    safeQuery<PredictionRow>(`
      SELECT facility_id, facility_name, busy_score, busy_level, confidence,
             reasoning, key_factors, toString(predicted_at) AS predicted_at, horizon_hours
      FROM predictions
      WHERE predicted_at = (SELECT max(predicted_at) FROM predictions)`),
    safeQuery<BaselineRow>(`
      SELECT facility_id, any(facility_name) AS facility_name, any(address) AS address,
             groupArray((measure_id, score_raw, score_num)) AS measures
      FROM (
        SELECT facility_id, facility_name, address, measure_id, score_raw, score_num
        FROM er_wait_observations
        ORDER BY observed_at DESC
        LIMIT 1 BY facility_id, measure_id
      )
      GROUP BY facility_id`),
    safeQuery<WeatherRow>(`
      SELECT toString(observed_at) AS observed_at, temperature_f, apparent_temp_f,
             precipitation_mm, wind_speed_kmh, humidity_pct, weather_code
      FROM weather_observations ORDER BY observed_at DESC LIMIT 1`),
    // Hourly busyness profile per facility over recent history (SF local hour).
    safeQuery<HistoryRow>(`
      SELECT facility_id,
             toHour(toTimeZone(predicted_at, 'America/Los_Angeles')) AS hr,
             round(avg(busy_score)) AS score
      FROM predictions
      WHERE predicted_at >= now() - INTERVAL 14 DAY
      GROUP BY facility_id, hr`),
  ]);

  const baseById = new Map(baseRows.map((r) => [r.facility_id, r]));
  const predById = new Map(predRows.map((r) => [r.facility_id, r]));

  // Build a 24-slot (hour-of-day) busyness series per facility from history.
  const histById = new Map<string, (number | null)[]>();
  for (const r of histRows) {
    let arr = histById.get(r.facility_id);
    if (!arr) {
      arr = new Array(24).fill(null);
      histById.set(r.facility_id, arr);
    }
    if (r.hr >= 0 && r.hr < 24) arr[r.hr] = Math.round(Number(r.score));
  }

  const weatherRow = weatherRows[0];
  const weather: WeatherView | null = weatherRow
    ? {
        observedAt: weatherRow.observed_at,
        temperatureF: weatherRow.temperature_f,
        apparentTempF: weatherRow.apparent_temp_f,
        precipitationMm: weatherRow.precipitation_mm,
        windSpeedKmh: weatherRow.wind_speed_kmh,
        humidityPct: weatherRow.humidity_pct,
        weatherCode: weatherRow.weather_code,
        condition: weatherRow.weather_code != null ? WEATHER_CODES[weatherRow.weather_code] ?? 'Unknown' : 'Unknown',
      }
    : null;

  const horizonHours = predRows[0]?.horizon_hours ?? 4;
  const predictedAt = predRows[0]?.predicted_at ?? null;
  const anyModel = predRows.length > 0;

  const hospitals: HospitalView[] = Object.values(HOSPITAL_META).map((meta) => {
    const base = baseById.get(meta.facilityId);
    const baseline = base ? baselineFromMeasures(base.measures) : { edv: null, edvOrdinal: null, op18b: null, op22: null };

    const modelRow = predById.get(meta.facilityId);
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

    const name = base?.facility_name ? prettifyName(base.facility_name) : HOSPITAL_NAMES[meta.facilityId];
    return {
      facilityId: meta.facilityId,
      name,
      shortName: meta.shortName,
      address: base?.address ? prettifyName(base.address) : HOSPITAL_ADDRESSES[meta.facilityId],
      lat: meta.lat,
      lng: meta.lng,
      hasEd: meta.hasEd,
      baseline,
      prediction,
      history: histById.get(meta.facilityId) ?? new Array(24).fill(null),
    };
  });

  // Recommendation: the least-busy acute ER, tie-broken by faster baseline throughput.
  const candidates = hospitals.filter((h) => h.hasEd);
  candidates.sort((a, b) => {
    if (a.prediction.busyScore !== b.prediction.busyScore) return a.prediction.busyScore - b.prediction.busyScore;
    return (a.baseline.op18b ?? 999) - (b.baseline.op18b ?? 999);
  });

  let recommendation: Recommendation | null = null;
  if (candidates.length) {
    const best = candidates[0];
    const runnerUp = candidates[1];
    const gap = runnerUp ? runnerUp.prediction.busyScore - best.prediction.busyScore : 0;
    const rationale =
      `Lowest predicted load (${best.prediction.busyScore}/100) of SF's acute ERs right now` +
      (runnerUp ? `, ${gap > 0 ? `${gap} pts below ${runnerUp.shortName}` : `tied but faster throughput than ${runnerUp.shortName}`}.` : '.') +
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
    };
  }

  const haveAnyData = baseRows.length > 0 || predRows.length > 0 || weather != null;

  const payload: DashboardData = {
    generatedAt: now.toISOString(),
    predictedAt,
    horizonHours,
    predictionSource: anyModel ? 'model' : 'heuristic',
    weather,
    hospitals,
    recommendation,
    incidents: buildIncidents(now, weather),
    hasHistory: histRows.length > 0,
    dataState: haveAnyData ? 'ok' : 'no-data',
    notice: anyModel
      ? null
      : haveAnyData
        ? 'Showing heuristic estimates (CMS baseline + time + weather). Run the Claude forecast for model predictions.'
        : 'ClickHouse has no data yet — run the ingest pipeline. Showing time-based estimates.',
  };

  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}
