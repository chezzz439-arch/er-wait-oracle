'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Clock,
  Ambulance,
  BedDouble,
  LogOut,
  Activity,
  Users,
  ChevronDown,
  Lightbulb,
  MapPin,
  TriangleAlert,
} from 'lucide-react';
import { BusyScoreRing, BusyLevelPill, ConfidenceMeter, KeyFactorChips } from './primitives';
import NavigateButton from './NavigateButton';
import { LEVEL_HEX } from '@/lib/theme';
import { syntheticOps } from '@/lib/synthetic';
import { haversineMiles, formatMiles, type LatLng } from '@/lib/geo';
import { fillSeries, modeledDayCurve, sfHour } from '@/lib/diurnal';
import type { HospitalView } from '@/lib/types';

// Compact single-hospital sparkline for the detail header.
function MiniTrend({ hospital, hue }: { hospital: HospitalView; hue: string }) {
  const nowHour = sfHour();
  const curve = fillSeries(hospital.history) ?? modeledDayCurve(hospital.prediction.busyScore, nowHour);
  const w = 280;
  const h = 46;
  const x = (i: number) => (i / 23) * w;
  const y = (s: number) => 4 + (1 - s / 100) * (h - 8);
  const d = curve.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(s)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full" preserveAspectRatio="none">
      <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill={hue} fillOpacity={0.1} />
      <path d={d} fill="none" stroke={hue} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <line x1={x(nowHour)} x2={x(nowHour)} y1={0} y2={h} stroke="rgb(var(--c-accent))" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.6} />
      <circle cx={x(nowHour)} cy={y(curve[nowHour])} r={3} fill={hue} stroke="rgb(var(--c-surface))" strokeWidth={1.5} />
    </svg>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-surfaceAlt p-3">
      <div className="flex items-center gap-1.5 text-[0.66rem] font-medium uppercase tracking-wide text-muted">
        {icon} {label}
      </div>
      <div className="mt-1 nums text-xl font-bold leading-none" style={{ color: tone ?? 'rgb(var(--c-ink))' }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[0.66rem] text-muted">{sub}</div>}
    </div>
  );
}

export default function HospitalDetail({
  hospital,
  recommended,
  userLoc,
  onClose,
}: {
  hospital: HospitalView;
  recommended: boolean;
  userLoc: LatLng | null;
  onClose: () => void;
}) {
  const [whyOpen, setWhyOpen] = useState(true);
  const ops = useMemo(() => syntheticOps(hospital), [hospital]);
  const hue = LEVEL_HEX[hospital.prediction.busyLevel];
  const isModel = hospital.prediction.source === 'model';

  const distance = userLoc ? haversineMiles(userLoc, { lat: hospital.lat, lng: hospital.lng }) : null;

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ambTone =
    ops.ambulancesAvailable === 0 ? LEVEL_HEX.severe : ops.ambulancesAvailable <= 2 ? LEVEL_HEX.high : LEVEL_HEX.low;
  const bedTone = ops.edBedsOpen === 0 ? LEVEL_HEX.severe : ops.edBedsOpen <= 3 ? LEVEL_HEX.high : LEVEL_HEX.low;

  return (
    <div className="fixed inset-0 z-[2000] flex sm:justify-end" role="dialog" aria-modal="true">
      {/* backdrop */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 animate-fadeIn bg-ink/40 backdrop-blur-[2px]"
      />

      {/* panel: bottom sheet on mobile, right drawer on >= sm */}
      <div
        className="thin-scroll relative mt-auto max-h-[88dvh] w-full animate-sheetUp overflow-y-auto rounded-t-2xl bg-surface shadow-float sm:mt-0 sm:max-h-none sm:h-full sm:w-[420px] sm:animate-slideInRight sm:rounded-none"
        style={{ borderTop: `3px solid ${hue}` }}
      >
        {/* sticky header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-hairline bg-surface/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[1.2rem] font-extrabold leading-tight text-ink">{hospital.shortName}</h2>
              {recommended && (
                <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-white">
                  Pick
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1 truncate text-[0.75rem] text-muted">
              <MapPin size={11} className="shrink-0" /> {hospital.address}
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surfaceAlt hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* score + trend */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <BusyScoreRing score={hospital.prediction.busyScore} level={hospital.prediction.busyLevel} size={64} />
              <BusyLevelPill level={hospital.prediction.busyLevel} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between text-[0.66rem] text-muted">
                <span>Today’s pattern</span>
                <span className="rounded-full bg-surfaceAlt px-1.5 py-0.5 font-medium">
                  {isModel ? 'Claude forecast' : 'Heuristic estimate'}
                </span>
              </div>
              <MiniTrend hospital={hospital} hue={hue} />
            </div>
          </div>

          {ops.diverting && (
            <div className="flex items-center gap-2 rounded-xl bg-busySevere/10 px-3 py-2 text-[0.78rem] font-medium text-busySevere">
              <TriangleAlert size={15} /> Likely on ambulance diversion — EMS may be routed elsewhere.
            </div>
          )}

          {/* operational stat grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <Stat
              icon={<Clock size={12} />}
              label="Est. wait"
              value={`~${ops.waitMinutes}m`}
              sub="door to provider"
              tone={hue}
            />
            <Stat
              icon={<Ambulance size={12} />}
              label="Ambulances"
              value={`${ops.ambulancesAvailable}/${ops.ambulancesTotal}`}
              sub="available now"
              tone={ambTone}
            />
            <Stat
              icon={<BedDouble size={12} />}
              label="ED beds"
              value={`${ops.edBedsOpen}/${ops.edBedsTotal}`}
              sub="open"
              tone={bedTone}
            />
            <Stat
              icon={<LogOut size={12} />}
              label="Left unseen"
              value={ops.leftWithoutSeenPct != null ? `${ops.leftWithoutSeenPct}%` : '—'}
              sub="CMS reported"
            />
            <Stat
              icon={<Activity size={12} />}
              label="Typical visit"
              value={hospital.baseline.op18b != null ? `${hospital.baseline.op18b}m` : '—'}
              sub="median, discharged"
            />
            <Stat
              icon={<Users size={12} />}
              label="Volume tier"
              value={hospital.baseline.edv ? cap(hospital.baseline.edv) : '—'}
              sub="CMS annual"
            />
          </div>

          {/* distance + navigate */}
          <div className="flex items-center gap-3">
            {distance != null && (
              <div className="flex items-center gap-1.5 text-[0.8rem] text-muted">
                <MapPin size={14} className="text-accent" />
                <span className="nums font-semibold text-ink">{formatMiles(distance)}</span> away
              </div>
            )}
            <div className="ml-auto">
              <NavigateButton
                dest={{ lat: hospital.lat, lng: hospital.lng, label: hospital.name }}
                origin={userLoc}
              />
            </div>
          </div>

          {/* Why this ER */}
          <div className="rounded-xl border border-hairline">
            <button
              onClick={() => setWhyOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left"
            >
              <span className="flex items-center gap-2 text-[0.85rem] font-semibold text-ink">
                <Lightbulb size={15} className="text-accent" /> Why this busyness?
              </span>
              <ChevronDown
                size={16}
                className={'text-muted transition-transform ' + (whyOpen ? 'rotate-180' : '')}
              />
            </button>
            {whyOpen && (
              <div className="space-y-3 px-3.5 pb-3.5">
                <p className="text-[0.85rem] leading-relaxed text-ink/90">{hospital.prediction.reasoning}</p>
                {hospital.prediction.keyFactors?.length > 0 && (
                  <KeyFactorChips factors={hospital.prediction.keyFactors} max={6} />
                )}
                <ConfidenceMeter value={hospital.prediction.confidence} />
              </div>
            )}
          </div>

          <p className="text-[0.66rem] leading-snug text-muted">
            Wait, ambulance and bed figures are{' '}
            <span className="font-semibold">estimated</span> from the busyness forecast and CMS
            baselines — there is no public real-time ER feed. Volume and median-visit figures are
            real CMS data.
          </p>
        </div>
      </div>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
