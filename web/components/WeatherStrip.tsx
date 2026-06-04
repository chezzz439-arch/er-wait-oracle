'use client';
import { Cloud, Droplets, Wind } from 'lucide-react';
import type { WeatherView } from '@/lib/types';

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <span className="text-muted">{icon}</span>
      <span className="nums text-[0.875rem] font-semibold text-ink">{value}</span>
    </div>
  );
}

export default function WeatherStrip({ weather }: { weather: WeatherView | null }) {
  if (!weather) {
    return <div className="text-[0.8rem] text-muted">Weather unavailable</div>;
  }
  const t = weather.temperatureF != null ? `${Math.round(weather.temperatureF)}°` : '—';
  const feels = weather.apparentTempF != null ? `${Math.round(weather.apparentTempF)}°` : '—';
  const precip = weather.precipitationMm != null ? `${weather.precipitationMm.toFixed(1)}mm` : '0mm';
  const wind = weather.windSpeedKmh != null ? `${Math.round(weather.windSpeedKmh)}km/h` : '—';
  const humidity = weather.humidityPct != null ? `${Math.round(weather.humidityPct)}%` : '—';

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <div className="flex items-center gap-2 border-r border-hairline pr-3 sm:pr-4">
        <span className="nums text-2xl font-extrabold text-ink">{t}</span>
        <div className="leading-tight">
          <div className="text-[0.8rem] font-semibold text-ink">{weather.condition}</div>
          <div className="text-[0.68rem] text-muted">feels {feels}</div>
        </div>
      </div>
      <div className="hidden items-center gap-3 sm:flex sm:gap-4">
        <Stat icon={<Droplets size={15} />} label="Precipitation" value={precip} />
        <Stat icon={<Wind size={15} />} label="Wind" value={wind} />
        <Stat icon={<Cloud size={15} />} label="Humidity" value={humidity} />
      </div>
    </div>
  );
}
