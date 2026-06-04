// Shared dashboard contract — the exact shape of GET /api/dashboard.
// Both the route handler and every UI component import these.
import type { Incident } from './incidents';

export type BusyLevel = 'low' | 'moderate' | 'high' | 'severe';

// Where a busyness number came from: a real Claude forecast, or the transparent
// time/weather/baseline heuristic we fall back to when no model run exists yet.
export type BusySource = 'model' | 'heuristic';

export interface HospitalBaseline {
  edv: string | null; // CMS volume tier label: low | medium | high | very high
  edvOrdinal: number | null; // 1..4
  op18b: number | null; // median ED arrival→departure minutes (discharged)
  op22: number | null; // % who left without being seen
}

export interface HospitalPrediction {
  busyScore: number; // 0..100
  busyLevel: BusyLevel;
  confidence: number; // 0..1
  reasoning: string;
  keyFactors: string[];
  source: BusySource;
}

export interface HospitalView {
  facilityId: string;
  name: string; // prettified, Title Case
  shortName: string;
  address: string;
  city?: string;
  state?: string;
  lat: number;
  lng: number;
  hasEd: boolean; // false for non-acute facilities (excluded from the recommendation)
  distanceMiles: number | null; // from the active location (GPS or default), if known
  baseline: HospitalBaseline;
  prediction: HospitalPrediction; // always present (model row or heuristic)
  history: (number | null)[]; // 24 hourly avg busy scores (SF hour 0..23), null = no data
}

export interface WeatherView {
  observedAt: string;
  temperatureF: number | null;
  apparentTempF: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  humidityPct: number | null;
  weatherCode: number | null;
  condition: string;
}

export interface Recommendation {
  facilityId: string;
  name: string;
  shortName: string;
  busyScore: number;
  busyLevel: BusyLevel;
  reasoning: string;
  rationale: string; // why THIS one was chosen vs the others
  etaMinutes: number | null; // baseline median throughput, a tangible "expected" number
  distanceMiles: number | null; // travel distance from the active location
}

// The location the dashboard is centered on — the user's GPS, or the SF default.
export interface DashboardLocation {
  lat: number;
  lng: number;
  label: string; // e.g. "San Francisco, CA" or "Near you"
  source: 'gps' | 'default';
}

export interface DashboardData {
  generatedAt: string; // ISO, when this payload was built
  predictedAt: string | null; // timestamp of the latest model forecast, if any
  horizonHours: number;
  predictionSource: BusySource; // 'model' if any hospital has a real forecast
  weather: WeatherView | null;
  location: DashboardLocation; // where the view is centered (GPS or default)
  hospitals: HospitalView[];
  recommendation: Recommendation | null;
  incidents: Incident[]; // simulated situational drivers (clearly labeled in UI)
  hasHistory: boolean; // true if any hospital has recorded forecast history
  dataState: 'ok' | 'no-data';
  notice: string | null; // human-readable note (e.g. degraded/no-DB)
}

// Re-exported so components can import Incident from the central types module.
export type { Incident } from './incidents';
