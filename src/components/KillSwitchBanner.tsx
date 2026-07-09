import { useEffect, useState } from 'react';
import { onKillSwitch } from '../lib/remote';
import { Badge } from './ui';

/**
 * App-wide kill-switch banner. Subscribes to the global 423 channel in
 * `remote.ts` so ANY API call that hits the server's kill switch surfaces a
 * single, dismissible banner at the top of the app — no per-page handling
 * required. Auto-clears 8s after the last 423 to avoid stale warnings.
 */
export function KillSwitchBanner() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [lastPath, setLastPath] = useState('');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onKillSwitch((info) => {
      setMessage(info.message);
      setLastPath(info.path);
      setVisible(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 8000);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-0 z-50 flex items-center gap-3 border-b border-rose-500/40 bg-rose-950/80 px-4 py-2 text-sm text-rose-100 backdrop-blur"
    >
      <Badge tone="rose">kill switch</Badge>
      <span className="flex-1">{message}</span>
      {lastPath && (
        <span className="hidden font-mono text-[11px] text-rose-300/70 sm:inline">{lastPath}</span>
      )}
      <button
        onClick={() => setVisible(false)}
        className="rounded border border-rose-400/40 px-2 py-0.5 text-[11px] text-rose-200 hover:bg-rose-900/60"
        aria-label="Dismiss"
      >
        dismiss
      </button>
    </div>
  );
}
