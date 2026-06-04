'use client';
import { LEVEL_HEX, LEVEL_LABEL } from '@/lib/theme';
import type { BusyLevel, HospitalView } from '@/lib/types';

const ORDER: BusyLevel[] = ['low', 'moderate', 'high', 'severe'];

export default function CityVitals({ hospitals }: { hospitals: HospitalView[] }) {
  if (!hospitals.length) return null;
  const counts: Record<BusyLevel, number> = { low: 0, moderate: 0, high: 0, severe: 0 };
  for (const h of hospitals) counts[h.prediction.busyLevel] += 1;
  const total = hospitals.length;
  const avgConf =
    Math.round((hospitals.reduce((s, h) => s + h.prediction.confidence, 0) / total) * 100) || 0;

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-card">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">
          SF ER load · {total} departments
        </span>
        <span className="nums text-[0.72rem] text-muted">avg confidence {avgConf}%</span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surfaceAlt">
        {ORDER.map((lvl) =>
          counts[lvl] > 0 ? (
            <div
              key={lvl}
              style={{ width: `${(counts[lvl] / total) * 100}%`, background: LEVEL_HEX[lvl] }}
              title={`${counts[lvl]} ${LEVEL_LABEL[lvl]}`}
            />
          ) : null
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {ORDER.map((lvl) => (
          <div key={lvl} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_HEX[lvl] }} />
            <span className="text-[0.7rem] text-muted">
              {LEVEL_LABEL[lvl]} <span className="nums font-semibold text-ink">{counts[lvl]}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
