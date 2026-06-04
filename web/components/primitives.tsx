'use client';
import clsx from 'clsx';
import { useCountUp } from '@/hooks/useCountUp';
import { LEVEL_HEX, LEVEL_LABEL } from '@/lib/theme';
import type { BusyLevel } from '@/lib/types';

// ---- BusyLevelPill: small colored status chip -----------------------------
export function BusyLevelPill({ level, size = 'sm' }: { level: BusyLevel; size?: 'sm' | 'md' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide text-white',
        size === 'sm' ? 'px-2 py-0.5 text-[0.62rem]' : 'px-2.5 py-1 text-[0.7rem]'
      )}
      style={{ background: LEVEL_HEX[level] }}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}

// ---- BusyScoreRing: animated SVG gauge ------------------------------------
export function BusyScoreRing({
  score,
  level,
  size = 56,
  stroke = 6,
}: {
  score: number;
  level: BusyLevel;
  size?: number;
  stroke?: number;
}) {
  const animated = useCountUp(score, 700);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, animated)) / 100);
  const fontSize = size >= 50 ? size * 0.34 : size * 0.36;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-ring-track))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={LEVEL_HEX[level]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="nums font-extrabold text-ink" style={{ fontSize }}>
          {animated}
        </span>
      </div>
    </div>
  );
}

// ---- ConfidenceMeter: slim teal progress bar ------------------------------
export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.7rem] font-medium text-muted">Confidence</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-surfaceAlt">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="nums text-[0.7rem] font-semibold text-ink">{pct}%</span>
    </div>
  );
}

// ---- KeyFactorChips -------------------------------------------------------
export function KeyFactorChips({ factors, max = 4 }: { factors: string[]; max?: number }) {
  if (!factors?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {factors.slice(0, max).map((f, i) => (
        <span
          key={`${f}-${i}`}
          className="rounded-full bg-surfaceAlt px-2.5 py-1 text-[0.7rem] font-medium text-muted"
        >
          {f}
        </span>
      ))}
    </div>
  );
}
