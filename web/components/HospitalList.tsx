'use client';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowUpDown, CircleAlert, MapPin, Locate, ChevronRight, Info, Sparkles } from 'lucide-react';
import { BusyLevelPill } from './primitives';
import { LEVEL_HEX } from '@/lib/theme';
import { formatMiles } from '@/lib/geo';
import { syntheticOps } from '@/lib/synthetic';
import type { HospitalView } from '@/lib/types';

type SortMode = 'best' | 'score' | 'distance' | 'name';

// "Best value" — a higher-is-better blend of the things that actually matter when
// choosing an ER: low predicted busyness, short distance, and open capacity
// (ED beds + ambulances). Mirrors the recommendation logic, plus capacity.
function bestValue(h: HospitalView, located: boolean): number {
  const ops = syntheticOps(h);
  const lessBusy = 100 - h.prediction.busyScore; // 0..100, higher = quieter
  const closeness = located ? 100 - Math.min(100, (h.distanceMiles ?? 30) * 6) : 50; // ~16mi → 0
  const bedPct = ops.edBedsTotal ? (ops.edBedsOpen / ops.edBedsTotal) * 100 : 0;
  const ambPct = ops.ambulancesTotal ? (ops.ambulancesAvailable / ops.ambulancesTotal) * 100 : 0;
  const capacity = 0.6 * bedPct + 0.4 * ambPct;
  return 0.4 * lessBusy + (located ? 0.35 : 0.1) * closeness + 0.25 * capacity;
}

function HospitalRow({
  hospital,
  rank,
  active,
  recommended,
  distanceMi,
  onHover,
  onLeave,
  onSelect,
}: {
  hospital: HospitalView;
  rank: number;
  active: boolean;
  recommended: boolean;
  distanceMi: number | null;
  onHover: () => void;
  onLeave: () => void;
  onSelect: () => void;
}) {
  const hue = LEVEL_HEX[hospital.prediction.busyLevel];
  const noBaseline = hospital.baseline.op18b == null;

  return (
    <button
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onSelect}
      className={clsx(
        'group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all',
        active ? 'bg-surfaceAlt shadow-hover -translate-y-px' : 'hover:bg-surfaceAlt',
        recommended && 'ring-1 ring-accent/40'
      )}
    >
      {/* hue edge tick */}
      <span
        className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full"
        style={{ background: hue, opacity: active ? 1 : 0.65 }}
      />
      <span className="nums w-4 shrink-0 text-center text-[0.8rem] font-semibold text-muted">{rank}</span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[1.0625rem] font-semibold leading-tight text-ink">
            {hospital.shortName}
          </span>
          {recommended && (
            <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-white">
              Pick
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[0.72rem] text-muted">
          {distanceMi != null && (
            <span className="inline-flex items-center gap-0.5 font-medium text-accent">
              <MapPin size={11} /> {formatMiles(distanceMi)}
            </span>
          )}
          {noBaseline ? (
            <span className="inline-flex items-center gap-1">
              <CircleAlert size={11} /> Estimate — limited CMS data
            </span>
          ) : (
            <span className="nums">≈ {hospital.baseline.op18b} min typical · {hospital.baseline.edv} volume</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="nums text-2xl font-bold leading-none text-ink">{hospital.prediction.busyScore}</span>
        <BusyLevelPill level={hospital.prediction.busyLevel} />
      </div>
      <ChevronRight size={16} className="shrink-0 text-muted/50 transition group-hover:text-muted" />
    </button>
  );
}

export default function HospitalList({
  hospitals,
  activeFacilityId,
  recommendedId,
  located,
  geoStatus,
  onLocate,
  onHover,
  onSelect,
}: {
  hospitals: HospitalView[];
  activeFacilityId: string | null;
  recommendedId: string | null;
  located: boolean;
  geoStatus: string;
  onLocate: () => void;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  // Default to the "Best value" composite — the most decision-useful order.
  const [sort, setSort] = useState<SortMode>('best');
  const [showInfo, setShowInfo] = useState(false);
  const effectiveSort: SortMode = sort === 'distance' && !located ? 'best' : sort;

  const sorted = useMemo(() => {
    const arr = [...hospitals];
    if (effectiveSort === 'best') arr.sort((a, b) => bestValue(b, located) - bestValue(a, located));
    else if (effectiveSort === 'score') arr.sort((a, b) => a.prediction.busyScore - b.prediction.busyScore);
    else if (effectiveSort === 'name') arr.sort((a, b) => a.shortName.localeCompare(b.shortName));
    else arr.sort((a, b) => (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9));
    return arr;
  }, [hospitals, effectiveSort, located]);

  const cycleSort = () => {
    setSort((s) => {
      if (s === 'best') return 'score';
      if (s === 'score') return located ? 'distance' : 'name';
      if (s === 'distance') return 'name';
      return 'best';
    });
  };
  const sortLabel =
    effectiveSort === 'best' ? 'Best value' : effectiveSort === 'score' ? 'Least busy' : effectiveSort === 'name' ? 'Name' : 'Distance';
  const sortHeadline =
    effectiveSort === 'best'
      ? 'best overall first'
      : effectiveSort === 'score'
        ? 'least busy first'
        : effectiveSort === 'distance'
          ? 'closest first'
          : 'A–Z';

  return (
    <section className="flex flex-col rounded-2xl bg-surface p-2.5 shadow-card">
      {/* Fixed header; the rows below scroll within this panel */}
      <div className="relative mb-1.5 flex items-center justify-between gap-2 px-2 py-1">
        <span className="flex min-w-0 items-center gap-1 truncate text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">
          {located ? `${hospitals.length} nearest ERs` : `${hospitals.length} ERs`} · {sortHeadline}
          <button
            onClick={() => setShowInfo((v) => !v)}
            className="shrink-0 text-muted/70 transition hover:text-accent"
            title="What do the score and sorts mean?"
          >
            <Info size={12} />
          </button>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onLocate}
            className={clsx(
              'flex items-center gap-1 rounded-full px-2 py-1 text-[0.68rem] font-medium transition',
              located ? 'text-accent' : 'text-muted hover:bg-surfaceAlt'
            )}
            title={located ? 'Using your location' : 'Show distances from your location'}
          >
            <Locate size={12} />
            {located ? 'Located' : geoStatus === 'prompting' ? 'Locating…' : 'Near me'}
          </button>
          <button
            onClick={cycleSort}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[0.68rem] font-medium text-muted transition hover:bg-surfaceAlt"
            title="Change sort"
          >
            {effectiveSort === 'best' ? <Sparkles size={12} /> : <ArrowUpDown size={12} />} {sortLabel}
          </button>
        </div>

        {showInfo && (
          <>
            <button
              aria-label="Close"
              onClick={() => setShowInfo(false)}
              className="fixed inset-0 z-[40] cursor-default"
            />
            <div className="absolute right-2 top-9 z-[50] w-[270px] animate-fadeIn rounded-xl border border-hairline bg-surface p-3 text-[0.72rem] leading-relaxed text-muted shadow-float">
              <p className="mb-1.5 font-semibold text-ink">The 0–100 score = predicted ER busyness</p>
              <p>
                Built from each ER’s CMS baseline (patient-volume tier + median visit time), the
                time of day, and live local weather — or a Claude forecast when available.{' '}
                <span className="font-medium text-ink/80">0 = empty, 100 = overwhelmed.</span>
              </p>
              <p className="mt-2 mb-1 font-semibold text-ink">Sort options</p>
              <ul className="space-y-1">
                <li><span className="font-medium text-ink/80">Best value</span> — overall pick: blends low busyness, closeness, and open beds/ambulances.</li>
                <li><span className="font-medium text-ink/80">Least busy</span> — lowest score only.</li>
                <li><span className="font-medium text-ink/80">Distance</span> — closest to you first.</li>
                <li><span className="font-medium text-ink/80">Name</span> — A–Z.</li>
              </ul>
            </div>
          </>
        )}
      </div>
      {geoStatus === 'denied' && (
        <p className="px-2 pb-1 text-[0.66rem] text-busyModerate">
          Location permission denied — distances unavailable.
        </p>
      )}
      <div className="space-y-1.5">
        {sorted.map((h, i) => (
          <HospitalRow
            key={h.facilityId}
            hospital={h}
            rank={i + 1}
            active={activeFacilityId === h.facilityId}
            recommended={recommendedId === h.facilityId}
            distanceMi={located ? h.distanceMiles : null}
            onHover={() => onHover(h.facilityId)}
            onLeave={() => onHover(null)}
            onSelect={() => onSelect(h.facilityId)}
          />
        ))}
      </div>
    </section>
  );
}
