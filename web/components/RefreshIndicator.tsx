'use client';
import { useState } from 'react';
import clsx from 'clsx';
import { RefreshCw } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { useCountdown } from '@/hooks/useCountdown';
import { REFRESH_MS } from '@/hooks/useDashboard';

export default function RefreshIndicator({
  lastUpdated,
  onRefresh,
  syncTick = 0,
}: {
  lastUpdated: number | null;
  onRefresh: () => void;
  syncTick?: number;
}) {
  const { fraction, secondsLeft } = useCountdown(lastUpdated, REFRESH_MS);
  const [spinning, setSpinning] = useState(false);

  const size = 34;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * fraction; // drains as time elapses
  const finalStretch = secondsLeft <= 30;

  const handle = () => {
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 700);
  };

  const updatedLabel = lastUpdated
    ? `updated ${formatDistanceToNowStrict(lastUpdated, { addSuffix: true })}`
    : 'connecting…';

  return (
    <div className="flex items-center gap-2.5">
      {/* re-keyed on each successful sync so the label pulses when data refreshes */}
      <span
        key={syncTick}
        className={clsx(
          'hidden origin-right text-[0.72rem] text-muted md:inline',
          syncTick > 0 && 'animate-updatePulse'
        )}
      >
        {updatedLabel}
      </span>
      <button
        onClick={handle}
        title="Refresh now"
        className="relative grid place-items-center rounded-full transition hover:bg-surfaceAlt"
        style={{ width: size + 6, height: size + 6 }}
      >
        <svg width={size} height={size} className="-rotate-90 absolute">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-hairline))" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={finalStretch ? 'rgb(var(--c-accent))' : 'rgb(var(--c-muted))'}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 400ms ease' }}
          />
        </svg>
        <RefreshCw
          size={14}
          className={clsx('relative text-muted', spinning && 'animate-spinOnce')}
        />
      </button>
    </div>
  );
}
