import { memo } from 'react';
import { Card } from './ui';

export interface MemoryHealthPayload {
  total: number;
  fragmentationRatio: number;
  decay: { p50: number; p90: number; p99: number };
  dedupRate: number;
  contradictions: number;
  budgetUtilization: number;
  avgImportance: number;
  kindBreakdown: { kind: string; count: number }[];
  trend: number[];
  generatedAt: number;
}

const TONE_HEX: Record<string, string> = {
  cyan: '#22d3ee',
  emerald: '#34d399',
  amber: '#fbbf24',
  violet: '#a78bfa',
  rose: '#fb7185',
};

type Tone = keyof typeof TONE_HEX;

function Sparkline({ data, tone }: { data: number[]; tone: Tone }) {
  const w = 120;
  const h = 32;
  const color = TONE_HEX[tone];
  if (!data.length) {
    return <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" />;
  }
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

interface MetricCardProps {
  label: string;
  value: string;
  tone: Tone;
  sub?: string;
  metrics: MemoryHealthPayload;
}

const MetricCard = memo(function MetricCard({ label, value, tone, sub, metrics }: MetricCardProps) {
  const color = TONE_HEX[tone];
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <div className="font-mono text-2xl font-semibold" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
      <div className="mt-auto pt-1">
        <Sparkline data={metrics.trend} tone={tone} />
      </div>
    </Card>
  );
});

function Donut({ data }: { data: { kind: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const size = 120;
  const r = 50;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const palette = Object.values(TONE_HEX);
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={14} />
        ) : (
          data.map((d, i) => {
            const frac = d.count / total;
            const dash = frac * circ;
            const color = palette[i % palette.length] ?? TONE_HEX.cyan;
            const seg = (
              <circle
                key={d.kind}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={14}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            );
            offset += dash;
            return seg;
          })
        )}
      </svg>
      <ul className="space-y-1 text-xs">
        {data.length === 0 && <li className="text-slate-500">no memories</li>}
        {data.map((d, i) => (
          <li key={d.kind} className="flex items-center gap-2 text-slate-300">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: palette[i % palette.length] ?? TONE_HEX.cyan }}
            />
            <span className="capitalize">{d.kind}</span>
            <span className="ml-auto font-mono text-slate-500">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const MemoryHealth = memo(function MemoryHealth({
  metrics,
}: {
  metrics: MemoryHealthPayload;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total memories"
          value={`${metrics.total}`}
          tone="cyan"
          sub="stored entries"
          metrics={metrics}
        />
        <MetricCard
          label="Fragmentation"
          value={pct(metrics.fragmentationRatio)}
          tone="amber"
          sub="low-importance share"
          metrics={metrics}
        />
        <MetricCard
          label="Decay (p50)"
          value={pct(metrics.decay.p50)}
          tone="violet"
          sub={`p90 ${metrics.decay.p90.toFixed(2)} · p99 ${metrics.decay.p99.toFixed(2)}`}
          metrics={metrics}
        />
        <MetricCard
          label="Dedup rate"
          value={pct(metrics.dedupRate)}
          tone="emerald"
          sub="near-duplicate share"
          metrics={metrics}
        />
        <MetricCard
          label="Contradictions"
          value={`${metrics.contradictions}`}
          tone="rose"
          sub="title/content conflicts"
          metrics={metrics}
        />
        <MetricCard
          label="Budget used"
          value={pct(metrics.budgetUtilization)}
          tone="cyan"
          sub="token budget"
          metrics={metrics}
        />
        <MetricCard
          label="Avg importance"
          value={metrics.avgImportance.toFixed(2)}
          tone="emerald"
          sub="mean weight"
          metrics={metrics}
        />
      </div>
      <Card className="p-4">
        <div className="mb-3 text-sm font-medium text-slate-300">Composition by kind</div>
        <Donut data={metrics.kindBreakdown} />
      </Card>
    </div>
  );
});
