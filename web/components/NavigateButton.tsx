'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigation, X } from 'lucide-react';
import { mapsDirectionsUrl, appleMapsDirectionsUrl, type LatLng } from '@/lib/geo';

// A Navigate button that first asks which maps app to use, then opens directions.
// The chooser renders into a body-level portal so it's never clipped by a card or
// a Leaflet popup. `variant` controls the trigger's look across the app.
export default function NavigateButton({
  dest,
  origin,
  variant = 'primary',
  label = 'Navigate',
  fullWidth = false,
}: {
  dest: LatLng & { label?: string };
  origin: LatLng | null;
  variant?: 'primary' | 'compact';
  label?: string;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 220;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setPos({ top: r.bottom + 8, left });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const google = mapsDirectionsUrl(dest, origin);
  const apple = appleMapsDirectionsUrl(dest, origin);

  const openIn = (url: string) => {
    setOpen(false);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const triggerCls =
    (variant === 'primary'
      ? 'flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-[0.85rem] font-semibold text-white shadow-card transition hover:brightness-95 active:scale-[0.98]'
      : 'flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[0.7rem] font-semibold text-white transition hover:brightness-95') +
    (fullWidth ? ' w-full' : '');

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={triggerCls}
      >
        <Navigation size={variant === 'primary' ? 15 : 12} /> {label}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <button
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[3000] cursor-default bg-transparent"
            />
            <div
              className="fixed z-[3001] w-[220px] animate-fadeIn overflow-hidden rounded-xl border border-hairline bg-surface shadow-float"
              style={{ top: pos?.top ?? -999, left: pos?.left ?? -999 }}
            >
              <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
                <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-muted">
                  Open directions in
                </span>
                <button onClick={() => setOpen(false)} className="text-muted hover:text-ink">
                  <X size={13} />
                </button>
              </div>
              <button
                onClick={() => openIn(apple)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[0.85rem] font-medium text-ink transition hover:bg-surfaceAlt"
              >
                <AppleGlyph /> Apple Maps
              </button>
              <button
                onClick={() => openIn(google)}
                className="flex w-full items-center gap-2.5 border-t border-hairline px-3 py-2.5 text-left text-[0.85rem] font-medium text-ink transition hover:bg-surfaceAlt"
              >
                <GoogleGlyph /> Google Maps
              </button>
            </div>
          </>,
          document.body
        )}
    </>
  );
}

function AppleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-ink">
      <path d="M16.36 12.9c-.02-2.16 1.76-3.2 1.84-3.25-1-1.47-2.57-1.67-3.12-1.69-1.33-.13-2.6.78-3.27.78-.68 0-1.71-.76-2.82-.74-1.45.02-2.79.84-3.54 2.14-1.51 2.62-.39 6.5 1.08 8.62.72 1.04 1.58 2.2 2.7 2.16 1.08-.04 1.49-.7 2.8-.7 1.3 0 1.67.7 2.81.68 1.16-.02 1.9-1.06 2.61-2.1.82-1.2 1.16-2.37 1.18-2.43-.03-.01-2.26-.87-2.28-3.44zM14.2 6.25c.6-.73 1-1.74.89-2.75-.86.03-1.9.57-2.52 1.3-.55.64-1.04 1.67-.91 2.65.96.07 1.94-.49 2.54-1.2z" />
    </svg>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.9 3.4 14.7 2.4 12 2.4 6.9 2.4 2.8 6.5 2.8 11.6S6.9 20.8 12 20.8c5.3 0 8.8-3.7 8.8-8.9 0-.6-.06-1.1-.15-1.6H12z" fill="#4285F4" />
    </svg>
  );
}
