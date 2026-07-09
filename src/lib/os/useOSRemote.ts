import { useCallback, useEffect, useState } from 'react';
import { remote } from '../remote';
import { useOS } from '../../osStore';

export type OSDataSource = 'remote' | 'local';

/**
 * Bridges the OS control-plane UI to the real backend when remote mode is
 * enabled (Phase 5 — Frontend wiring to backend). When remote is OFF the
 * localStorage simulation remains the source of truth; when ON, mutations
 * and the live kernel/scheduler snapshot are routed through `remote`.
 */
export function useOSRemote() {
  const s = useOS();
  const [dataSource, setDataSource] = useState<OSDataSource>(
    remote.remoteEnabled() ? 'remote' : 'local'
  );
  const [policyBusy, setPolicyBusy] = useState(false);

  useEffect(() => {
    const sync = () => setDataSource(remote.remoteEnabled() ? 'remote' : 'local');
    sync();
    const t = setInterval(sync, 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const mod = await import('./store');
      // Re-commit current state so subscribers (and the Kernel dashboard)
      // re-render with the latest merged remote data. The background interval
      // in startOSRemoteSync() keeps pulling live kernel/scheduler state.
      mod.commitOS({ ...mod.getOSState() });
    } catch {
      /* keep local */
    }
  }, []);

  const setSchedulerPolicy = useCallback(
    async (policy: string) => {
      if (!remote.remoteEnabled()) return;
      setPolicyBusy(true);
      try {
        await remote.setSchedulerPolicy(policy);
        await refresh();
      } finally {
        setPolicyBusy(false);
      }
    },
    [refresh]
  );

  const resolveApproval = useCallback(async (id: string, approve: boolean) => {
    if (remote.remoteEnabled()) {
      try {
        await remote.resolveApproval(id, approve, 'operator');
      } catch {
        /* fall back to local */
      }
    }
    // Local optimistic update (also used when remote is OFF).
    const { updateOS } = await import('./store');
    updateOS((st) => ({
      ...st,
      approvals: st.approvals.map((a) =>
        a.id === id ? { ...a, status: approve ? 'approved' : ('denied' as const) } : a
      ),
    }));
  }, []);

  return {
    dataSource,
    remoteEnabled: remote.remoteEnabled(),
    policyBusy,
    refresh,
    setSchedulerPolicy,
    resolveApproval,
    scheduler: s.scheduler,
  };
}
