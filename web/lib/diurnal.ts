// Shared diurnal (time-of-day) shape, used by the trend chart to model a hospital's
// busyness curve across the day when no recorded forecast history exists yet. Mirrors
// the deltas in lib/busyness.ts so the modeled curve is consistent with the heuristic.
// Pure + client-safe (no server-only imports).

// Additive busyness delta vs. the daily baseline for a given local hour (0-23).
export function diurnalDelta(hour: number): number {
  if (hour >= 17 && hour <= 22) return 12; // evening peak
  if (hour >= 11 && hour <= 16) return 4; // afternoon
  if (hour >= 23 || hour <= 1) return 6; // late night
  if (hour >= 2 && hour <= 6) return -14; // pre-dawn lull
  return 0; // morning
}

// Build a 24-point modeled busyness curve anchored so the current hour ≈ current score.
export function modeledDayCurve(currentScore: number, nowHour: number): number[] {
  const base = currentScore - diurnalDelta(nowHour);
  return Array.from({ length: 24 }, (_, h) =>
    Math.round(Math.max(4, Math.min(98, base + diurnalDelta(h))))
  );
}

// Current hour (0-23) in San Francisco local time. Safe on client and server.
export function sfHour(now: Date = new Date()): number {
  const v = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    hour12: false,
  }).format(now);
  return Number(v) % 24;
}

// Fill nulls in a 24-length series by linear interpolation between known points,
// extending the nearest known value past the ends. Returns null if nothing is known.
export function fillSeries(points: (number | null)[]): number[] | null {
  const known = points.map((v, i) => (v == null ? null : { i, v })).filter(Boolean) as {
    i: number;
    v: number;
  }[];
  if (!known.length) return null;
  const out: number[] = new Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const exact = known.find((k) => k.i === i);
    if (exact) {
      out[i] = exact.v;
      continue;
    }
    const before = [...known].reverse().find((k) => k.i < i);
    const after = known.find((k) => k.i > i);
    if (before && after) {
      const t = (i - before.i) / (after.i - before.i);
      out[i] = Math.round(before.v + (after.v - before.v) * t);
    } else {
      out[i] = (before ?? after)!.v;
    }
  }
  return out;
}
