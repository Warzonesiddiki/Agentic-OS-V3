/**
 * Approvals.tsx — HITL (Human-in-the-Loop) approval queue.
 *
 * When an agent attempts a high-risk action, the server emits an
 * approval.requested SSE event. This page displays pending approvals
 * with the agent's reasoning, tool payload, and risk level — allowing
 * the operator to approve or deny with a single click.
 */
import { useApprovals } from "../../lib/useSSE";
import { remote as remoteApi } from "../../lib/remote";
import { Badge, Button, Card, SectionTitle, cn } from "../../components/ui";

interface ApprovalData {
  approvalId?: string;
  agentId?: string;
  taskId?: string;
  tool?: string;
  riskLevel?: string;
  payload?: unknown;
  reasoning?: string;
}

const RISK_TONE: Record<string, "rose" | "amber" | "slate"> = {
  destructive: "rose",
  privileged: "rose",
  network: "amber",
  write: "amber",
  read: "slate",
};

export default function Approvals() {
  const approvals = useApprovals();

  async function resolve(taskId: string, approved: boolean) {
    try {
      await remoteApi.resolveApproval(taskId, approved);
    } catch (e) {
      console.error("approval failed:", e);
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle title="Approval Queue" subtitle="Human-in-the-loop gates for high-risk agent actions" />

      {approvals.length === 0 ? (
        <Card className="p-8">
          <div className="flex flex-col items-center text-center">
            <div className="mb-2 text-3xl">✓</div>
            <p className="text-sm text-slate-400">No pending approvals</p>
            <p className="mt-1 text-xs text-slate-600">
              When an agent attempts a high-risk tool (destructive, network, privileged),
              its request will appear here for human authorization.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {approvals.map((event, i) => {
            const data = event.data as ApprovalData;
            return (
              <Card key={i} className={cn("p-4 nexus-fade", "border-amber-500/30")}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge tone="amber">⚠ Action Required</Badge>
                      <Badge tone={RISK_TONE[data.riskLevel ?? "read"] ?? "slate"}>
                        {data.riskLevel ?? "unknown"}
                      </Badge>
                      <span className="font-mono text-xs text-slate-300">{data.tool}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{data.reasoning}</p>
                    {data.payload != null && (
                      <pre className="mt-2 max-h-32 overflow-auto rounded-lg border border-nexus-border bg-slate-950/60 p-2 font-mono text-[10px] text-slate-400">
                        {typeof data.payload === "string" ? data.payload : JSON.stringify(data.payload, null, 2)}
                      </pre>
                    )}
                    <div className="mt-2 font-mono text-[10px] text-slate-600">
                      Agent: {data.agentId} · Task: {data.taskId}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="border-emerald-500/40 bg-emerald-600 text-white hover:bg-emerald-500"
                      onClick={() => data.taskId && resolve(data.taskId, true)}
                    >
                      ✓ Approve
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => data.taskId && resolve(data.taskId, false)}
                    >
                      ✕ Deny
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
