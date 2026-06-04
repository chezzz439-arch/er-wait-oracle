'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { WifiOff } from 'lucide-react';
import Header from './Header';
import MapPanel from './MapPanel';
import RecommendationCard from './RecommendationCard';
import CityVitals from './CityVitals';
import HospitalList from './HospitalList';
import TrendChart from './TrendChart';
import IncidentFeed from './IncidentFeed';
import HospitalDetail from './HospitalDetail';
import { useDashboard } from '@/hooks/useDashboard';
import { useGeolocation } from '@/hooks/useGeolocation';
import type { FocusRequest } from './MapInner';

export default function AppShell() {
  const { data, loading, error, lastUpdated, syncTick, refresh } = useDashboard();
  const geo = useGeolocation();

  const [activeFacilityId, setActiveFacilityId] = useState<string | null>(null); // hover/highlight
  const [focusedId, setFocusedId] = useState<string | null>(null); // last clicked (persists, shared)
  const [detailId, setDetailId] = useState<string | null>(null); // open detail drawer
  const [focusReq, setFocusReq] = useState<FocusRequest>({ id: null, nonce: 0 });

  const hospitals = data?.hospitals ?? [];
  const recommendation = data?.recommendation ?? null;
  const recommendedId = recommendation?.facilityId ?? null;

  const focusOn = useCallback((id: string) => {
    setActiveFacilityId(id);
    setFocusedId(id);
    setFocusReq((p) => ({ id, nonce: p.nonce + 1 }));
  }, []);

  const openDetail = useCallback(
    (id: string) => {
      setDetailId(id);
      focusOn(id);
    },
    [focusOn]
  );

  // Restore shared state (?h=<facilityId>) once, after the first data arrives.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (restored || !hospitals.length) return;
    setRestored(true);
    const id = new URLSearchParams(window.location.search).get('h');
    if (id && hospitals.some((h) => h.facilityId === id)) focusOn(id);
  }, [restored, hospitals, focusOn]);

  // Keep the URL in sync with the focused hospital so the Share link reflects it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (focusedId) url.searchParams.set('h', focusedId);
    else url.searchParams.delete('h');
    window.history.replaceState(null, '', url.toString());
  }, [focusedId]);

  const pick = useMemo(
    () => hospitals.find((h) => h.facilityId === recommendedId) ?? null,
    [hospitals, recommendedId]
  );
  const detailHospital = useMemo(
    () => hospitals.find((h) => h.facilityId === detailId) ?? null,
    [hospitals, detailId]
  );
  const cityAvg = useMemo(() => {
    const ed = hospitals.filter((h) => h.hasEd);
    if (!ed.length) return null;
    return ed.reduce((s, h) => s + h.prediction.busyScore, 0) / ed.length;
  }, [hospitals]);

  // First paint before any data: lightweight skeleton.
  if (loading && !data) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-bg">
        <div className="flex flex-col items-center gap-3 text-muted">
          <div className="h-3 w-3 animate-pulseDot rounded-full bg-accent" />
          <span className="text-sm">Consulting the Oracle…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg text-ink">
      <Header
        weather={data?.weather ?? null}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
        syncTick={syncTick}
        live={!error}
        selectedId={focusedId}
      />

      {error && data && (
        <div className="flex items-center gap-2 bg-busyModerate/10 px-5 py-1.5 text-[0.75rem] text-busyModerate">
          <WifiOff size={13} /> Connection hiccup — showing last good data.
        </div>
      )}

      <main className="mx-auto grid w-full max-w-[1500px] gap-4 p-3 sm:p-4 lg:grid-cols-12 lg:items-start lg:gap-5 lg:p-5">
        {/* Left: the map — sticky & tall on desktop, fixed-height card on mobile. */}
        <div className="lg:sticky lg:top-[84px] lg:col-span-7">
          <div className="h-[44vh] min-h-[300px] sm:h-[400px] lg:h-[calc(100dvh-108px)]">
            <MapPanel
              hospitals={hospitals}
              recommendedId={recommendedId}
              activeFacilityId={activeFacilityId}
              focusReq={focusReq}
              userLoc={geo.coords}
              onHover={setActiveFacilityId}
              onSelect={focusOn}
              onOpenDetail={openDetail}
            />
          </div>
        </div>

        {/* Right: the scrolling brief. */}
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
          <RecommendationCard
            recommendation={recommendation}
            pick={pick}
            cityAvg={cityAvg}
            notice={data?.notice ?? null}
            userLoc={geo.coords}
            onViewOnMap={() => recommendedId && focusOn(recommendedId)}
            onViewDetails={() => recommendedId && openDetail(recommendedId)}
          />
          <TrendChart
            hospitals={hospitals}
            focusedId={focusedId ?? recommendedId}
            hasHistory={data?.hasHistory ?? false}
            onSelect={focusOn}
            onHover={setActiveFacilityId}
          />
          <IncidentFeed
            incidents={data?.incidents ?? []}
            hospitals={hospitals}
            onSelect={focusOn}
            onHover={setActiveFacilityId}
          />
          <CityVitals hospitals={hospitals} />
          <HospitalList
            hospitals={hospitals}
            activeFacilityId={activeFacilityId}
            recommendedId={recommendedId}
            userLoc={geo.coords}
            geoStatus={geo.status}
            onLocate={geo.request}
            onHover={setActiveFacilityId}
            onSelect={openDetail}
          />
        </div>
      </main>

      {detailHospital && (
        <HospitalDetail
          hospital={detailHospital}
          recommended={detailHospital.facilityId === recommendedId}
          userLoc={geo.coords}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}
