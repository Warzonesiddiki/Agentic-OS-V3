import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';

/** SSO / OIDC / SAML — configure IdP, JIT, IdP-initiated, domain restriction. */
export default function AdminSso() {
  const orgId = useAuthStore((s) => s.user?.orgId ?? '');
  const qc = useQueryClient();
  const provider: 'oidc' | 'saml' = 'oidc';
  const { data, isLoading, isError, error } = useQuery<SsoConfig>({
    queryKey: ['sso', orgId, provider],
    queryFn: () => apiClient.getSso(orgId, provider),
    enabled: !!orgId,
  });
  const [form, setForm] = useState<
    Partial<{ ssoUrl: string; entityId: string; cert: string; domainRestriction: string }>
  >({});

  const save = useMutation({
    mutationFn: () =>
      apiClient.upsertSso(orgId, provider, {
        enabled: true,
        ssoUrl: form.ssoUrl,
        entityId: form.entityId ?? '',
        cert: form.cert ?? '',
        idpInitiated: true,
        jitProvisioning: true,
        domainRestriction: (form.domainRestriction ?? '')
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sso', orgId, provider] }),
  });
  const login = () =>
    apiClient.startSsoLogin(provider, orgId).then((r) => {
      window.location.href = r.redirectUrl;
    });

  if (isLoading) return <div className="text-zinc-500">Loading…</div>;
  if (isError)
    return (
      <div className="text-red-400">
        Failed to load SSO config: {error instanceof Error ? error.message : 'unknown error'}
      </div>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">SSO / OIDC / SAML</h1>
      <div className="flex gap-2">
        <button className="rounded bg-indigo-600 px-3 py-2 text-sm" onClick={login}>
          Test login (IdP redirect)
        </button>
        <span className="text-sm text-zinc-400">
          {data?.enabled ? 'Configured' : 'Not configured'}
        </span>
      </div>
      <div className="grid max-w-lg gap-2">
        <input
          className="rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          placeholder="Entity ID"
          defaultValue={data?.entityId}
          onChange={(e) => setForm((f) => ({ ...f, entityId: e.target.value }))}
        />
        <input
          className="rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          placeholder="SSO URL"
          onChange={(e) => setForm((f) => ({ ...f, ssoUrl: e.target.value }))}
        />
        <textarea
          className="rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          placeholder="IdP signing cert (PEM)"
          onChange={(e) => setForm((f) => ({ ...f, cert: e.target.value }))}
        />
        <input
          className="rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          placeholder="Domain restriction (csv)"
          onChange={(e) => setForm((f) => ({ ...f, domainRestriction: e.target.value }))}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" defaultChecked={data?.jitProvisioning} /> JIT provisioning
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" defaultChecked={data?.idpInitiated} /> IdP-initiated SSO
        </label>
        <button
          className="rounded bg-indigo-600 px-3 py-2 text-sm"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          Save config
        </button>
      </div>
    </div>
  );
}
