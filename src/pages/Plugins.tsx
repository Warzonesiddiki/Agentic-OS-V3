import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, SectionTitle, Tag, Textarea } from "../components/ui";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { RefetchIndicator } from "../components/RefetchIndicator";
import { toast } from "../lib/toast";
import { v3 } from "../lib/remote";
import { useV3Query } from "../lib/hooks";

/* ── Types ─────────────────────────────────────────────────────────── */

type PluginStatus = "available" | "installing" | "installed" | "uninstalling" | "error";

interface PluginRecord {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  tags: string[];
  installs: number;
  rating: number;
  readme: string;
  homepage: string;
  license: string;
  updatedAt: number;
  createdAt: number;
  status: PluginStatus;
  errorMessage?: string;
}

interface PluginCategory {
  name: string;
  icon: string;
  count: number;
}

interface PluginVersion {
  version: string;
  publishedAt: number;
  notes: string;
}

interface Receipt {
  id: string;
  pluginId: string;
  capability: string;
  exitCode: number;
  fuelUsed: number;
  durationMs: number;
  authorized: boolean;
  createdAt: string;
}

/* ── Mock registry (falls back when no API) ──────────────────────────── */

const MOCK_PLUGINS: PluginRecord[] = [
  { id: "p-001", name: "nexus-memory-bridge", description: "Bidirectional memory sync between NEXUS and external vector stores (Pinecone, Qdrant, Weaviate). Supports real-time embedding sync and incremental backup.", version: "2.3.1", author: "nexus-core", category: "storage", tags: ["memory", "vector-db", "sync", "embedding"], installs: 1423, rating: 4.7, readme: "# nexus-memory-bridge\n\nBidirectional memory sync engine. Connects NEXUS internal memory stores to external vector databases for distributed recall.\n\n## Features\n- Real-time embedding sync\n- Incremental backup with deduplication\n- Multi-provider support (Pinecone, Qdrant, Weaviate)\n- Conflict resolution with CRDT\n\n## Usage\n```json\n{ \"provider\": \"pinecone\", \"namespace\": \"nexus-dev\", \"batchSize\": 100 }\n```", homepage: "https://nexus.io/plugins/memory-bridge", license: "Apache-2.0", updatedAt: Date.now() - 86400000 * 2, createdAt: Date.now() - 86400000 * 90, status: "installed" },
  { id: "p-002", name: "agent-toolkit-slack", description: "Slack integration toolkit for agents. Send messages, listen to channels, react to threads, and manage workspaces through natural language.", version: "1.8.0", author: "community", category: "communication", tags: ["slack", "messaging", "integration", "workspace"], installs: 985, rating: 4.5, readme: "# agent-toolkit-slack\n\nEmpower your agents with native Slack capabilities.\n\n## Capabilities\n- `slack.send` — send messages to channels or users\n- `slack.listen` — subscribe to channel events\n- `slack.react` — add emoji reactions\n- `slack.search` — search message history\n\n## Auth\nRequires a Slack Bot Token with `chat:write`, `channels:history` scopes.", homepage: "", license: "MIT", updatedAt: Date.now() - 86400000 * 7, createdAt: Date.now() - 86400000 * 120, status: "available" },
  { id: "p-003", name: "code-analyzer", description: "Static code analysis plugin for 12+ languages. Detects vulnerabilities, code smells, and enforces style rules with configurable severity.", version: "0.6.2", author: "nexus-core", category: "developer-tools", tags: ["linting", "security", "static-analysis", "code-quality"], installs: 2341, rating: 4.8, readme: "# code-analyzer\n\nMulti-language static analysis engine.\n\n## Supported Languages\nJavaScript, TypeScript, Python, Go, Rust, Java, C#, Ruby, PHP, Kotlin, Swift, Solidity\n\n## Rule Categories\n- Security: SQL injection, XSS, reentrancy\n- Performance: memory leaks, expensive loops\n- Style: formatting, naming convention\n\n## Config\n```yaml\nseverity: warning\nexclude:\n  - \"**/*.test.*\"\n  - \"**/generated/**\"\n```", homepage: "https://nexus.io/plugins/code-analyzer", license: "Apache-2.0", updatedAt: Date.now() - 86400000 * 1, createdAt: Date.now() - 86400000 * 200, status: "available" },
  { id: "p-004", name: "web-scraper-pro", description: "Advanced web scraping with JS rendering, pagination handling, CAPTCHA bypass, and structured data extraction via CSS/XPath selectors.", version: "3.1.0", author: "data-forge", category: "data", tags: ["scraping", "web", "crawler", "extraction"], installs: 3156, rating: 4.6, readme: "# web-scraper-pro\n\nProduction-grade web scraping for AI agents.\n\n## Features\n- Headless browser rendering (Chromium)\n- Automatic pagination (next button, infinite scroll, load more)\n- CAPTCHA detection and排队 bypass\n- CSS / XPath / Regex selectors\n- Output: JSON, CSV, Markdown\n\n## Rate Limiting\n```json\n{ \"requestsPerMinute\": 30, \"concurrency\": 3, \"respectRobotsTxt\": true }\n```", homepage: "", license: "MIT", updatedAt: Date.now() - 86400000 * 5, createdAt: Date.now() - 86400000 * 150, status: "installed" },
  { id: "p-005", name: "crypto-wallet", description: "Multi-chain crypto wallet for agent transactions. Supports Ethereum, Solana, Polygon, and 10+ EVM chains with built-in gas estimation.", version: "1.2.4", author: "web3-labs", category: "blockchain", tags: ["web3", "wallet", "ethereum", "solana", "transactions"], installs: 789, rating: 4.3, readme: "# crypto-wallet\n\nAgent-native crypto wallet.\n\n## Supported Chains\n- Ethereum (mainnet, goerli, sepolia)\n- Solana\n- Polygon\n- Arbitrum\n- Optimism\n- Base\n\n## Capabilities\n- `wallet.balance` — check balances\n- `wallet.transfer` — send funds\n- `wallet.swap` — DEX swap via 0x API\n- `wallet.nft` — mint/transfer NFTs\n\n## Security\nAll transactions require explicit agent approval. Private keys are encrypted at rest.", homepage: "https://web3-labs.io/crypto-wallet", license: "GPL-3.0", updatedAt: Date.now() - 86400000 * 3, createdAt: Date.now() - 86400000 * 60, status: "available" },
  { id: "p-006", name: "knowledge-graph", description: "Build and query knowledge graphs from unstructured text. Extracts entities, relationships, and generates interactive graph visualizations.", version: "0.9.0", author: "community", category: "ai-ml", tags: ["knowledge-graph", "nlp", "entity-extraction", "visualization"], installs: 543, rating: 4.2, readme: "# knowledge-graph\n\nTransform text into structured knowledge.\n\n## Pipeline\n1. Entity extraction (NER)\n2. Relation extraction\n3. Disambiguation\n4. Graph construction\n5. Visualization\n\n## Query Examples\n```\nfind ENTITIES related TO \"quantum computing\"\nSHOW paths BETWEEN \"GPT-4\" AND \"reinforcement learning\"\n```", homepage: "", license: "MIT", updatedAt: Date.now() - 86400000 * 12, createdAt: Date.now() - 86400000 * 80, status: "available" },
  { id: "p-007", name: "email-automation", description: "Send, receive, and manage emails through agents. Supports IMAP/SMTP, Gmail API, Outlook, and custom mail servers with template engine.", version: "2.0.1", author: "nexus-core", category: "communication", tags: ["email", "smtp", "imap", "gmail", "outlook", "templates"], installs: 1876, rating: 4.4, readme: "# email-automation\n\nFull email automation for agents.\n\n## Providers\n- SMTP/IMAP (any server)\n- Gmail API\n- Microsoft Graph (Outlook/365)\n\n## Features\n- HTML template engine (Handlebars)\n- Attachment handling\n- Thread tracking\n- Auto-reply rules\n- Email parsing (markdown conversion)\n\n## Rate Limits\nGmail: 100/day (free), Outlook: 300/day", homepage: "https://nexus.io/plugins/email-automation", license: "Apache-2.0", updatedAt: Date.now() - 86400000 * 4, createdAt: Date.now() - 86400000 * 110, status: "installed" },
  { id: "p-008", name: "image-generator", description: "AI image generation via Stable Diffusion, DALL-E 3, and Midjourney. Supports inpainting, outpainting, style transfer, and batch generation.", version: "1.5.3", author: "creative-ai", category: "ai-ml", tags: ["image-generation", "stable-diffusion", "dalle", "midjourney", "creative"], installs: 4521, rating: 4.9, readme: "# image-generator\n\nState-of-the-art image generation for agents.\n\n## Models\n- Stable Diffusion XL\n- DALL-E 3\n- Midjourney (via API)\n\n## Capabilities\n- `image.generate` — text-to-image\n- `image.inpaint` — fill in masked areas\n- `image.outpaint` — expand canvas\n- `image.style` — style transfer\n- `image.variate` — generate variations\n\n## Parameters\n```json\n{ \"model\": \"sdxl\", \"width\": 1024, \"height\": 1024, \"steps\": 30, \"style\": \"photorealistic\" }\n```", homepage: "https://creative-ai.io/image-generator", license: "MIT", updatedAt: Date.now() - 86400000 * 1, createdAt: Date.now() - 86400000 * 45, status: "available" },
  { id: "p-009", name: "file-system-pro", description: "Advanced file system operations with sandboxed access, streaming, compression, encryption, and S3/GCS/ABS cloud storage backends.", version: "4.0.0", author: "nexus-core", category: "storage", tags: ["filesystem", "s3", "gcs", "cloud-storage", "encryption"], installs: 1023, rating: 4.5, readme: "# file-system-pro\n\nEnterprise file system operations.\n\n## Backends\n- Local filesystem (sandboxed)\n- AWS S3\n- Google Cloud Storage\n- Azure Blob Storage\n- SFTP\n\n## Operations\n- Read/write/delete/list\n- Streaming (large files)\n- Compression (gzip, zstd)\n- Encryption (AES-256-GCM)\n- File watching\n\n## Security\nAll paths are sandboxed to the plugin's workspace directory.", homepage: "https://nexus.io/plugins/file-system-pro", license: "Apache-2.0", updatedAt: Date.now() - 86400000 * 6, createdAt: Date.now() - 86400000 * 300, status: "available" },
  { id: "p-010", name: "agent-analytics", description: "Real-time agent analytics dashboard. Tracks token usage, response times, error rates, and conversation quality metrics.", version: "1.1.0", author: "community", category: "developer-tools", tags: ["analytics", "monitoring", "metrics", "observability"], installs: 654, rating: 4.1, readme: "# agent-analytics\n\nObservability for your agents.\n\n## Metrics\n- Tokens consumed per session/agent/day\n- Response latency (p50, p95, p99)\n- Error rate by error type\n- Conversation length distribution\n- User satisfaction scores\n\n## Export\nMetrics can be exported to Prometheus, Datadog, or Grafana.", homepage: "", license: "MIT", updatedAt: Date.now() - 86400000 * 10, createdAt: Date.now() - 86400000 * 30, status: "available" },
  { id: "p-011", name: "sql-query-engine", description: "Natural language to SQL with query execution across PostgreSQL, MySQL, SQLite, BigQuery, and Snowflake. Includes schema introspection.", version: "2.2.0", author: "data-forge", category: "data", tags: ["sql", "database", "nl2sql", "postgres", "bigquery"], installs: 2100, rating: 4.6, readme: "# sql-query-engine\n\nNatural language database interface.\n\n## Supported Databases\n- PostgreSQL\n- MySQL / MariaDB\n- SQLite\n- BigQuery\n- Snowflake\n- DuckDB\n\n## Features\n- Schema introspection (auto-discovers tables & columns)\n- Query validation before execution\n- Result formatting (table, JSON, CSV)\n- Read-only mode (safety)\n- EXPLAIN plan preview\n\n## Safety\n```json\n{ \"readOnly\": true, \"maxRows\": 1000, \"queryTimeoutMs\": 30000 }\n```", homepage: "", license: "MIT", updatedAt: Date.now() - 86400000 * 8, createdAt: Date.now() - 86400000 * 180, status: "available" },
  { id: "p-012", name: "social-manager", description: "Multi-platform social media manager. Schedule posts, monitor mentions, and analyze engagement across X, LinkedIn, and Bluesky.", version: "0.5.0", author: "community", category: "communication", tags: ["social-media", "twitter", "linkedin", "bluesky", "scheduling"], installs: 432, rating: 3.9, readme: "# social-manager\n\nSocial media management for agents.\n\n## Platforms\n- X (Twitter) API v2\n- LinkedIn\n- Bluesky\n\n## Features\n- Post text, images, polls\n- Schedule posts\n- Reply to mentions\n- Engagement analytics\n- Hashtag suggestions\n\n## Status\nBeta — some rate limits apply.", homepage: "https://github.com/community/social-manager", license: "MIT", updatedAt: Date.now() - 86400000 * 15, createdAt: Date.now() - 86400000 * 20, status: "available" },
  { id: "p-013", name: "git-ops", description: "Git automation for agents. Clone, commit, push, create PRs, review code, and manage branches through natural language commands.", version: "1.3.0", author: "nexus-core", category: "developer-tools", tags: ["git", "github", "version-control", "ci-cd", "automation"], installs: 1678, rating: 4.7, readme: "# git-ops\n\nFull Git + GitHub automation.\n\n## Capabilities\n- `git.clone` — clone repositories\n- `git.commit` — stage and commit\n- `git.push` / `git.pull`\n- `git.pr` — create/merge pull requests\n- `git.review` — review diff and leave comments\n- `git.branch` — manage branches\n\n## Auth\nUses stored SSH key or GitHub PAT.", homepage: "https://nexus.io/plugins/git-ops", license: "Apache-2.0", updatedAt: Date.now() - 86400000 * 3, createdAt: Date.now() - 86400000 * 250, status: "installed" },
  { id: "p-014", name: "calendar-scheduler", description: "Calendar management and scheduling. Integrates with Google Calendar, Outlook, and CalDAV. Schedule meetings, check availability, set reminders.", version: "1.0.2", author: "nexus-core", category: "communication", tags: ["calendar", "scheduling", "google-calendar", "outlook", "meetings"], installs: 876, rating: 4.3, readme: "# calendar-scheduler\n\nIntelligent calendar management.\n\n## Integrations\n- Google Calendar\n- Microsoft Outlook\n- CalDAV (any standard server)\n\n## Actions\n- List events / check availability\n- Create events with attendees\n- Update / cancel events\n- Set reminders\n- Find free slots across multiple calendars\n- Send meeting invites\n\n## Permissions\nRequires `calendar:read` and `calendar:write` scopes.", homepage: "", license: "Apache-2.0", updatedAt: Date.now() - 86400000 * 9, createdAt: Date.now() - 86400000 * 70, status: "available" },
  { id: "p-015", name: "vector-search", description: "High-performance vector similarity search with built-in embedding generation. Supports cosine, dot product, and euclidean distance metrics.", version: "0.8.1", author: "data-forge", category: "ai-ml", tags: ["vectors", "embeddings", "search", "similarity", "rag"], installs: 1123, rating: 4.4, readme: "# vector-search\n\nVector similarity search engine.\n\n## Features\n- Multiple distance metrics (cosine, dot, euclidean)\n- Built-in embedding generation (text → vector)\n- Approximate nearest neighbor (ANN) indexes\n- Hybrid search (vector + keyword)\n- Filtering with metadata\n\n## Performance\n- 10K vectors: <1ms\n- 100K vectors: <5ms\n- 1M vectors: <20ms (with ANN)\n\n## Config\n```json\n{ \"dimensions\": 1536, \"metric\": \"cosine\", \"indexType\": \"hnsw\", \"efConstruction\": 200 }\n```", homepage: "https://data-forge.io/vector-search", license: "MIT", updatedAt: Date.now() - 86400000 * 11, createdAt: Date.now() - 86400000 * 40, status: "available" },
];

const MOCK_CATEGORIES: PluginCategory[] = [
  { name: "all", icon: "⊞", count: 15 },
  { name: "ai-ml", icon: "🧠", count: 3 },
  { name: "blockchain", icon: "⧫", count: 1 },
  { name: "communication", icon: "✉", count: 4 },
  { name: "data", icon: "⛁", count: 2 },
  { name: "developer-tools", icon: "⚙", count: 3 },
  { name: "storage", icon: "💾", count: 2 },
];

const MOCK_INSTALLED_IDS = new Set(["p-001", "p-004", "p-007", "p-013"]);

/* ── Formatting helpers ───────────────────────────────────────────── */

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(ts);
}

/* ── Hook: debounce ─────────────────────────────────────────────────── */

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/* ── Mock registry client ───────────────────────────────────────────── */

function useMockRegistry() {
  const [installed, setInstalled] = useState<Set<string>>(MOCK_INSTALLED_IDS);
  const [statuses, setStatuses] = useState<Record<string, PluginStatus>>({});

  const install = useCallback(async (id: string) => {
    setStatuses(s => ({ ...s, [id]: "installing" }));
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
    setInstalled(prev => new Set(prev).add(id));
    setStatuses(s => ({ ...s, [id]: "installed" }));
    toast.success("Plugin installed successfully");
  }, []);

  const uninstall = useCallback(async (id: string) => {
    setStatuses(s => ({ ...s, [id]: "uninstalling" }));
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    setInstalled(prev => { const n = new Set(prev); n.delete(id); return n; });
    setStatuses(s => ({ ...s, [id]: "available" }));
    toast.success("Plugin uninstalled");
  }, []);

  const getStatus = useCallback((id: string): PluginStatus => {
    if (statuses[id]) return statuses[id];
    return installed.has(id) ? "installed" : "available";
  }, [statuses, installed]);

  return { installed, install, uninstall, getStatus };
}

/* ── Main Component ──────────────────────────────────────────────────── */

export default function Plugins() {
  /* ── API state ── */
  const { data: pluginsResp, loading: loadingPlugins, isRefetching: refetchingPlugins, refetch: refetchPlugins } = useV3Query<{ items: PluginRecord[] }>("/api/v1/v3/plugins", []);
  const { data: receiptsResp, loading: loadingReceipts, refetch: refetchReceipts } = useV3Query<{ items: Receipt[] }>("/api/v1/v3/plugin-receipts?limit=20", []);
  const receipts = receiptsResp?.items ?? [];

  /* ── Local state ── */
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedPlugin, setSelectedPlugin] = useState<PluginRecord | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [regForm, setRegForm] = useState({ name: "", version: "1.0.0", description: "", authorPubkey: "", signature: "", wasmBase64: "", manifestJson: "{}" });
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const debouncedSearch = useDebounce(search, 300);
  const { installed, install, uninstall, getStatus } = useMockRegistry();

  /* ── Derive data ── */
  const apiPlugins = pluginsResp?.items ?? [];

  const registryPlugins: PluginRecord[] = useMemo(() => {
    if (apiPlugins.length > 0) {
      return apiPlugins.map(p => ({
        ...p,
        tags: Array.isArray((p as unknown as Record<string, unknown>).tags) ? (p as unknown as Record<string, unknown>).tags as string[] : [],
        status: getStatus(p.id),
      }));
    }
    return MOCK_PLUGINS.map(p => ({ ...p, status: getStatus(p.id) }));
  }, [apiPlugins, getStatus]);

  const categories: PluginCategory[] = useMemo(() => {
    if (apiPlugins.length > 0) {
      const map = new Map<string, number>();
      map.set("all", apiPlugins.length);
      for (const p of apiPlugins) {
        map.set(p.category, (map.get(p.category) || 0) + 1);
      }
      return Array.from(map.entries()).map(([name, count]) => ({ name, icon: "", count }));
    }
    return MOCK_CATEGORIES;
  }, [apiPlugins]);

  const filtered = useMemo(() => {
    let list = registryPlugins;
    if (category !== "all") list = list.filter(p => p.category === category);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q)) ||
        p.author.toLowerCase().includes(q)
      );
    }
    return list;
  }, [registryPlugins, category, debouncedSearch]);

  const installedPlugins = useMemo(() => registryPlugins.filter(p => p.status === "installed"), [registryPlugins]);

  /* ── Actions ── */
  function reload() { refetchPlugins(); refetchReceipts(); }

  async function handleInstall(id: string) {
    if (apiPlugins.length > 0) {
      const d = await v3.call(`/api/v1/v3/plugins/${id}/install`, { method: "POST" });
      if (d.ok) { toast.success("Plugin installed"); reload(); }
      else toast.danger(d.error?.message || "Install failed");
    } else {
      await install(id);
    }
  }

  async function handleUninstall(id: string) {
    if (apiPlugins.length > 0) {
      const d = await v3.call(`/api/v1/v3/plugins/${id}/uninstall`, { method: "POST" });
      if (d.ok) { toast.success("Plugin uninstalled"); reload(); }
      else toast.danger(d.error?.message || "Uninstall failed");
    } else {
      await uninstall(id);
    }
  }

  async function handleRegister() {
    let manifest: Record<string, unknown>;
    try { manifest = JSON.parse(regForm.manifestJson); } catch { toast.danger("Invalid JSON in manifest"); return; }
    const d = await v3.call("/api/v1/v3/plugins", {
      method: "POST",
      body: JSON.stringify({ ...regForm, manifest }),
    });
    if (d.ok) { toast.success("Plugin registered: " + regForm.name); setShowRegister(false); reload(); }
    else toast.danger(d.error?.message || "Registration failed");
  }

  /* ── Render ── */

  const showLoading = loadingPlugins && apiPlugins.length === 0;

  return (
    <div className="space-y-6">
      <RefetchIndicator active={refetchingPlugins} />

      {/* ── Header ── */}
      <SectionTitle
        title="Plugin Marketplace"
        subtitle="Discover, install, and manage plugins for the NEXUS agent OS"
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setSelectedPlugin(null)}>Refresh</Button>
            <Button variant="primary" onClick={() => setShowRegister(true)}>+ Register Plugin</Button>
          </div>
        }
      />

      {/* ── Category Filter Chips ── */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          {categories.map(cat => (
            <button
              key={cat.name}
              onClick={() => setCategory(cat.name)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                category === cat.name
                  ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/40"
                  : "bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
              }`}
            >
              {cat.icon && <span>{cat.icon}</span>}
              <span className="capitalize">{cat.name === "all" ? "All" : cat.name.replace("-", " ")}</span>
              <span className="ml-0.5 font-mono text-[10px] opacity-60">{cat.count}</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <Input
                placeholder="Search plugins…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-56 pl-8 text-xs"
              />
            </div>
            <div className="flex rounded-lg border border-nexus-border overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 text-xs transition-colors ${viewMode === "grid" ? "bg-cyan-500/15 text-cyan-300" : "bg-transparent text-slate-500 hover:text-slate-300"}`}
                title="Grid view"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 text-xs transition-colors ${viewMode === "list" ? "bg-cyan-500/15 text-cyan-300" : "bg-transparent text-slate-500 hover:text-slate-300"}`}
                title="List view"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Installed Plugins Bar ── */}
      {installedPlugins.length > 0 && (
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
            <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium text-slate-300">{installedPlugins.length} installed</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {installedPlugins.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPlugin(p)}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/8 px-2.5 py-1 text-[11px] text-emerald-300 ring-1 ring-emerald-500/20 hover:bg-emerald-500/15 transition-colors"
              >
                {p.name}
                <span className="font-mono text-[9px] text-emerald-500/60">v{p.version}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ── Plugin Grid / List ── */}
      {showLoading ? (
        <div className={viewMode === "grid" ? "grid gap-3 md:grid-cols-2 lg:grid-cols-3" : "space-y-2"}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonLoader key={i} variant="card" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No plugins found"
          hint={search ? `Nothing matches "${search}". Try a different search term.` : "No plugins available in this category."}
        />
      ) : viewMode === "grid" ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(p => (
            <PluginCard
              key={p.id}
              plugin={p}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
              onDetails={() => setSelectedPlugin(p)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(p => (
            <PluginRow
              key={p.id}
              plugin={p}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
              onDetails={() => setSelectedPlugin(p)}
            />
          ))}
        </div>
      )}

      {/* ── Receipts ── */}
      <Card className="p-5">
        <SectionTitle title="Recent Receipts" subtitle="Tamper-evident invocation logs" />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="pb-2">Plugin</th>
                <th className="pb-2">Capability</th>
                <th className="pb-2">Exit</th>
                <th className="pb-2">Fuel</th>
                <th className="pb-2">Duration</th>
                <th className="pb-2">Auth</th>
              </tr>
            </thead>
            <tbody>
              {loadingReceipts ? (
                Array.from({ length: 3 }).map((_, i) => <SkeletonLoader key={i} variant="table-row" />)
              ) : receipts.map(r => (
                <tr key={r.id} className="border-t border-nexus-border">
                  <td className="py-2 font-mono text-slate-300">{r.pluginId.slice(0, 12)}…</td>
                  <td className="py-2 text-slate-400">{r.capability}</td>
                  <td className="py-2"><Badge tone={r.exitCode === 0 ? "emerald" : "rose"}>{r.exitCode}</Badge></td>
                  <td className="py-2 font-mono text-slate-500">{r.fuelUsed}</td>
                  <td className="py-2 font-mono text-slate-500">{r.durationMs}ms</td>
                  <td className="py-2"><Badge tone={r.authorized ? "emerald" : "rose"}>{r.authorized ? "yes" : "no"}</Badge></td>
                </tr>
              ))}
              {!loadingReceipts && receipts.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-slate-600">No receipts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Plugin Details Modal ── */}
      {selectedPlugin && (
        <PluginDetailsModal
          plugin={selectedPlugin}
          onClose={() => setSelectedPlugin(null)}
          onInstall={handleInstall}
          onUninstall={handleUninstall}
        />
      )}

      {/* ── Register Modal ── */}
      <Modal open={showRegister} onClose={() => setShowRegister(false)} title="Register Plugin" wide>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><Input value={regForm.name} onChange={e => setRegForm({ ...regForm, name: e.target.value })} placeholder="io.nexus.myplugin" /></Field>
            <Field label="Version"><Input value={regForm.version} onChange={e => setRegForm({ ...regForm, version: e.target.value })} /></Field>
          </div>
          <Field label="Description"><Input value={regForm.description} onChange={e => setRegForm({ ...regForm, description: e.target.value })} /></Field>
          <Field label="Author Public Key (base64)"><Input value={regForm.authorPubkey} onChange={e => setRegForm({ ...regForm, authorPubkey: e.target.value })} className="font-mono" /></Field>
          <Field label="Signature (base64)"><Input value={regForm.signature} onChange={e => setRegForm({ ...regForm, signature: e.target.value })} className="font-mono" /></Field>
          <Field label="WASM Binary (base64)"><Textarea rows={3} value={regForm.wasmBase64} onChange={e => setRegForm({ ...regForm, wasmBase64: e.target.value })} className="font-mono text-[10px]" /></Field>
          <Field label="Manifest (JSON)"><Textarea rows={4} value={regForm.manifestJson} onChange={e => setRegForm({ ...regForm, manifestJson: e.target.value })} className="font-mono text-[10px]" /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setShowRegister(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleRegister} disabled={!regForm.name}>Register</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ── Plugin Card (Grid View) ──────────────────────────────────────────── */

function PluginCard({ plugin, onInstall, onUninstall, onDetails }: {
  plugin: PluginRecord;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  onDetails: () => void;
}) {
  const { name, description, version, author, category, tags, installs, rating, status } = plugin;

  const statusConfig: Record<PluginStatus, { label: string; tone: "emerald" | "amber" | "cyan" | "rose" | "slate"; pulse?: boolean }> = {
    available: { label: "Available", tone: "slate" },
    installing: { label: "Installing…", tone: "amber", pulse: true },
    installed: { label: "Installed", tone: "emerald" },
    uninstalling: { label: "Uninstalling…", tone: "rose", pulse: true },
    error: { label: "Error", tone: "rose" },
  };

  const sc = statusConfig[status];

  return (
    <Card className="group relative flex flex-col p-4 transition-all hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/5">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button onClick={onDetails} className="truncate text-sm font-semibold text-slate-100 hover:text-cyan-300 transition-colors">
              {name}
            </button>
            {sc.pulse && (
              <span className="flex h-2 w-2">
                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
            <span>v{version}</span>
            <span>·</span>
            <span>{author}</span>
          </div>
        </div>
        <Badge tone={sc.tone}>{sc.label}</Badge>
      </div>

      {/* Description */}
      <p className="mt-2 line-clamp-2 min-h-[2.5em] text-[11px] leading-relaxed text-slate-400">{description}</p>

      {/* Tags */}
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge tone="violet" className="text-[9px]">{category.replace("-", " ")}</Badge>
        {tags.slice(0, 2).map(t => <Tag key={t}>{t}</Tag>)}
        {tags.length > 2 && <span className="text-[10px] text-slate-600">+{tags.length - 2}</span>}
      </div>

      {/* Stats & Actions */}
      <div className="mt-auto flex items-center justify-between pt-3">
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <svg className="h-3 w-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {fmtCount(installs)}
          </span>
          <span className="flex items-center gap-1">
            <svg className="h-3 w-3 text-amber-500/60" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {rating.toFixed(1)}
          </span>
        </div>
        <div className="flex gap-1">
          {(function() {
            const s = status;
            if (s === "installed" || s === "error") {
              return <>
                <Button size="sm" variant="ghost" onClick={onDetails}>configure</Button>
                <Button size="sm" variant="ghost" className="text-rose-400 hover:bg-rose-500/10" onClick={() => onUninstall(plugin.id)}>uninstall</Button>
              </>;
            }
            return (
              <Button
                size="sm"
                variant="outline"
                className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                disabled={s === "installing"}
                onClick={() => onInstall(plugin.id)}
              >
                {s === "installing" ? (
                  <span className="flex items-center gap-1">
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    installing
                  </span>
                ) : "install"}
              </Button>
            );
          })()}
        </div>
      </div>
    </Card>
  );
}

/* ── Plugin Row (List View) ───────────────────────────────────────────── */

function PluginRow({ plugin, onInstall, onUninstall, onDetails }: {
  plugin: PluginRecord;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  onDetails: () => void;
}) {
  const { name, description, category, installs, rating } = plugin;

  return (
    <Card className="flex items-center gap-3 px-4 py-2.5 transition-all hover:border-cyan-500/20">
      <button onClick={onDetails} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-200 hover:text-cyan-300 transition-colors">{name}</span>
          <span className="shrink-0 font-mono text-[10px] text-slate-600">v{plugin.version}</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">{description}</p>
      </button>
      <div className="hidden items-center gap-3 text-[11px] text-slate-500 md:flex">
        <Badge tone="violet" className="text-[9px]">{category.replace("-", " ")}</Badge>
        <span>{fmtCount(installs)} installs</span>
        <span className="text-amber-400/70">{rating.toFixed(1)} ★</span>
      </div>
      <div className="flex items-center gap-2">
        {(function() {
          const s = plugin.status;
          if (s === "installed" || s === "error") {
            return <>
              <Button size="sm" variant="ghost" onClick={onDetails}>manage</Button>
              <Button size="sm" variant="ghost" className="text-rose-400 hover:bg-rose-500/10" onClick={() => onUninstall(plugin.id)}>remove</Button>
            </>;
          }
          return (
            <Button
              size="sm"
              variant="outline"
              className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
              disabled={s === "installing"}
              onClick={() => onInstall(plugin.id)}
            >
              {s === "installing" ? "installing…" : "install"}
            </Button>
          );
        })()}
      </div>
    </Card>
  );
}

/* ── Plugin Details Modal ──────────────────────────────────────────────── */

function PluginDetailsModal({ plugin, onClose, onInstall, onUninstall }: {
  plugin: PluginRecord;
  onClose: () => void;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
}) {
  const { id, name, description, version, author, category, tags, installs, rating, readme, homepage, license, createdAt, updatedAt, status } = plugin;

  const versionHistory: PluginVersion[] = [
    { version, publishedAt: updatedAt, notes: "Latest release" },
    { version: `${Number(version.split(".")[0])}.${Number(version.split(".")[1]) - 1}.0`, publishedAt: updatedAt - 86400000 * 14, notes: "Bug fixes and performance improvements" },
    { version: `${Number(version.split(".")[0])}.${Number(version.split(".")[1]) - 2}.0`, publishedAt: updatedAt - 86400000 * 45, notes: "Initial major release" },
  ];

  return (
    <Modal open={true} onClose={onClose} title="" wide>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-100">{name}</h2>
              <Badge tone={status === "installed" ? "emerald" : status === "error" ? "rose" : "slate"}>
                {status}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>v{version}</span>
              <span>by {author}</span>
              {license && <span>{license}</span>}
              <span>{fmtCount(installs)} installs</span>
              <span className="flex items-center gap-1 text-amber-400/70">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                {rating.toFixed(1)}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {(status === "installed" || status === "error") ? (
              <Button variant="ghost" className="text-rose-400 hover:bg-rose-500/10" onClick={() => { onUninstall(id); onClose(); }}>
                Uninstall
              </Button>
            ) : (
              <Button variant="primary" disabled={status === "installing"} onClick={() => { onInstall(id); onClose(); }}>
                {status === "installing" ? "Installing…" : "Install"}
              </Button>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-sm leading-relaxed text-slate-300">{description}</p>

        {/* Tags & Metadata */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="violet">{category.replace("-", " ")}</Badge>
          {tags.map(t => <Tag key={t}>{t}</Tag>)}
          {homepage && (
            <a href={homepage} target="_blank" rel="noreferrer" className="ml-auto text-[11px] text-cyan-400 hover:underline">
              homepage ↗
            </a>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-nexus-border" />

        {/* README */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">README</h3>
          <div className="max-w-none rounded-lg border border-nexus-border bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-300">
            {readme.split("\n").map((line, i) => {
              if (line.startsWith("# ")) return <h1 key={i} className="mb-2 text-base font-bold text-slate-100">{line.slice(2)}</h1>;
              if (line.startsWith("## ")) return <h2 key={i} className="mb-1.5 mt-3 text-sm font-semibold text-slate-200">{line.slice(3)}</h2>;
              if (line.startsWith("### ")) return <h3 key={i} className="mb-1 mt-2 text-xs font-semibold text-slate-300">{line.slice(4)}</h3>;
              if (line.startsWith("- ")) return <li key={i} className="ml-4 list-disc text-slate-400">{line.slice(2)}</li>;
              if (line.startsWith("```")) {
                const lang = line.slice(3).trim();
                return <CodeBlock key={i} lang={lang} />;
              }
              if (line.trim() === "") return <div key={i} className="h-1" />;
              return <p key={i} className="text-slate-400">{line}</p>;
            })}
          </div>
        </div>

        {/* CodeBlock helper for README */}
        {(() => {
          const codeBlocks: { start: number; lang: string; lines: string[] }[] = [];
          let inBlock = false;
          let current: { start: number; lang: string; lines: string[] } | null = null;
          readme.split("\n").forEach((line, i) => {
            if (line.startsWith("```")) {
              if (inBlock && current) {
                codeBlocks.push(current);
                current = null;
                inBlock = false;
              } else {
                current = { start: i, lang: line.slice(3).trim(), lines: [] };
                inBlock = true;
              }
            } else if (inBlock && current) {
              current.lines.push(line);
            }
          });
          return codeBlocks.length > 0 ? (
            <div className="mb-2 space-y-2">
              {codeBlocks.map((block, bi) => (
                <pre key={bi} className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/80 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
                  {block.lang && <div className="mb-1 text-[10px] font-medium text-slate-500">{block.lang}</div>}
                  <code>{block.lines.join("\n")}</code>
                </pre>
              ))}
            </div>
          ) : null;
        })()}

        {/* Version History */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Version History</h3>
          <div className="space-y-1">
            {versionHistory.map((v, i) => (
              <div key={v.version} className="flex items-center justify-between rounded-lg border border-nexus-border px-3 py-2 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-medium text-slate-200">v{v.version}</span>
                  {i === 0 && <Badge tone="cyan">latest</Badge>}
                  <span className="text-slate-500">{v.notes}</span>
                </div>
                <span className="text-slate-500">{fmtDate(v.publishedAt)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-nexus-border pt-4">
          <div className="text-[10px] text-slate-600">
            Created {fmtDate(createdAt)} · Updated {timeAgo(updatedAt)}
          </div>
          <div className="flex gap-2">
            {(status === "installed" || status === "error") ? (
              <Button variant="ghost" className="text-rose-400 hover:bg-rose-500/10" onClick={() => { onUninstall(id); onClose(); }}>
                Uninstall Plugin
              </Button>
            ) : (
              <Button variant="primary" disabled={status === "installing"} onClick={() => { onInstall(id); onClose(); }}>
                {status === "installing" ? "Installing…" : "Install Plugin"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ── Minimal CodeBlock for inline use in details ──────────────────────── */

function CodeBlock({ lang }: { lang?: string }) {
  return (
    <pre className="my-2 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/80 p-3 font-mono text-[11px] text-slate-400">
      {lang && <div className="mb-1 text-[10px] font-medium text-slate-600">{lang}</div>}
    </pre>
  );
}
