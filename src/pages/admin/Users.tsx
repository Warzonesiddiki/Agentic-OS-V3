import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';
import type { User } from '../../lib/enterprise-types';

/**
 * Users — full CRUD against the enterprise org.
 * Data is backend-authoritative; no localStorage.
 */
export default function AdminUsers() {
  const orgId = useAuthStore((s) => s.user?.orgId ?? '');
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roles, setRoles] = useState('member');

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['users', orgId],
    queryFn: () => apiClient.listUsers(orgId),
    enabled: !!orgId,
  });

  const createM = useMutation({
    mutationFn: () => apiClient.createUser(orgId, { email, name, roles: [roles] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', orgId] });
      setEmail('');
      setName('');
    },
  });

  const delM = useMutation({
    mutationFn: (id: string) => apiClient.deleteUser(orgId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users', orgId] }),
  });

  const suspendM = useMutation({
    mutationFn: (u: User) =>
      apiClient.updateUser(orgId, u.id, {
        status: u.status === 'suspended' ? 'active' : 'suspended',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users', orgId] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Users</h1>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          createM.mutate();
        }}
      >
        <input
          className="rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          value={roles}
          onChange={(e) => setRoles(e.target.value)}
        >
          <option value="owner">owner</option>
          <option value="admin">admin</option>
          <option value="member">member</option>
          <option value="billing">billing</option>
          <option value="viewer">viewer</option>
        </select>
        <button
          className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium"
          disabled={createM.isPending}
        >
          Invite
        </button>
      </form>

      {isLoading ? (
        <div className="text-zinc-500">Loading…</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-400">
            <tr>
              <th className="py-2">Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Status</th>
              <th>MFA</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-t border-zinc-800">
                <td className="py-2">{u.name}</td>
                <td>{u.email}</td>
                <td>{u.roles.join(', ')}</td>
                <td>{u.status}</td>
                <td>{u.mfaEnabled ? '✓' : '—'}</td>
                <td className="space-x-2 text-right">
                  <button className="text-indigo-400" onClick={() => suspendM.mutate(u)}>
                    {u.status === 'suspended' ? 'Activate' : 'Suspend'}
                  </button>
                  <button className="text-red-400" onClick={() => delM.mutate(u.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
