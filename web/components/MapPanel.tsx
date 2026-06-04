'use client';
import dynamic from 'next/dynamic';
import type { FocusRequest } from './MapInner';
import type { LatLng } from '@/lib/geo';
import type { HospitalView } from '@/lib/types';

// Leaflet touches `window`, so the map is loaded client-side only.
const MapInner = dynamic(() => import('./MapInner'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-surfaceAlt text-[0.8rem] text-muted">
      Loading map…
    </div>
  ),
});

export default function MapPanel(props: {
  hospitals: HospitalView[];
  recommendedId: string | null;
  activeFacilityId: string | null;
  focusReq: FocusRequest;
  userLoc: LatLng | null;
  userAccuracy: number | null;
  center: LatLng | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
}) {
  return (
    <div className="h-full w-full overflow-hidden rounded-2xl shadow-card">
      <MapInner {...props} />
    </div>
  );
}
