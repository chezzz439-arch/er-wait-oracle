'use client';
import { useEffect, useState } from 'react';
import { Share2, Check } from 'lucide-react';

// Copies a link to the current dashboard state (the selected hospital is encoded
// in the URL by AppShell). Uses the native share sheet on mobile when available,
// otherwise the clipboard, with a brief "Copied" confirmation.
export default function ShareButton({ selectedId }: { selectedId: string | null }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const buildUrl = () => {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set('h', selectedId);
    else url.searchParams.delete('h');
    return url.toString();
  };

  const onShare = async () => {
    const link = buildUrl();
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: 'ER Wait Oracle — San Francisco', url: link });
        return;
      }
    } catch {
      /* user cancelled native share — fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      /* clipboard blocked — last resort */
      window.prompt('Copy this link:', link);
    }
  };

  return (
    <button
      onClick={onShare}
      title="Share this view"
      aria-label="Share this view"
      className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[0.78rem] font-medium text-muted transition hover:bg-surfaceAlt hover:text-ink"
    >
      {copied ? <Check size={15} className="text-accent" /> : <Share2 size={15} />}
      <span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
    </button>
  );
}
