// Single source of truth for the "Calm Clinical" palette. Imported by both the
// Tailwind config (for utility classes) and by JS that builds Leaflet divIcons
// (which need raw hex, not classes).
import type { BusyLevel } from './types';

export const PALETTE = {
  bg: '#F7F9FB',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F4F8',
  border: '#E5EAF0',
  textPrimary: '#0F1B2D',
  textMuted: '#6B7A90',
  accent: '#0E9F9A', // medical teal — the "where to go" channel, separate from busyness
  busyLow: '#1FAE68',
  busyModerate: '#E0A21C',
  busyHigh: '#EC7A2C',
  busySevere: '#E04A39',
} as const;

export const LEVEL_HEX: Record<BusyLevel, string> = {
  low: PALETTE.busyLow,
  moderate: PALETTE.busyModerate,
  high: PALETTE.busyHigh,
  severe: PALETTE.busySevere,
};

export const LEVEL_LABEL: Record<BusyLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  severe: 'Severe',
};

// Tailwind class fragments per level, for tinted backgrounds/text on chips.
export const LEVEL_BG: Record<BusyLevel, string> = {
  low: 'bg-busyLow',
  moderate: 'bg-busyModerate',
  high: 'bg-busyHigh',
  severe: 'bg-busySevere',
};
