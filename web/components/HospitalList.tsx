'use client';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowUpDown, CircleAlert, MapPin, Locate, ChevronRight } from 'lucide-react';
import { BusyLevelPill } from './primitives';
import { LEVEL_HEX } from '@/lib/theme';
import { formatMiles } from '@/lib/geo';
import type { HospitalView } from '@/lib/types';

type SortMode = 'score' | 'name' | 'distance';

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
  // Default to distance order once we have a real location — it's the useful one.
  const [sort, setSort] = useState<SortMode>('distance');
  const effectiveSort: SortMode = sort === 'distance' && !located ? 'score' : sort;

  const sorted = useMemo(() => {
    const arr = [...hospitals];
    if (effectiveSort === 'score') arr.sort((a, b) => a.prediction.busyScore - b.prediction.busyScore);
    else if (effectiveSort === 'name') arr.sort((a, b) => a.shortName.localeCompare(b.shortName));
    else arr.sort((a, b) => (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9));
    return arr;
  }, [hospitals, effectiveSort]);

  const cycleSort = () => {
    setSort((s) => {
      if (s === 'distance') return 'score';
      if (s === 'score') return 'name';
      return located ? 'distance' : 'score';
    });
  };
  const sortLabel = effectiveSort === 'score' ? 'Score' : effectiveSort === 'name' ? 'Name' : 'Distance';

  return (
    <section className="flex flex-col rounded-2xl bg-surface p-2.5 shadow-card">
      {/* Fixed header; the rows below scroll within this panel */}
      <div className="mb-1.5 flex items-center justify-between gap-2 px-2 py-1">
        <span className="truncate text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">
          {located ? `${hospitals.length} nearest ERs` : `${hospitals.length} ERs`} ·{' '}
          {effectiveSort === 'distance' ? 'closest first' : 'least busy first'}
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
            title="Toggle sort"
          >
            <ArrowUpDown size={12} /> {sortLabel}
          </button>
        </div>
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
