// Synthetic operational metrics for the hospital detail view.
//
// There is no public real-time feed for ER door-to-provider waits, ambulance
// availability, or open ED beds (see the project README). These figures are
// DERIVED, deterministic estimates from the busy score + CMS baseline so the
// detail view feels alive and useful — always clearly labeled "estimated /
// simulated" in the UI so the demo stays honest.
import type { HospitalView } from './types';

// Small stable hash (0..1) from a facility id, for per-hospital variation that
// doesn't change between renders.
function seed01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export interface SyntheticOps {
  waitMinutes: number; // estimated door-to-provider wait
  ambulancesAvailable: number;
  ambulancesTotal: number;
  edBedsOpen: number;
  edBedsTotal: number;
  leftWithoutSeenPct: number | null; // real CMS OP_22 when present
  diverting: boolean; // simulated ambulance-diversion status
}

export function syntheticOps(h: HospitalView): SyntheticOps {
  const score = h.prediction.busyScore;
  const s = seed01(h.facilityId);

  // Wait scales with load, anchored on CMS median throughput when available.
  const baseProcess = h.baseline.op18b ?? 180;
  const waitMinutes = Math.round(clamp((baseProcess * (0.25 + score / 110)) - 30, 8, 240));

  // Bigger EDs (higher volume tier) run larger fleets and bed counts.
  const tier = h.baseline.edvOrdinal ?? 2;
  const ambulancesTotal = 4 + tier * 2 + Math.round(s * 2); // ~6..14
  const ambulancesAvailable = Math.max(
    0,
    Math.round(ambulancesTotal * (1 - score / 100) - s)
  );

  const edBedsTotal = 12 + tier * 8 + Math.round(s * 6); // ~20..50
  const edBedsOpen = Math.max(0, Math.round(edBedsTotal * (1 - score / 100) * 0.8 - s * 2));

  return {
    waitMinutes,
    ambulancesAvailable,
    ambulancesTotal,
    edBedsOpen,
    edBedsTotal,
    leftWithoutSeenPct: h.baseline.op22,
    diverting: score >= 88 && s > 0.4,
  };
}
