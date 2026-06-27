import { useState } from "react";
import { handle, LOCAL_KEY, type ApiResponse } from "../store";
import { Badge, Button, Card, CodeBlock, Field, Input, SectionTitle, Select, Textarea } from "./ui";

interface Preset {
  label: string;
  method: string;
  path: string;
  query: string;
  body: string;
}

const PRESETS: Preset[] = [
  { label: "GET /health (public, no key)", method: "GET", path: "/api/v1/health", query: "", body: "" },
  { label: "GET /recall?q=…", method: "GET", path: "/api/v1/recall", query: "q=audit hash chain&budget=1000", body: "" },
  {
    label: "POST /memories (write — needs auth)",
    method: "POST",
    path: "/api/v1/memories",
    query: "",
    body: JSON.stringify({ kind: "fact", title: "Console-created memory", content: "Written through the perimeter guard.", tags: ["console"], importance: 0.8 }, null, 2),
  },
  { label: "GET /brain/export", method: "GET", path: "/api/v1/brain/export", query: "", body: "" },
  {
    label: "MCP tools/list",
    method: "POST",
    path: "/api/mcp",
    query: "",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, null, 2),
  },
];

export default function Console() {
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/api/v1/health");
  const [query, setQuery] = useState("");
  const [body, setBody] = useState("");
  const [keyMode, setKeyMode] = useState<"local" | "wrong" | "none">("local");
  const [res, setRes] = useState<ApiResponse | null>(null);
  const [busy, setBusy] = useState(false);

  function applyPreset(p: Preset) {
    setMethod(p.method);
    setPath(p.path);
    setQuery(p.query);
    setBody(p.body);
    setRes(null);
  }

  async function send() {
    setBusy(true);
    const q: Record<string, string> = {};
    new URLSearchParams(query).forEach((v, k) => {
      q[k] = v;
    });
    let parsedBody: unknown = undefined;
    if (method !== "GET" && body.trim()) {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        setRes({ ok: false, status: 0, headers: {}, traceId: "—", error: { code: "BAD_BODY", message: "Request body is not valid JSON." } });
        setBusy(false);
        return;
      }
    }
    const key = keyMode === "local" ? LOCAL_KEY : keyMode === "wrong" ? "nx_live_invalid_key_zzz" : undefined;
    const r = await handle({ method, path, query: q, body: parsedBody, key });
    setRes(r);
    setBusy(false);
  }

  const status = res?.status ?? 0;
  const tone = status >= 200 && status < 300 ? "emerald" : status >= 400 && status < 500 ? "amber" : status >= 500 ? "rose" : "slate";

  return (
    <Card className="p-4">
      <SectionTitle title="API console" subtitle="Calls the real perimeter guard (auth · scope · rate-limit · payload · validation)" />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <Button key={p.label} size="sm" variant="outline" onClick={() => applyPreset(p)}>{p.label}</Button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[120px_1fr_220px]">
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {["GET", "POST", "PATCH", "DELETE", "OPTIONS"].map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Path"><Input value={path} onChange={(e) => setPath(e.target.value)} className="font-mono" /></Field>
        <Field label="API key">
          <Select value={keyMode} onChange={(e) => setKeyMode(e.target.value as typeof keyMode)}>
            <option value="local">local-operator ✓</option>
            <option value="wrong">invalid key</option>
            <option value="none">no key</option>
          </Select>
        </Field>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Field label="Query string" hint="e.g. q=memory&budget=1000"><Input value={query} onChange={(e) => setQuery(e.target.value)} className="font-mono" placeholder="q=&budget=" /></Field>
        <Field label="Request body (JSON)" hint={method === "GET" ? "ignored for GET" : "validated with Zod"}>
          <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="{}" />
        </Field>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button variant="primary" onClick={send} disabled={busy}>{busy ? "sending…" : "Send request"}</Button>
        <span className="text-[11px] text-slate-500">Try POST /memories with “no key” → 401, or with “invalid key” → 401.</span>
      </div>

      {res && (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>HTTP {res.status}</Badge>
            <Badge tone={res.ok ? "emerald" : "rose"}>{res.ok ? "ok" : "error"}</Badge>
            <span className="font-mono text-[10px] text-slate-500">trace: {res.traceId}</span>
            <span className="font-mono text-[10px] text-slate-600">x-frame-options: {res.headers["x-frame-options"]}</span>
          </div>
          {res.error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 font-mono text-[11px] text-rose-300">{res.error.code}: {res.error.message}</div>}
          {res.data !== undefined && (
            <CodeBlock className="max-h-72">{JSON.stringify(res.data, null, 2)}</CodeBlock>
          )}
        </div>
      )}
    </Card>
  );
}
