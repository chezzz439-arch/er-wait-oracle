'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Tooltip, Popup, ZoomControl, useMap } from 'react-leaflet';
import clsx from 'clsx';
import { CheckCircle2, Navigation, ArrowRight } from 'lucide-react';
import { BusyScoreRing, BusyLevelPill, ConfidenceMeter } from './primitives';
import { useTheme } from './ThemeProvider';
import { SF_CENTER, SF_DEFAULT_ZOOM } from '@/lib/hospitals';
import { LEVEL_HEX, LEVEL_LABEL } from '@/lib/theme';
import { mapsDirectionsUrl, type LatLng } from '@/lib/geo';
import type { BusyLevel, HospitalView } from '@/lib/types';

export interface FocusRequest {
  id: string | null;
  nonce: number;
}

const USER_ICON = L.divIcon({
  html: '<div class="user-dot"><span class="user-dot__ring"></span><span class="user-dot__core"></span></div>',
  className: 'oracle-user-marker',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const ORDER: BusyLevel[] = ['low', 'moderate', 'high', 'severe'];

function markerSize(score: number) {
  return Math.round(30 + (Math.max(0, Math.min(100, score)) / 100) * 10); // 30..40
}

function buildIcon(
  h: HospitalView,
  opts: { recommended: boolean; active: boolean; dimmed: boolean }
): L.DivIcon {
  const size = markerSize(h.prediction.busyScore) + (opts.active ? 3 : 0);
  const hue = LEVEL_HEX[h.prediction.busyLevel];
  const hollow = !h.hasEd || h.baseline.op18b == null; // limited-data treatment
  const fontSize = Math.round(size * 0.4);

  const halo = opts.recommended ? '<span class="marker-halo"></span>' : '';
  const check = opts.recommended
    ? '<span class="marker-check">&#10003;</span>'
    : '';
  const pill = hollow
    ? `<div class="marker-pill marker-pill--hollow" style="width:100%;height:100%;font-size:${fontSize}px;">${h.prediction.busyScore}<span class="marker-pill--hollow-dot"></span></div>`
    : `<div class="marker-pill" style="width:100%;height:100%;font-size:${fontSize}px;">${h.prediction.busyScore}</div>`;

  const html = `<div class="marker-wrap ${opts.recommended ? 'marker--recommended' : ''} ${
    opts.active ? 'marker--active' : ''
  } ${opts.dimmed ? 'marker--dimmed' : ''}" style="--pill-bg:${hue};width:${size}px;height:${size}px;">${halo}${pill}${check}</div>`;

  return L.divIcon({
    html,
    className: 'oracle-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    tooltipAnchor: [0, -size / 2],
  });
}

// Flies to the focused hospital and opens its popup when a focus request arrives.
function FocusController({
  focusReq,
  byId,
  markerRefs,
}: {
  focusReq: FocusRequest;
  byId: Map<string, HospitalView>;
  markerRefs: React.MutableRefObject<Record<string, L.Marker | null>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!focusReq.id) return;
    const h = byId.get(focusReq.id);
    if (!h) return;
    map.flyTo([h.lat, h.lng], Math.max(map.getZoom(), 14), { duration: 0.7 });
    const m = markerRefs.current[focusReq.id];
    if (m) setTimeout(() => m.openPopup(), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReq.nonce]);
  return null;
}

// Keeps the Leaflet canvas sized correctly through layout/breakpoint changes.
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    const t = setTimeout(fix, 200);
    window.addEventListener('resize', fix);
    const ro = new ResizeObserver(fix);
    const el = map.getContainer();
    ro.observe(el);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', fix);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

function MarkerPopup({
  h,
  recommended,
  userLoc,
  onOpenDetail,
}: {
  h: HospitalView;
  recommended: boolean;
  userLoc: LatLng | null;
  onOpenDetail: (id: string) => void;
}) {
  const noBaseline = h.baseline.op18b == null;
  const navUrl = mapsDirectionsUrl({ lat: h.lat, lng: h.lng, label: h.name }, userLoc);
  return (
    <div className="w-[230px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[0.95rem] font-semibold text-ink">{h.shortName}</div>
          <div className="truncate text-[0.7rem] text-muted">{h.address}</div>
        </div>
        <BusyScoreRing score={h.prediction.busyScore} level={h.prediction.busyLevel} size={42} stroke={5} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <BusyLevelPill level={h.prediction.busyLevel} />
        {recommended && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-white">
            Best pick
          </span>
        )}
      </div>
      <div className="mt-2">
        <ConfidenceMeter value={h.prediction.confidence} />
      </div>
      <p className="mt-2 text-[0.75rem] leading-snug text-ink/85 line-clamp-3">{h.prediction.reasoning}</p>
      <div className="mt-2 border-t border-hairline pt-2 text-[0.7rem] text-muted">
        {!h.hasEd ? (
          'Rehabilitation / skilled-nursing site — not an emergency room.'
        ) : noBaseline ? (
          'No CMS ED baseline reported — forecast from weather + time only.'
        ) : (
          <>
            Median ED stay <span className="nums font-semibold text-ink">~{h.baseline.op18b} min</span>
            {h.baseline.op22 != null && (
              <>
                {' · '}
                <span className="nums font-semibold text-ink">{h.baseline.op22}%</span> leave before seen
              </>
            )}
          </>
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        {h.hasEd && (
          <a
            href={navUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[0.7rem] font-semibold text-white transition hover:brightness-95"
          >
            <Navigation size={12} /> Navigate
          </a>
        )}
        <button
          onClick={() => onOpenDetail(h.facilityId)}
          className="flex items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-[0.7rem] font-semibold text-ink transition hover:bg-surfaceAlt"
        >
          Details <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}

export default function MapInner({
  hospitals,
  recommendedId,
  activeFacilityId,
  focusReq,
  userLoc,
  onHover,
  onSelect,
  onOpenDetail,
}: {
  hospitals: HospitalView[];
  recommendedId: string | null;
  activeFacilityId: string | null;
  focusReq: FocusRequest;
  userLoc: LatLng | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
}) {
  const [spotlight, setSpotlight] = useState<BusyLevel | null>(null);
  const markerRefs = useRef<Record<string, L.Marker | null>>({});
  const byId = useMemo(() => new Map(hospitals.map((h) => [h.facilityId, h])), [hospitals]);
  const { theme } = useTheme();
  const dark = theme === 'dark';

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={SF_CENTER}
        zoom={SF_DEFAULT_ZOOM}
        zoomControl={false}
        scrollWheelZoom={false}
        attributionControl
        className="h-full w-full"
        style={{ background: 'rgb(var(--c-map-bg))' }}
      >
        <TileLayer
          key={dark ? 'dark' : 'light'}
          url={`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`}
          subdomains="abcd"
          attribution='&copy; OpenStreetMap &copy; CARTO'
          detectRetina
          maxZoom={19}
        />
        <ZoomControl position="bottomright" />
        <InvalidateOnResize />
        <FocusController focusReq={focusReq} byId={byId} markerRefs={markerRefs} />

        {userLoc && (
          <Marker position={[userLoc.lat, userLoc.lng]} icon={USER_ICON} zIndexOffset={2000} interactive={false}>
            <Tooltip className="oracle-tip" direction="top" offset={[0, -8]} opacity={1}>
              <span className="text-[0.78rem] font-semibold text-ink">You are here</span>
            </Tooltip>
          </Marker>
        )}

        {hospitals.map((h) => {
          const recommended = h.facilityId === recommendedId;
          const active = h.facilityId === activeFacilityId;
          const dimmed = spotlight != null && h.prediction.busyLevel !== spotlight;
          return (
            <Marker
              key={h.facilityId}
              position={[h.lat, h.lng]}
              icon={buildIcon(h, { recommended, active, dimmed })}
              ref={(m) => {
                markerRefs.current[h.facilityId] = m;
              }}
              eventHandlers={{
                mouseover: () => onHover(h.facilityId),
                mouseout: () => onHover(null),
                click: () => onSelect(h.facilityId),
              }}
              zIndexOffset={recommended ? 1000 : active ? 500 : 0}
            >
              <Tooltip className="oracle-tip" direction="top" sticky opacity={1} offset={[0, -4]}>
                <div className="flex items-center gap-2">
                  <span className="text-[0.82rem] font-semibold text-ink">{h.shortName}</span>
                  <BusyLevelPill level={h.prediction.busyLevel} />
                  <span className="nums text-[0.82rem] font-bold text-ink">{h.prediction.busyScore}</span>
                </div>
                <div className="text-[0.65rem] text-muted">forecast · next 4 hours</div>
              </Tooltip>
              <Popup className="oracle-popup" closeButton={false}>
                <MarkerPopup h={h} recommended={recommended} userLoc={userLoc} onOpenDetail={onOpenDetail} />
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Horizon pill — top-right inside map */}
      <div className="pointer-events-none absolute right-3 top-3 z-[500] rounded-full bg-surface/90 px-3 py-1 text-[0.7rem] font-semibold text-ink shadow-float backdrop-blur">
        Forecast · next 4 hours
      </div>

      {/* Legend — bottom-left inside map, click a band to spotlight */}
      <div className="absolute bottom-3 left-3 z-[500] rounded-xl border border-hairline bg-surface/90 p-2.5 shadow-float backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {ORDER.map((lvl) => (
            <button
              key={lvl}
              onClick={() => setSpotlight((s) => (s === lvl ? null : lvl))}
              className={clsx(
                'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.65rem] transition',
                spotlight === lvl ? 'bg-surfaceAlt font-semibold text-ink' : 'text-muted hover:bg-surfaceAlt'
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_HEX[lvl] }} />
              {LEVEL_LABEL[lvl]}
            </button>
          ))}
        </div>
        <div className="mt-1 flex items-center gap-2.5 border-t border-hairline pt-1.5 text-[0.65rem] text-muted">
          <span className="flex items-center gap-1">
            <CheckCircle2 size={11} className="text-accent" /> Recommended
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full border border-dashed border-[#c3ccda] bg-white" /> Limited data
          </span>
        </div>
        <div className="mt-1 text-[0.6rem] text-muted/80">size = predicted load</div>
      </div>
    </div>
  );
}
