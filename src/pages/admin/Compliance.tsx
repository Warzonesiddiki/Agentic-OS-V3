import { apiClient } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';
import { useMutation } from '@tanstack/react-query';

/** Compliance — generate org compliance report (PDF). */
export default function AdminCompliance() {
  const orgId = useAuthStore((s) => s.user?.orgId ?? '');
  const report = useMutation({
    mutationFn: async () => {
      const blob = await apiClient.getComplianceReport(orgId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'compliance-report.pdf';
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Compliance</h1>
      <p className="text-sm text-zinc-400">
        Generate an organization compliance report covering RBAC, audit retention, SIEM export, data
        residency, and SSO posture.
      </p>
      <button
        className="rounded bg-indigo-600 px-3 py-2 text-sm"
        onClick={() => report.mutate()}
        disabled={report.isPending}
      >
        {report.isPending ? 'Generating…' : 'Download compliance report (PDF)'}
      </button>
    </div>
  );
}
