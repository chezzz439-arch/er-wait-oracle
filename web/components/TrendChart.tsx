'use client';
import { useMemo, useState } from 'react';
import { LineChart } from 'lucide-react';
import { LEVEL_HEX } from '@/lib/theme';
import { fillSeries, modeledDayCurve, sfHour } from '@/lib/diurnal';
import { levelFromScore } from '@/lib/busyness';
import type { HospitalView } from '@/lib/types';

const W = 340;
const H = 150;
const PAD_T = 10;
const PAD_B = 22;

const xAt = (hour: number) => (hour / 23) * W;
const yAt = (score: number) => PAD_T + (1 - Math.max(0, Math.min(100, score)) / 100) * (H - PAD_T - PAD_B);

// Catmull-Rom → cubic Bézier, for a smooth (non-jagged) line through the points.
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

function curveFor(h: HospitalView, nowHour: number): number[] {
  return fillSeries(h.history) ?? modeledDayCurve(h.prediction.busyScore, nowHour);
}

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
  const nowHour = useMemo(() => sfHour(), []);
  const [hoverHour, setHoverHour] = useState<number | null>(null);

  const focused = useMemo(
    () => eds.find((h) => h.facilityId === focusedId) ?? eds[0] ?? null,
    [eds, focusedId]
  );

  const curves = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const h of eds) map.set(h.facilityId, curveFor(h, nowHour));
    return map;
  }, [eds, nowHour]);

  if (!focused) return null;

  const focusCurve = curves.get(focused.facilityId)!;
  const focusHue = LEVEL_HEX[levelFromScore(focusCurve[nowHour])];
  const readHour = hoverHour ?? nowHour;
  const readScore = focusCurve[readHour];

  const xLabels = [
    { h: 0, t: '12a' },
    { h: 6, t: '6a' },
    { h: 12, t: '12p' },
    { h: 18, t: '6p' },
    { h: 23, t: '11p' },
  ];

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">
          <LineChart size={13} /> Busyness through the day
        </span>
        <span className="nums text-[0.72rem] font-semibold" style={{ color: focusHue }}>
          {focused.shortName} · {readScore}
          {hoverHour != null ? (
            <span className="ml-1 font-normal text-muted">@ {fmtHour(readHour)}</span>
          ) : (
            <span className="ml-1 font-normal text-muted">now</span>
          )}
        </span>
      </div>

      <div
        className="relative"
        onMouseLeave={() => setHoverHour(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const frac = (e.clientX - rect.left) / rect.width;
          setHoverHour(Math.max(0, Math.min(23, Math.round(frac * 23))));
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" preserveAspectRatio="none">
          {/* horizontal gridlines */}
          {[0, 25, 50, 75, 100].map((s) => (
            <line
              key={s}
              x1={0}
              x2={W}
              y1={yAt(s)}
              y2={yAt(s)}
              stroke="rgb(var(--c-hairline))"
              strokeWidth={1}
              strokeDasharray={s === 0 ? undefined : '2 4'}
            />
          ))}

          {/* faint context lines for every other ED */}
          {eds
            .filter((h) => h.facilityId !== focused.facilityId)
            .map((h) => {
              const c = curves.get(h.facilityId)!;
              return (
                <path
                  key={h.facilityId}
                  d={smoothPath(c.map((s, hr) => [xAt(hr), yAt(s)]))}
                  fill="none"
                  stroke="rgb(var(--c-muted))"
                  strokeOpacity={0.18}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-pointer"
                  onMouseEnter={() => onHover(h.facilityId)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => onSelect(h.facilityId)}
                />
              );
            })}

          {/* now marker */}
          <line
            x1={xAt(nowHour)}
            x2={xAt(nowHour)}
            y1={PAD_T - 4}
            y2={H - PAD_B}
            stroke="rgb(var(--c-accent))"
            strokeWidth={1}
            strokeDasharray="3 3"
            strokeOpacity={0.6}
          />

          {/* focused line + area */}
          <path
            d={`${smoothPath(focusCurve.map((s, hr) => [xAt(hr), yAt(s)]))} L ${W} ${H - PAD_B} L 0 ${
              H - PAD_B
            } Z`}
            fill={focusHue}
            fillOpacity={0.08}
          />
          <path
            d={smoothPath(focusCurve.map((s, hr) => [xAt(hr), yAt(s)]))}
            fill="none"
            stroke={focusHue}
            strokeWidth={2.4}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* read dot (hovered hour, or now) */}
          <circle cx={xAt(readHour)} cy={yAt(readScore)} r={3.5} fill={focusHue} stroke="rgb(var(--c-surface))" strokeWidth={2} />

          {/* x-axis labels */}
          {xLabels.map((l) => (
            <text
              key={l.h}
              x={Math.max(8, Math.min(W - 8, xAt(l.h)))}
              y={H - 6}
              textAnchor="middle"
              className="fill-muted"
              style={{ fontSize: 9 }}
            >
              {l.t}
            </text>
          ))}
        </svg>
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

function fmtHour(h: number): string {
  const am = h < 12;
  const v = h % 12 === 0 ? 12 : h % 12;
  return `${v}${am ? 'a' : 'p'}`;
}
