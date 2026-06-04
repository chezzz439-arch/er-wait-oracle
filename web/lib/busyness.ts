// Busyness scoring helpers shared by the API route.
//
// Two responsibilities:
//   1. levelFromScore — the canonical 0-100 → {low,moderate,high,severe} mapping,
//      identical to the pipeline's prediction scale.
//   2. heuristicPrediction — a transparent fallback estimate from CMS baseline +
//      time-of-day + weather, used for any hospital that has no Claude forecast yet
//      (e.g. before ANTHROPIC_API_KEY is configured). Clearly tagged source:'heuristic'
//      so the UI can label it, keeping the demo honest AND always populated.
import type { BusyLevel, HospitalBaseline, HospitalPrediction, WeatherView } from './types';

export function levelFromScore(score: number): BusyLevel {
  if (score <= 30) return 'low';
  if (score <= 55) return 'moderate';
  if (score <= 80) return 'high';
  return 'severe';
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Current hour (0-23) and weekend flag in San Francisco local time.
export function sfClock(now: Date = new Date()): { hour: number; isWeekend: boolean } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 12) % 24;
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
  return { hour, isWeekend: wd === 'Sat' || wd === 'Sun' };
}

// Diurnal load curve: EDs run heavier in the evening, lighter pre-dawn.
function timeOfDayDelta(hour: number): { delta: number; label: string } {
  if (hour >= 17 && hour <= 22) return { delta: 12, label: 'evening peak' };
  if (hour >= 11 && hour <= 16) return { delta: 4, label: 'afternoon' };
  if (hour >= 23 || hour <= 1) return { delta: 6, label: 'late night' };
  if (hour >= 2 && hour <= 6) return { delta: -14, label: 'pre-dawn lull' };
  return { delta: 0, label: 'morning' };
}

export function heuristicPrediction(
  baseline: HospitalBaseline,
  weather: WeatherView | null,
  now: Date = new Date()
): HospitalPrediction {
  const factors: string[] = [];

  // Base level from CMS volume tier (1..4). No tier → neutral midpoint.
  const tierBase: Record<number, number> = { 1: 26, 2: 44, 3: 60, 4: 76 };
  let score = baseline.edvOrdinal ? tierBase[baseline.edvOrdinal] : 50;
  if (baseline.edv) factors.push(`${baseline.edv}-volume ED`);

  // Throughput: slower departments (higher OP_18b) crowd more readily.
  if (baseline.op18b != null) {
    score += clamp((baseline.op18b - 185) / 9, -12, 16);
    if (baseline.op18b >= 250) factors.push('slow throughput');
  }

  // Time of day.
  const tod = timeOfDayDelta(sfClock(now).hour);
  score += tod.delta;
  if (Math.abs(tod.delta) >= 6) factors.push(tod.label);
  if (sfClock(now).isWeekend) {
    score += 5;
    factors.push('weekend');
  }

  // Weather pressure: precip → injuries/traffic; cold snaps → respiratory/cardiac.
  if (weather) {
    if ((weather.precipitationMm ?? 0) > 0.1) {
      score += 7;
      factors.push('active precipitation');
    }
    if ((weather.temperatureF ?? 60) < 46) {
      score += 4;
      factors.push('cold');
    }
  }

  score = Math.round(clamp(score, 5, 97));
  const level = levelFromScore(score);

  return {
    busyScore: score,
    busyLevel: level,
    confidence: 0.45, // heuristic is intentionally less confident than the model
    reasoning: `Estimated from CMS baseline${baseline.edv ? ` (${baseline.edv} volume)` : ''}, time of day, and current weather — no model forecast available yet.`,
    keyFactors: factors.slice(0, 4),
    source: 'heuristic',
  };
}
