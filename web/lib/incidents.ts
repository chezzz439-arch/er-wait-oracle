// Simulated incident feed.
//
// Real-time event/EMS feeds aren't public, so this synthesizes PLAUSIBLE
// situational drivers from the current time, day, season and live weather, and
// ties each to the ERs nearest the user. SF-specific venue copy (Giants/Warriors)
// only appears when the user is actually near San Francisco; elsewhere the feed
// uses location-neutral weather/time drivers. Every card is labeled "Simulated"
// in the UI. Deterministic for a given moment (no randomness).
import type { WeatherView } from './types';

export interface Incident {
  id: string;
  kind: 'event' | 'nightlife' | 'weather' | 'traffic' | 'seasonal';
  title: string;
  detail: string;
  severity: 'info' | 'watch' | 'elevated';
  nearFacilityIds: string[];
}

export interface IncidentContext {
  nearSF: boolean;
  nearbyIds: string[]; // ids of the closest few ERs, for "near" tags
}

interface SfParts {
  hour: number;
  weekday: number; // 0=Sun..6=Sat
  month: number; // 1..12
}

function localParts(now: Date): SfParts {
  const p = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    weekday: 'short',
    month: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    hour: Number(get('hour')) % 24,
    weekday: wdMap[get('weekday')] ?? 0,
    month: Number(get('month')) || 1,
  };
}

export function buildIncidents(
  now: Date,
  weather: WeatherView | null,
  ctx: IncidentContext = { nearSF: true, nearbyIds: [] }
): Incident[] {
  const { hour, weekday, month } = localParts(now);
  const isWeekend = weekday === 0 || weekday === 6;
  const near = ctx.nearbyIds;
  const out: Incident[] = [];

  // ── SF-specific big-venue events (only when actually near SF) ─────────────
  if (ctx.nearSF) {
    const baseballSeason = month >= 4 && month <= 9;
    const eveningGameLetout = hour >= 21 && hour <= 23;
    const weekendDayGame = isWeekend && hour >= 15 && hour <= 17;
    if (baseballSeason && (eveningGameLetout || weekendDayGame)) {
      out.push({
        id: 'giants',
        kind: 'event',
        title: 'Giants game letting out at Oracle Park',
        detail: '40K+ crowd dispersing through SoMa — expect a 2–3 hr bump in nearby ERs.',
        severity: 'elevated',
        nearFacilityIds: near.slice(0, 2),
      });
    }
    const nbaSeason = month >= 10 || month <= 4;
    if (nbaSeason && hour >= 21 && hour <= 23 && !out.find((i) => i.id === 'giants')) {
      out.push({
        id: 'warriors',
        kind: 'event',
        title: 'Warriors game wrapping at Chase Center',
        detail: 'Mission Bay crowds heading out — minor surge likely near the waterfront ERs.',
        severity: 'watch',
        nearFacilityIds: near.slice(0, 2),
      });
    }
  }

  // ── Weekend nightlife (location-neutral) ──────────────────────────────────
  const fridayOrSat = weekday === 5 || weekday === 6;
  if (fridayOrSat && (hour >= 22 || hour <= 2)) {
    out.push({
      id: 'nightlife',
      kind: 'nightlife',
      title: 'Peak nightlife hours',
      detail: 'Bars and venues at capacity — alcohol-related visits typically climb after midnight.',
      severity: 'watch',
      nearFacilityIds: near.slice(0, 3),
    });
  }

  // ── Weather-driven ────────────────────────────────────────────────────────
  if ((weather?.precipitationMm ?? 0) > 1.2) {
    out.push({
      id: 'rain',
      kind: 'weather',
      title: 'Active rain in your area',
      detail: 'Slick roads raise collision and fall volume — load rising nearby.',
      severity: 'elevated',
      nearFacilityIds: near.slice(0, 2),
    });
  } else if ((weather?.temperatureF ?? 60) < 36) {
    out.push({
      id: 'cold',
      kind: 'weather',
      title: 'Cold conditions',
      detail: 'Respiratory and cardiac presentations tend to tick up in the cold.',
      severity: 'watch',
      nearFacilityIds: near.slice(0, 2),
    });
  } else if ((weather?.temperatureF ?? 70) > 95) {
    out.push({
      id: 'heat',
      kind: 'weather',
      title: 'Heat advisory conditions',
      detail: 'High temperatures drive heat-illness and dehydration visits — load climbing.',
      severity: 'elevated',
      nearFacilityIds: near.slice(0, 2),
    });
  } else if (weather?.weatherCode === 45 || weather?.weatherCode === 48) {
    out.push({
      id: 'fog',
      kind: 'weather',
      title: 'Dense fog advisory',
      detail: 'Reduced visibility on area roads — watch for traffic injuries.',
      severity: 'info',
      nearFacilityIds: near.slice(0, 1),
    });
  }

  // ── Weekday rush-hour traffic (location-neutral) ──────────────────────────
  if (!isWeekend && hour >= 16 && hour <= 19) {
    out.push({
      id: 'rush',
      kind: 'traffic',
      title: 'Evening rush hour',
      detail: 'Heavier traffic means more collision-related arrivals at trauma-capable ERs.',
      severity: 'info',
      nearFacilityIds: near.slice(0, 1),
    });
  }

  // ── Quiet-period reassurance ──────────────────────────────────────────────
  if (!out.length) {
    out.push({
      id: 'calm',
      kind: 'seasonal',
      title: 'No major situational drivers right now',
      detail: 'No big events, storms or rush-hour spikes detected — loads reflect baseline patterns.',
      severity: 'info',
      nearFacilityIds: [],
    });
  }

  const rank: Record<Incident['severity'], number> = { elevated: 0, watch: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 4);
}
