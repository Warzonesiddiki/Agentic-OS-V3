import { useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, SectionTitle, Textarea } from "../components/ui";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { RefetchIndicator } from "../components/RefetchIndicator";
import { toast } from "../lib/toast";
import { v3 } from "../lib/remote";
import { useV3Query } from "../lib/hooks";

interface Provider { name: string; models: string[]; capabilities: string[] }
interface Breaker { state: string; p95Ms: number; failureCount: number }
interface ChatResponse { provider: string; model: string; text: string; promptTokens: number; completionTokens: number; durationMs: number }

export default function LLMGateway() {
  const { data: providersResp, loading: loadingProviders, isRefetching: refetchingProviders } = useV3Query<{ providers: Provider[] }>("/api/v1/v3/llm/providers", []);
  const { data: breakers, loading: loadingBreakers, isRefetching: refetchingBreakers } = useV3Query<Record<string, Breaker>>("/api/v1/v3/llm/breakers", []);
  const providers = providersResp?.providers ?? [];

  const [chatModel, setChatModel] = useState("gpt-4o-mini");
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [chatResponse, setChatResponse] = useState<ChatResponse | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [budgetSession, setBudgetSession] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("100000");

  async function sendChat() {
    if (!chatInput.trim()) return;
    setChatLoading(true);
    const msgs = [...chatHistory, { role: "user", content: chatInput }];
    setChatHistory(msgs);
    setChatInput("");
    const d = await v3.call<ChatResponse>("/api/v1/v3/llm/chat", {
      method: "POST",
      body: JSON.stringify({
        sessionId: `ui:${Date.now()}`,
        model: chatModel,
        messages: msgs.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      }),
    });
    if (d.ok && d.data) {
      setChatResponse(d.data);
      setChatHistory([...msgs, { role: "assistant", content: d.data.text }]);
    } else {
      toast.danger(d.error?.message || "LLM request failed");
    }
    setChatLoading(false);
  }

  async function setBudget() {
    if (!budgetSession) return;
    const d = await v3.call("/api/v1/v3/llm/budget", {
      method: "POST",
      body: JSON.stringify({ sessionId: budgetSession, budget: Number(budgetAmount) }),
    });
    if (d.ok) toast.success("Budget set for " + budgetSession);
    else toast.danger(d.error?.message || "Failed to set budget");
  }

  return (
    <div className="space-y-6">
      <RefetchIndicator active={refetchingProviders || refetchingBreakers} />
      <SectionTitle title="LLM Gateway v2" subtitle="Multi-provider routing with circuit breakers and token budgets" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {loadingProviders ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonLoader key={i} variant="card" />)
        ) : providers.map(p => (
          <Card key={p.name} className="p-4">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-100 capitalize">{p.name}</h3>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {p.capabilities.map(c => <Badge key={c} tone="cyan">{c}</Badge>)}
            </div>
            <div className="mt-2 text-[10px] text-slate-500">{p.models.length} models: {p.models.slice(0, 3).join(", ")}{p.models.length > 3 ? "…" : ""}</div>
          </Card>
        ))}
        {!loadingProviders && providers.length === 0 && <EmptyState title="No providers" hint="Configure API keys in Settings." />}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Circuit Breakers" subtitle="Per-provider health status" />
          <div className="mt-3 space-y-2">
            {loadingBreakers ? (
              <SkeletonLoader lines={3} />
            ) : Object.entries(breakers ?? {}).map(([name, b]) => (
              <div key={name} className="flex items-center gap-3 rounded-lg border border-nexus-border bg-slate-950/40 px-3 py-2">
                <span className={`h-2 w-2 rounded-full ${b.state === "closed" ? "bg-emerald-400" : b.state === "open" ? "bg-rose-400" : "bg-amber-400"}`} />
                <span className="text-sm text-slate-200 capitalize">{name}</span>
                <Badge tone={b.state === "closed" ? "emerald" : b.state === "open" ? "rose" : "amber"}>{b.state}</Badge>
                <span className="ml-auto font-mono text-[10px] text-slate-500">p95 {Math.round(b.p95Ms)}ms · {b.failureCount} failures</span>
              </div>
            ))}
            {!loadingBreakers && Object.keys(breakers ?? {}).length === 0 && <div className="text-xs text-slate-600">No breaker data yet.</div>}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Token Budgets" subtitle="Set per-session token limits" />
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Session ID"><Input value={budgetSession} onChange={e => setBudgetSession(e.target.value)} placeholder="my-session" /></Field>
              <Field label="Budget (tokens)"><Input value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)} placeholder="100000" /></Field>
            </div>
            <Button variant="primary" onClick={setBudget} disabled={!budgetSession}>Set Budget</Button>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle title="Chat" subtitle="Send a message through the gateway" />
        <div className="mt-3">
          <div className="mb-3 flex items-center gap-2">
            <Field label="Model"><Input value={chatModel} onChange={e => setChatModel(e.target.value)} className="w-48 font-mono" /></Field>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-nexus-border bg-slate-950/60 p-3">
            {chatHistory.map((m, i) => (
              <div key={i} className={`rounded-lg px-3 py-2 text-xs ${m.role === "user" ? "ml-12 bg-cyan-500/10 text-cyan-200" : "mr-12 bg-slate-800 text-slate-200"}`}>
                <span className="mb-1 block font-mono text-[10px] text-slate-500">{m.role}</span>
                {m.content}
              </div>
            ))}
            {chatHistory.length === 0 && <div className="text-center text-xs text-slate-600">Start a conversation.</div>}
          </div>
          <div className="mt-3 flex gap-2">
            <Textarea value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message…" rows={2} className="flex-1" />
            <Button variant="primary" onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>{chatLoading ? "…" : "Send"}</Button>
          </div>
          {chatResponse && (
            <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
              <Badge tone="cyan">provider: {chatResponse.provider}</Badge>
              <Badge tone="emerald">{chatResponse.promptTokens}+{chatResponse.completionTokens} tokens</Badge>
              <Badge tone="amber">{chatResponse.durationMs}ms</Badge>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
