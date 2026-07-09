import { useEffect, useState, type ReactElement } from 'react';
import { invoke } from '@tauri-apps/api/core';

export type BackendStatus = 'loading' | 'ready' | 'error';

export interface BackendStatusState {
  status: BackendStatus;
  port: number | null;
  error: string | null;
}

export interface BackendStatusBannerProps {
  /** Called once the backend reports ready, with the resolved port. */
  onReady?: (port: number) => void;
  /** Polling interval in milliseconds. */
  pollMs?: number;
}

/**
 * Polls the Rust backend for readiness and renders a typed loading / error
 * state. Wraps the Tauri `is_backend_ready` / `get_backend_port` commands.
 */
export function BackendStatusBanner({
  onReady,
  pollMs = 500,
}: BackendStatusBannerProps): ReactElement {
  const [state, setState] = useState<BackendStatusState>({
    status: 'loading',
    port: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async (): Promise<void> => {
      try {
        const ready = await invoke<boolean>('is_backend_ready');
        if (cancelled) return;
        if (ready) {
          const port = await invoke<number>('get_backend_port');
          if (cancelled) return;
          setState({ status: 'ready', port, error: null });
          onReady?.(port);
          return;
        }
        timer = setTimeout(check, pollMs);
      } catch (err) {
        if (cancelled) return;
        setState({
          status: 'error',
          port: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    void check();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [onReady, pollMs]);

  if (state.status === 'loading') {
    return (
      <div
        className="nexus-status nexus-status--loading"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span className="nexus-spinner" aria-hidden="true" />
        Connecting to Nexus backend…
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div
        className="nexus-status nexus-status--error"
        role="alert"
        aria-live="assertive"
      >
        Backend error: {state.error}
      </div>
    );
  }

  return (
    <div
      className="nexus-status nexus-status--ready"
      role="status"
      aria-live="polite"
    >
      Nexus backend ready on port {state.port}
    </div>
  );
}
