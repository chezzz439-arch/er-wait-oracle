'use client';
import { useMemo, useState } from 'react';
import { LineChart } from 'lucide-react';
import { LEVEL_HEX } from '@/lib/theme';
import { fillSeries, modeledDayCurve } from '@/lib/diurnal';
import { levelFromScore } from '@/lib/busyness';
import type { HospitalView } from '@/lib/types';

// viewBox geometry. Default preserveAspectRatio (meet) keeps text/markers undistorted.
const W = 360;
const H = 168;
const PAD_L = 26; // room for y-axis ticks
const PAD_R = 12;
const PAD_T = 20; // room for the "Now" flag
const PAD_B = 26; // room for x-axis labels

const xAt = (h: number) => PAD_L + (h / 24) * (W - PAD_L - PAD_R);
const yAt = (s: number) => PAD_T + (1 - Math.max(0, Math.min(100, s)) / 100) * (H - PAD_T - PAD_B);

// Catmull-Rom → cubic Bézier for a smooth line.
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

// 25-point day curve (hours 0..24, wrapping midnight) for a hospital.
function dayCurve(h: HospitalView, anchorHour: number): number[] {
  const base = fillSeries(h.history) ?? modeledDayCurve(h.prediction.busyScore, anchorHour);
  return [...base, base[0]]; // close the day at the next midnight
}

const fmtHour = (h: number) => {
  const hr = ((Math.floor(h) % 24) + 24) % 24;
  const am = hr < 12;
  const v = hr % 12 === 0 ? 12 : hr % 12;
  return `${v}${am ? 'am' : 'pm'}`;
};

const X_LABELS = [
  { h: 0, t: '12am' },
  { h: 6, t: '6am' },
  { h: 12, t: '12pm' },
  { h: 18, t: '6pm' },
  { h: 24, t: '12am' },
];

const LEGEND = [
  { label: 'Low', color: LEVEL_HEX.low },
  { label: 'Moderate', color: LEVEL_HEX.moderate },
  { label: 'High', color: LEVEL_HEX.high },
  { label: 'Severe', color: LEVEL_HEX.severe },
];

export default function TrendChart({
  hospitals,
  focusedId,
  hasHistory,
  onSelect,
  onHover,
}: {
  hospitals: HospitalView[];
  focusedId: string | null;
  hasHistory: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const eds = useMemo(() => hospitals.filter((h) => h.hasEd), [hospitals]);

  // Use the viewer's local clock for the "Now" marker — most intuitive.
  const local = useMemo(() => new Date(), []);
  const nowHour = local.getHours();
  const nowFrac = local.getHours() + local.getMinutes() / 60;

  const [hoverHour, setHoverHour] = useState<number | null>(null);

  const focused = useMemo(
    () => eds.find((h) => h.facilityId === focusedId) ?? eds[0] ?? null,
    [eds, focusedId]
  );

  const curves = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const h of eds) m.set(h.facilityId, dayCurve(h, nowHour));
    return m;
  }, [eds, nowHour]);

  if (!focused) return null;

  const focusCurve = curves.get(focused.facilityId)!;
  const readHour = hoverHour ?? Math.round(nowFrac);
  const readScore = focusCurve[Math.min(24, Math.max(0, readHour))];
  const readHue = LEVEL_HEX[levelFromScore(readScore)];

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-card">
      {/* Title + live readout */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">
          <LineChart size={13} /> Busyness through the day
        </span>
        <span className="nums text-[0.72rem] font-semibold" style={{ color: readHue }}>
          {focused.shortName} · {readScore}
          <span className="ml-1 font-normal text-muted">
            {hoverHour != null ? `@ ${fmtHour(readHour)}` : 'now'}
          </span>
        </span>
      </div>

      {/* Plain-language explanation */}
      <p className="mt-0.5 text-[0.7rem] leading-snug text-muted">
        Predicted ER load throughout today, based on historical patterns.{' '}
        <span className="font-medium text-ink/70">0 = empty, 100 = overwhelmed.</span>
      </p>

      <div
        className="relative mt-2"
        onMouseLeave={() => setHoverHour(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const frac = (e.clientX - rect.left) / rect.width;
          // map pointer x (over the padded plot area) to an hour 0..24
          const plotFrac = (frac * W - PAD_L) / (W - PAD_L - PAD_R);
          setHoverHour(Math.max(0, Math.min(24, Math.round(plotFrac * 24))));
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
          <defs>
            {/* Colour the focused line by predicted load: green→amber→red */}
            <linearGradient id="trendLoadGrad" gradientUnits="userSpaceOnUse" x1={xAt(0)} y1={0} x2={xAt(24)} y2={0}>
              {focusCurve.map((s, h) => (
                <stop key={h} offset={`${(h / 24) * 100}%`} stopColor={LEVEL_HEX[levelFromScore(s)]} />
              ))}
            </linearGradient>
          </defs>

          {/* Y gridlines + ticks (0 / 50 / 100) */}
          {[0, 25, 50, 75, 100].map((s) => (
            <line
              key={s}
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yAt(s)}
              y2={yAt(s)}
              stroke="rgb(var(--c-hairline))"
              strokeWidth={1}
              strokeDasharray={s === 0 ? undefined : '2 4'}
            />
          ))}
          {[0, 50, 100].map((s) => (
            <text key={s} x={PAD_L - 5} y={yAt(s) + 3} textAnchor="end" className="fill-muted" style={{ fontSize: 8 }}>
              {s}
            </text>
          ))}
          {/* Y meaning labels */}
          <text x={PAD_L + 2} y={yAt(100) - 4} className="fill-busyHigh" style={{ fontSize: 8, opacity: 0.85 }}>
            overwhelmed
          </text>
          <text x={PAD_L + 2} y={yAt(0) - 4} className="fill-busyLow" style={{ fontSize: 8, opacity: 0.85 }}>
            empty
          </text>

          {/* faint context lines for the other ERs */}
          {eds
            .filter((h) => h.facilityId !== focused.facilityId)
            .map((h) => (
              <path
                key={h.facilityId}
                d={smoothPath(curves.get(h.facilityId)!.map((s, i) => [xAt(i), yAt(s)]))}
                fill="none"
                stroke="rgb(var(--c-muted))"
                strokeOpacity={0.12}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                className="cursor-pointer"
                onMouseEnter={() => onHover(h.facilityId)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onSelect(h.facilityId)}
              />
            ))}

          {/* focused area + gradient line */}
          <path
            d={`${smoothPath(focusCurve.map((s, i) => [xAt(i), yAt(s)]))} L ${xAt(24)} ${H - PAD_B} L ${xAt(0)} ${
              H - PAD_B
            } Z`}
            fill="url(#trendLoadGrad)"
            fillOpacity={0.1}
          />
          <path
            d={smoothPath(focusCurve.map((s, i) => [xAt(i), yAt(s)]))}
            fill="none"
            stroke="url(#trendLoadGrad)"
            strokeWidth={2.6}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* "Now" marker — vertical guide + flag + dot */}
          <line
            x1={xAt(nowFrac)}
            x2={xAt(nowFrac)}
            y1={PAD_T - 2}
            y2={H - PAD_B}
            stroke="rgb(var(--c-ink))"
            strokeOpacity={0.45}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <g transform={`translate(${Math.max(xAt(0) + 12, Math.min(xAt(24) - 12, xAt(nowFrac)))}, ${PAD_T - 10})`}>
            <rect x={-13} y={-8} width={26} height={13} rx={6.5} fill="rgb(var(--c-ink))" />
            <text x={0} y={1.5} textAnchor="middle" className="fill-surface" style={{ fontSize: 8, fontWeight: 700 }}>
              Now
            </text>
          </g>
          <circle
            cx={xAt(nowFrac)}
            cy={yAt(focusCurve[Math.min(24, Math.round(nowFrac))])}
            r={3.6}
            fill={LEVEL_HEX[levelFromScore(focusCurve[Math.min(24, Math.round(nowFrac))])]}
            stroke="rgb(var(--c-surface))"
            strokeWidth={2}
          />

          {/* hover readout dot */}
          {hoverHour != null && (
            <circle cx={xAt(readHour)} cy={yAt(readScore)} r={3} fill={readHue} stroke="rgb(var(--c-surface))" strokeWidth={1.5} />
          )}

          {/* X axis labels */}
          {X_LABELS.map((l) => (
            <text key={l.h} x={xAt(l.h)} y={H - 8} textAnchor="middle" className="fill-muted" style={{ fontSize: 8.5 }}>
              {l.t}
            </text>
          ))}
        </svg>
      </div>

      {/* Colour legend */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.64rem] text-muted">
        <span className="font-medium uppercase tracking-wide">Line colour =</span>
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: l.color }} /> {l.label}
          </span>
        ))}
      </div>

      {/* hospital selector chips */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {eds.map((h) => {
          const on = h.facilityId === focused.facilityId;
          return (
            <button
              key={h.facilityId}
              onClick={() => onSelect(h.facilityId)}
              onMouseEnter={() => onHover(h.facilityId)}
              onMouseLeave={() => onHover(null)}
              className={
                'rounded-full px-2 py-0.5 text-[0.66rem] font-medium transition ' +
                (on ? 'text-white' : 'bg-surfaceAlt text-muted hover:text-ink')
              }
              style={on ? { background: LEVEL_HEX[h.prediction.busyLevel] } : undefined}
            >
              {h.shortName}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[0.66rem] leading-snug text-muted">
        {hasHistory
          ? 'From recorded forecasts over the past 14 days, averaged by hour of day.'
          : 'Modeled from the typical daily ED pattern — real history accrues as the pipeline runs hourly.'}
      </p>
    </section>
  );
}
