import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';

const STEPS = ['org', 'sso', 'roles', 'billing', 'siem', 'invite'];

/** Onboarding Wizard — step-by-step org setup, persisted via backend. */
export default function AdminOnboarding() {
  const orgId = useAuthStore((s) => s.user?.orgId ?? '');
  const [step, setStep] = useState(0);
  const complete = useMutation({
    mutationFn: (s: string) => apiClient.completeOnboarding(orgId, s),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Onboarding Wizard</h1>
      <div className="flex gap-2 text-sm">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={
              i === step
                ? 'font-semibold text-indigo-400'
                : i < step
                  ? 'text-emerald-400'
                  : 'text-zinc-500'
            }
          >
            {i + 1}. {s}
          </span>
        ))}
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <p className="mb-4 text-sm text-zinc-300">
          Step: <strong>{STEPS[step]}</strong>
        </p>
        <button
          className="rounded bg-indigo-600 px-3 py-2 text-sm"
          disabled={complete.isPending}
          onClick={() => {
            complete.mutate(STEPS[step]);
            setStep((s) => Math.min(s + 1, STEPS.length - 1));
          }}
        >
          {step === STEPS.length - 1 ? 'Finish' : 'Complete & next'}
        </button>
      </div>
    </div>
  );
}
