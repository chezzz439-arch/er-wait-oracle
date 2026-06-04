'use client';
import { Navigation, TriangleAlert, Locate } from 'lucide-react';

// Visible call-to-action for sharing location. This is the RELIABLE trigger:
// browsers (especially Safari/iOS) only show the geolocation prompt in response
// to a user gesture, so an auto-fired request on load silently does nothing.
// Shown until we have a real GPS fix; explains the SF fallback meanwhile.
export default function LocationBanner({
  status,
  located,
  onLocate,
}: {
  status: string;
  located: boolean;
  onLocate: () => void;
}) {
  if (located) return null;

  const prompting = status === 'prompting';
  const denied = status === 'denied';
  const unavailable = status === 'unavailable';

  const message = denied
    ? 'Location is blocked — showing San Francisco. Enable location for this site in your browser settings, then retry.'
    : unavailable
      ? "Couldn't get your location — showing San Francisco. Check that location services are on, then retry."
      : 'Find the nearest ERs to you anywhere in the US — showing San Francisco until you share your location.';

  return (
    <div className="border-b border-accent/20 bg-accent/[0.07]">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-start gap-2 text-[0.8rem] text-ink">
          {denied || unavailable ? (
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-busyModerate" />
          ) : (
            <Navigation size={16} className="mt-0.5 shrink-0 text-accent" />
          )}
          <span className="leading-snug">{message}</span>
        </div>
        <button
          onClick={onLocate}
          disabled={prompting}
          className="flex shrink-0 items-center justify-center gap-1.5 self-start rounded-full bg-accent px-4 py-2 text-[0.8rem] font-semibold text-white shadow-card transition hover:brightness-95 active:scale-[0.98] disabled:opacity-70 sm:self-auto"
        >
          <Locate size={14} className={prompting ? 'animate-spin' : ''} />
          {prompting ? 'Locating…' : denied || unavailable ? 'Retry' : 'Use my location'}
        </button>
      </div>
    </div>
  );
}
