'use client';
import { useState } from 'react';
import { Compass, Clock, Lightbulb, ArrowRight, Info, Navigation, ChevronDown } from 'lucide-react';
import { BusyScoreRing, BusyLevelPill, ConfidenceMeter, KeyFactorChips } from './primitives';
import { LEVEL_HEX } from '@/lib/theme';
import { mapsDirectionsUrl, type LatLng } from '@/lib/geo';
import type { HospitalView, Recommendation } from '@/lib/types';

export default function RecommendationCard({
  recommendation,
  pick,
  cityAvg,
  notice,
  userLoc,
  onViewOnMap,
  onViewDetails,
}: {
  recommendation: Recommendation | null;
  pick: HospitalView | null;
  cityAvg: number | null;
  notice: string | null;
  userLoc: LatLng | null;
  onViewOnMap: () => void;
  onViewDetails: () => void;
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  // Empty / no-data state — never render a blank or broken card.
  if (!recommendation || !pick) {
    return (
      <section className="rounded-2xl bg-surface p-6 shadow-card">
        <div className="flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-kicker text-accent">
          <Compass size={14} /> Best ER for you right now
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-xl bg-surfaceAlt p-4 text-muted">
          <Info size={18} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-ink">No clear winner yet — limited live data</div>
            <p className="mt-1 text-[0.85rem] leading-relaxed">
              {notice ?? 'Run the ingest pipeline to populate live data.'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const hue = LEVEL_HEX[recommendation.busyLevel];
  const delta = cityAvg != null ? Math.round(cityAvg - recommendation.busyScore) : null;
  const reasoningDistinct =
    recommendation.reasoning && recommendation.reasoning.trim() !== recommendation.rationale.trim();
  const navUrl = mapsDirectionsUrl({ lat: pick.lat, lng: pick.lng, label: pick.name }, userLoc);

  return (
    <section
      className="animate-rise shrink-0 overflow-hidden rounded-2xl bg-surface shadow-card"
      style={{ borderLeft: `3px solid ${hue}` }}
    >
      <div className="p-5">
        {/* (1) Kicker */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-kicker text-accent">
            <Compass size={14} /> Best ER for you right now
          </div>
          <div className="flex items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-wide text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulseDot" /> Live
          </div>
        </div>

        {/* (2)+(3) Verdict + score */}
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1
              key={recommendation.facilityId}
              className="animate-slideSwap font-extrabold leading-[1.02] text-ink line-clamp-2"
              style={{ fontSize: 'clamp(1.9rem, 3.4vw, 2.85rem)' }}
            >
              {recommendation.shortName}
            </h1>
            <p className="mt-1.5 truncate text-[0.8125rem] text-muted">
              {recommendation.name}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <BusyScoreRing score={recommendation.busyScore} level={recommendation.busyLevel} size={58} />
            <BusyLevelPill level={recommendation.busyLevel} />
          </div>
        </div>

        {/* (4) Justifier */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          {delta != null && delta > 0 && (
            <div className="flex items-baseline gap-1.5">
              <span className="nums text-xl font-extrabold text-busyLow">−{delta}</span>
              <span className="text-[0.75rem] font-medium text-muted">vs SF average</span>
            </div>
          )}
          {recommendation.etaMinutes != null && (
            <div className="flex items-center gap-1.5 text-muted">
              <Clock size={15} />
              <span className="nums text-[0.875rem] font-semibold text-ink">
                ≈ {recommendation.etaMinutes} min
              </span>
              <span className="text-[0.75rem]">typical visit</span>
            </div>
          )}
        </div>

        {/* (5) Why — one-line rationale always; full reasoning is expandable */}
        <div className="mt-3 rounded-xl bg-surfaceAlt p-3">
          <div className="flex items-start gap-2.5">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-accent" />
            <div className="text-[0.875rem] leading-relaxed text-ink/90">{recommendation.rationale}</div>
          </div>
          {reasoningDistinct && (
            <>
              <button
                onClick={() => setWhyOpen((v) => !v)}
                className="mt-2 flex items-center gap-1 text-[0.75rem] font-semibold text-accent transition hover:opacity-80"
              >
                Why this ER?
                <ChevronDown size={13} className={'transition-transform ' + (whyOpen ? 'rotate-180' : '')} />
              </button>
              {whyOpen && (
                <p className="mt-1.5 border-t border-hairline pt-2 text-[0.82rem] leading-relaxed text-muted animate-fadeIn">
                  {recommendation.reasoning}
                </p>
              )}
            </>
          )}
        </div>

        {/* (6) Key factors */}
        {pick.prediction.keyFactors?.length > 0 && (
          <div className="mt-3.5">
            <KeyFactorChips factors={pick.prediction.keyFactors} />
          </div>
        )}

        {/* (7) Confidence */}
        <div className="mt-4">
          <ConfidenceMeter value={pick.prediction.confidence} />
        </div>

        {/* (8) Actions */}
        <div className="mt-3.5 flex items-center gap-2">
          <a
            href={navUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-[0.85rem] font-semibold text-white shadow-card transition hover:brightness-95 active:scale-[0.98]"
          >
            <Navigation size={15} /> Navigate
          </a>
          <button
            onClick={onViewDetails}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-hairline px-3.5 py-2.5 text-[0.8rem] font-semibold text-ink transition hover:bg-surfaceAlt"
          >
            Details
          </button>
          <button
            onClick={onViewOnMap}
            title="View on map"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent/40 px-3.5 py-2.5 text-[0.8rem] font-semibold text-accent transition hover:bg-accent/10"
          >
            Map <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
