'use client';
import { useEffect, useState } from 'react';
import WeatherStrip from './WeatherStrip';
import RefreshIndicator from './RefreshIndicator';
import ShareButton from './ShareButton';
import DarkModeToggle from './DarkModeToggle';
import type { WeatherView } from '@/lib/types';

export default function Header({
  weather,
  locationLabel,
  lastUpdated,
  onRefresh,
  syncTick,
  live,
  selectedId,
}: {
  weather: WeatherView | null;
  locationLabel: string | null;
  lastUpdated: number | null;
  onRefresh: () => void;
  syncTick: number;
  live: boolean;
  selectedId: string | null;
}) {
  // Fire a one-shot sync sweep whenever syncTick changes (successful refresh).
  const [sweepKey, setSweepKey] = useState(0);
  useEffect(() => {
    if (syncTick > 0) setSweepKey((k) => k + 1);
  }, [syncTick]);

  return (
    <header className="sticky top-0 z-[1000] flex h-16 items-center justify-between gap-2 overflow-hidden border-b border-hairline bg-surface/85 px-4 backdrop-blur-md sm:px-6">
      {sweepKey > 0 && <span key={sweepKey} className="sync-sweep" />}

      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative grid h-3 w-3 shrink-0 place-items-center">
          <span
            className="absolute h-3 w-3 rounded-full bg-accent/30"
            style={{ animation: live ? 'pulseDot 2.2s ease-in-out infinite' : undefined }}
          />
          <span className={live ? 'h-2 w-2 rounded-full bg-accent' : 'h-2 w-2 rounded-full bg-muted'} />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[1.05rem] font-bold tracking-[-0.011em] text-ink">ER Wait Oracle</div>
          <div className="hidden truncate text-[0.68rem] font-medium text-muted min-[400px]:block">
            {locationLabel ?? 'United States'} · next 4 hours
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Weather hides its detail stats below sm (handled inside WeatherStrip). */}
        <div className="hidden min-[480px]:block">
          <WeatherStrip weather={weather} />
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <ShareButton selectedId={selectedId} />
          <DarkModeToggle />
          <RefreshIndicator lastUpdated={lastUpdated} onRefresh={onRefresh} syncTick={syncTick} />
        </div>
      </div>
    </header>
  );
}
