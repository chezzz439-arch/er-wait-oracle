'use client';
import { Megaphone, CalendarClock, Moon, CloudRain, Snowflake, Car, Activity } from 'lucide-react';
import type { HospitalView, Incident } from '@/lib/types';

const KIND_ICON: Record<Incident['kind'], React.ReactNode> = {
  event: <CalendarClock size={15} />,
  nightlife: <Moon size={15} />,
  weather: <CloudRain size={15} />,
  traffic: <Car size={15} />,
  seasonal: <Activity size={15} />,
};

const SEV: Record<Incident['severity'], { dot: string; label: string }> = {
  elevated: { dot: 'rgb(var(--c-busy-high))', label: 'Elevated' },
  watch: { dot: 'rgb(var(--c-busy-mod))', label: 'Watch' },
  info: { dot: 'rgb(var(--c-muted))', label: 'Info' },
};

export default function IncidentFeed({
  incidents,
  hospitals,
  onSelect,
  onHover,
}: {
  incidents: Incident[];
  hospitals: HospitalView[];
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  if (!incidents?.length) return null;
  const nameById = new Map(hospitals.map((h) => [h.facilityId, h.shortName]));

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-card">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">
          <Megaphone size={13} /> Situational feed
        </span>
        <span className="rounded-full bg-surfaceAlt px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-muted">
          Simulated
        </span>
      </div>

      <ul className="space-y-2">
        {incidents.map((inc) => {
          const sev = SEV[inc.severity];
          return (
            <li
              key={inc.id}
              className="flex gap-2.5 rounded-xl bg-surfaceAlt p-3"
              style={{ borderLeft: `3px solid ${sev.dot}` }}
            >
              <span className="mt-0.5 shrink-0 text-muted">{KIND_ICON[inc.kind] ?? <Activity size={15} />}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[0.85rem] font-semibold leading-snug text-ink">{inc.title}</span>
                </div>
                <p className="mt-0.5 text-[0.76rem] leading-snug text-muted">{inc.detail}</p>
                {inc.nearFacilityIds.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[0.64rem] font-medium uppercase tracking-wide text-muted">Near</span>
                    {inc.nearFacilityIds
                      .filter((id) => nameById.has(id))
                      .map((id) => (
                        <button
                          key={id}
                          onClick={() => onSelect(id)}
                          onMouseEnter={() => onHover(id)}
                          onMouseLeave={() => onHover(null)}
                          className="rounded-full bg-surface px-2 py-0.5 text-[0.66rem] font-medium text-accent transition hover:bg-accent/10"
                        >
                          {nameById.get(id)}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
