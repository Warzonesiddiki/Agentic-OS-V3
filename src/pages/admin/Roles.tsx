import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';

/** Roles & RBAC — custom role creation + permission assignment. */
export default function AdminRoles() {
  const orgId = useAuthStore((s) => s.user?.orgId ?? '');
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [perms, setPerms] = useState('');

  const { data } = useQuery<RbacRole[]>({
    queryKey: ['roles', orgId],
    queryFn: () => apiClient.listRoles(orgId),
    enabled: !!orgId,
  });
  const createM = useMutation({
    mutationFn: () =>
      apiClient.createRole(orgId, {
        name,
        permissions: perms
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles', orgId] });
      setName('');
      setPerms('');
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Roles & RBAC</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          createM.mutate();
        }}
      >
        <input
          className="rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          placeholder="Role name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          placeholder="perms: read:mem, write:skill"
          value={perms}
          onChange={(e) => setPerms(e.target.value)}
        />
        <button className="rounded bg-indigo-600 px-3 py-2 text-sm" disabled={createM.isPending}>
          Create role
        </button>
      </form>
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-400">
          <tr>
            <th className="py-2">Name</th>
            <th>Custom</th>
            <th>Permissions</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((r) => (
            <tr key={r.id} className="border-t border-zinc-800">
              <td className="py-2">{r.name}</td>
              <td>{r.isCustom ? 'yes' : 'no'}</td>
              <td>{r.permissions.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
