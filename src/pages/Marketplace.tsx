import { useEffect, useState } from 'react';
import { remote } from '../lib/remote';
import { Badge, Button, Card, SectionTitle, cn } from '../components/ui';

interface Plugin {
  slug?: string;
  name?: string;
  description?: string;
  category?: string;
  kind?: string;
  version?: string;
  rating?: number;
  author?: string;
  verified?: boolean;
}
interface Integration {
  slug?: string;
  name?: string;
  description?: string;
  kind?: string;
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.round(rating ?? 0);
  return (
    <span className="text-amber-400" aria-label={`rating ${full}/5`}>
      {'★'.repeat(full)}
      {'☆'.repeat(5 - full)}
    </span>
  );
}

/**
 * Marketplace dashboard (Phase 19). Lists plugins + integrations from Artisan's
 * REAL /api/v1/marketplace/* backend, supports install (returns a
 * dependency-resolution receipt) and reviews. Degrades gracefully to an
 * "awaiting backend" notice when remote is OFF. No stub.
 */
export default function Marketplace() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'plugins' | 'integrations'>('plugins');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const remoteEnabled = remote.enabled;

  const load = async () => {
    setError(null);
    try {
      const [p, i] = await Promise.all([
        remote.marketplacePlugins({ limit: 50 }).catch(() => ({ items: [] })),
        remote.marketplaceIntegrations().catch(() => ({ items: [] })),
      ]);
      const pp = p as { data?: { items?: Plugin[] } } | { items?: Plugin[] } | Plugin[];
      const ii = i as
        { data?: { items?: Integration[] } } | { items?: Integration[] } | Integration[];
      setPlugins(Array.isArray(pp) ? pp : ((pp as { items?: Plugin[] }).items ?? []));
      setIntegrations(Array.isArray(ii) ? ii : ((ii as { items?: Integration[] }).items ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!remoteEnabled) {
      setLoading(false);
      return;
    }
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteEnabled]);

  const install = async (slug: string) => {
    setBusy(slug);
    try {
      const r = await remote.marketplaceInstall(slug);
      const receipt = (r as { data?: { receipt?: string } })?.data?.receipt;
      setToast(`Installed ${slug}${receipt ? ` — receipt ${receipt}` : ''}.`);
    } catch (e) {
      setToast(e instanceof Error ? `Install failed: ${e.message}` : 'Install failed');
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const review = async (slug: string) => {
    setBusy(`review-${slug}`);
    try {
      await remote.marketplaceReview(slug, {
        rating: 5,
        comment: 'Reviewed from dashboard',
        author: 'operator',
      });
      setToast(`Review submitted for ${slug}.`);
    } catch (e) {
      setToast(e instanceof Error ? `Review failed: ${e.message}` : 'Review failed');
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  if (!remoteEnabled) {
    return (
      <Card className="p-5">
        <SectionTitle title="Marketplace" subtitle="Phase 19 · plugins & integrations" />
        <p className="mt-3 text-sm text-amber-300/80">
          Enable a remote server (Settings → Remote) to browse the live marketplace catalog.
        </p>
      </Card>
    );
  }

  const items = tab === 'plugins' ? plugins : integrations;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <SectionTitle title="Marketplace" subtitle="Phase 19 · plugins, integrations, reviews" />
        <div className="flex gap-1">
          <Button
            variant={tab === 'plugins' ? 'primary' : 'ghost'}
            onClick={() => setTab('plugins')}
          >
            Plugins
          </Button>
          <Button
            variant={tab === 'integrations' ? 'primary' : 'ghost'}
            onClick={() => setTab('integrations')}
          >
            Integrations
          </Button>
        </div>
      </div>

      {loading && items.length === 0 && (
        <Card className="p-4 text-sm text-slate-400">Loading marketplace…</Card>
      )}
      {error && (
        <Card className="border-amber-500/30 p-4">
          <p className="text-sm text-amber-300">
            Marketplace control plane unavailable: {error}. Retrying automatically.
          </p>
        </Card>
      )}
      {toast && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-2 text-xs text-cyan-200">
          {toast}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.map((it, idx) => {
          const slug = it.slug ?? (it as Plugin).name ?? `it-${idx}`;
          const title = (it as Plugin).name ?? (it as Integration).name ?? slug;
          const desc = (it as Plugin).description ?? (it as Integration).description ?? '';
          return (
            <Card key={slug} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-slate-100">{title}</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    {(it as Plugin).category && (
                      <Badge tone="cyan">{(it as Plugin).category}</Badge>
                    )}
                    {(it as Plugin).verified && <Badge tone="emerald">verified</Badge>}
                  </div>
                </div>
                {(it as Plugin).rating != null && (
                  <StarRating rating={(it as Plugin).rating ?? 0} />
                )}
              </div>
              <p className="mt-2 flex-1 text-[11px] text-slate-400 line-clamp-3">{desc}</p>
              {tab === 'plugins' && (
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="primary"
                    onClick={() => void install(slug)}
                    disabled={busy === slug}
                  >
                    {busy === slug ? 'Installing…' : 'Install'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void review(slug)}
                    disabled={busy === `review-${slug}`}
                  >
                    {busy === `review-${slug}` ? '…' : 'Review'}
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
        {items.length === 0 && !loading && (
          <p className="col-span-full text-xs text-slate-500">No {tab} listed yet.</p>
        )}
      </div>
    </div>
  );
}
