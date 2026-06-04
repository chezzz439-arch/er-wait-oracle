// Simulated incident feed.
//
// Real-time event/EMS feeds aren't public, so this synthesizes PLAUSIBLE SF
// situational drivers from the current time, day, season and live weather, and
// ties each to the ERs nearest the action. Every card is labeled "Simulated" in
// the UI. Deterministic for a given moment (no randomness) so it's stable across
// the 5-minute polling window.
import type { WeatherView } from './types';

export interface Incident {
  id: string;
  kind: 'event' | 'nightlife' | 'weather' | 'traffic' | 'seasonal';
  title: string;
  detail: string;
  severity: 'info' | 'watch' | 'elevated';
  nearFacilityIds: string[];
}

// Facility ids (from lib/hospitals) referenced by name for readability.
const ZSF = '050228'; // ZSF General — closest to Oracle Park / Chase Center / SoMa
const MISSION = '050055'; // CPMC Mission Bernal — Mission district
const DAVIES = '050008'; // CPMC Davies — Castro / Duboce
const VANNESS = '050047'; // CPMC Van Ness — downtown / Tenderloin edge
const STFRANCIS = '050152'; // UCSF St. Francis — Nob Hill / Tenderloin

interface SfParts {
  hour: number;
  weekday: number; // 0=Sun..6=Sat
  month: number; // 1..12
}

function sfParts(now: Date): SfParts {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
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

export function buildIncidents(now: Date, weather: WeatherView | null): Incident[] {
  const { hour, weekday, month } = sfParts(now);
  const isWeekend = weekday === 0 || weekday === 6;
  const out: Incident[] = [];

  // ── Giants baseball (Apr–Sep, Oracle Park) ────────────────────────────────
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
      nearFacilityIds: [ZSF, MISSION],
    });
  }

  // ── Warriors basketball (Oct–Apr, Chase Center) ───────────────────────────
  const nbaSeason = month >= 10 || month <= 4;
  if (nbaSeason && hour >= 21 && hour <= 23 && !out.find((i) => i.id === 'giants')) {
    out.push({
      id: 'warriors',
      kind: 'event',
      title: 'Warriors game wrapping at Chase Center',
      detail: 'Mission Bay crowds heading out — minor surge likely near the waterfront ERs.',
      severity: 'watch',
      nearFacilityIds: [ZSF, MISSION],
    });
  }

  // ── Weekend nightlife (Fri/Sat late) ──────────────────────────────────────
  const fridayOrSat = weekday === 5 || weekday === 6;
  if (fridayOrSat && (hour >= 22 || hour <= 2)) {
    out.push({
      id: 'nightlife',
      kind: 'nightlife',
      title: 'Peak nightlife hours in SoMa & the Mission',
      detail: 'Bars at capacity — alcohol-related visits typically climb after midnight.',
      severity: 'watch',
      nearFacilityIds: [ZSF, MISSION, DAVIES],
    });
  }

  // ── Weather-driven ────────────────────────────────────────────────────────
  if ((weather?.precipitationMm ?? 0) > 1.2) {
    out.push({
      id: 'rain',
      kind: 'weather',
      title: 'Active rain across the city',
      detail: 'Slick roads raise collision and fall volume — load rising city-wide.',
      severity: 'elevated',
      nearFacilityIds: [ZSF, VANNESS],
    });
  } else if ((weather?.temperatureF ?? 60) < 46) {
    out.push({
      id: 'cold',
      kind: 'weather',
      title: 'Cold snap overnight',
      detail: 'Respiratory and cardiac presentations tend to tick up in the cold.',
      severity: 'watch',
      nearFacilityIds: [STFRANCIS, VANNESS],
    });
  } else if (weather?.weatherCode === 45 || weather?.weatherCode === 48) {
    out.push({
      id: 'fog',
      kind: 'weather',
      title: 'Dense fog advisory',
      detail: 'Reduced visibility on the bridges and 19th Ave — watch for traffic injuries.',
      severity: 'info',
      nearFacilityIds: [STFRANCIS],
    });
  }

  // ── Weekday rush-hour traffic ─────────────────────────────────────────────
  if (!isWeekend && hour >= 16 && hour <= 19) {
    out.push({
      id: 'rush',
      kind: 'traffic',
      title: 'Evening rush hour on the 101 & 280',
      detail: 'Heavier traffic means more collision-related arrivals at trauma-capable ERs.',
      severity: 'info',
      nearFacilityIds: [ZSF],
    });
  }

  // ── Quiet-period reassurance (nothing else fired) ─────────────────────────
  if (!out.length) {
    out.push({
      id: 'calm',
      kind: 'info' as Incident['kind'],
      title: 'No major situational drivers right now',
      detail: 'No games, storms or rush-hour spikes detected — loads reflect baseline patterns.',
      severity: 'info',
      nearFacilityIds: [],
    });
  }

  const rank: Record<Incident['severity'], number> = { elevated: 0, watch: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 4);
}
