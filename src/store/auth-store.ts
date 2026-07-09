import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Zustand session/tenant store.
 * Holds the authenticated identity, the active org/workspace (multi-tenant
 * context) and the resolved RBAC permission set. This is the ONLY client-side
 * state that may use persist (a short-lived session token + tenant id).
 * All other application data lives in TanStack Query (in-memory, backend-authoritative).
 */
export type Role = 'owner' | 'admin' | 'member' | 'viewer' | 'billing';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  orgId: string;
  workspaceId: string;
  roles: Role[];
}

export interface AuthState {
  user: SessionUser | null;
  token: string | null;
  permissions: string[];
  setSession: (user: SessionUser, token: string, permissions: string[]) => void;
  setTenant: (orgId: string, workspaceId: string) => void;
  setPermissions: (permissions: string[]) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      permissions: [],
      setSession: (user, token, permissions) => set({ user, token, permissions }),
      setTenant: (orgId, workspaceId) =>
        set((s) => (s.user ? { user: { ...s.user, orgId, workspaceId } } : s)),
      setPermissions: (permissions) => set({ permissions }),
      clear: () => set({ user: null, token: null, permissions: [] }),
    }),
    { name: 'nexus.session' } // session-only, never business data
  )
);

/** Atomic UI preference store (Jotai-style primitive reimplemented with Zustand slice). */
export interface UiPrefs {
  theme: 'dark' | 'light' | 'system';
  sidebarCollapsed: boolean;
}
export const useUiStore = create<UiPrefs>(() => ({
  theme: 'dark',
  sidebarCollapsed: false,
}));
