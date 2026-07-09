import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth-store';
import { apiClient } from '../../lib/api-client';
import { useQuery } from '@tanstack/react-query';

const NAV = [
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/roles', label: 'Roles & RBAC' },
  { to: '/admin/keys', label: 'API Keys' },
  { to: '/admin/usage', label: 'Usage & Analytics' },
  { to: '/admin/billing', label: 'Billing' },
  { to: '/admin/sso', label: 'SSO / OIDC / SAML' },
  { to: '/admin/siem', label: 'SIEM Streaming' },
  { to: '/admin/audit', label: 'Audit Trail' },
  { to: '/admin/tenant', label: 'Tenant & Retention' },
  { to: '/admin/compliance', label: 'Compliance' },
  { to: '/admin/onboarding', label: 'Onboarding' },
];

/**
 * AdminLayout — the Enterprise control-plane shell.
 * Org/workspace switcher drives the multi-tenant context held in useAuthStore.
 * All child pages read their data from the backend via TanStack Query.
 */
export default function AdminLayout() {
  const navigate = useNavigate();
  const { user, setTenant, permissions } = useAuthStore();
  const orgId = user?.orgId ?? '';

  const { data: orgs } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => apiClient.listOrgs(),
    enabled: !!orgId,
  });

  if (!orgId) {
    return (
      <div className="p-8 text-zinc-400">
        No active organization. Sign in via SSO or create an org.
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="w-60 border-r border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-4 text-sm font-semibold tracking-wide text-zinc-300">
          Enterprise Console
        </div>
        <label className="mb-1 block text-xs text-zinc-500">Organization</label>
        <select
          className="mb-4 w-full rounded border border-zinc-700 bg-zinc-800 p-1 text-sm"
          value={orgId}
          onChange={(e) => {
            const next = orgs?.find((o) => o.id === e.target.value);
            if (next) setTenant(next.id, next.id);
          }}
        >
          {(orgs ?? [{ id: orgId, name: orgId }]).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm ${isActive ? 'bg-zinc-800 font-medium text-white' : 'text-zinc-400 hover:bg-zinc-800/60'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
