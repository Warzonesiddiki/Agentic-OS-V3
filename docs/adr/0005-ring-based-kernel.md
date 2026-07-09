# 0005 – Ring-Based Kernel Privilege Model

**Status:** Final
**Author:** Atlas
**Date:** 2026-07-01

## Context

NEXUS hosts agents with wildly varying trust levels: kernel-maintained
system agents, human CLI agents, MCP-connected remote agents, and
experimental or community-written agents. These agents should not all have
the same capabilities — a buggy or compromised remote agent should not be
able to import a brain dump or execute `git reset --hard`.

The agentic OS needs a privilege model analogous to CPU ring levels: every
agent has a ring number, every tool has a minimum ring requirement, and the
kernel enforces the intersection at dispatch time.

## Decision

### Five rings (0–4)

```typescript
export type Ring = 0 | 1 | 2 | 3 | 4;

export const RING_NAMES: Record<Ring, string> = {
  0: 'kernel',
  1: 'trusted-cli',
  2: 'mcp-protocol',
  3: 'remote-agent',
  4: 'quarantined',
};
```

| Ring | Name         | Description                                                  | Default agents                |
| ---- | ------------ | ------------------------------------------------------------ | ----------------------------- |
| 0    | Kernel       | System-level operations, policy changes, brain import/export | `nexus-kernel`, `nexus-admin` |
| 1    | Trusted CLI  | Local interactive agents (Claude Code, Codex)                | `claude-local`, `codex-local` |
| 2    | MCP Protocol | Remote MCP-connected clients                                 | `mcp-claude`, `mcp-cursor`    |
| 3    | Remote Agent | Untrusted remote agents (A2A delegated)                      | `a2a-*`                       |
| 4    | Quarantined  | Agents flagged for policy violations                         | Manual quarantine only        |

### Tool registry with minRing

Every registered tool declares a `minRing`:

```typescript
interface ToolSpec {
  name: string;
  riskLevel: 'safe' | 'read' | 'write' | 'destructive' | 'network' | 'privileged';
  minRing: Ring;
  approvalRequired: boolean;
  // ...
}
```

Examples:

| Tool            | minRing | Risk level  | Approval required |
| --------------- | ------- | ----------- | ----------------- |
| `memory.recall` | 1       | read        | No                |
| `net.fetch`     | 2       | network     | No                |
| `brain.import`  | 0       | destructive | Yes               |
| `git.reset`     | 0       | destructive | Yes               |
| `shell`         | 1       | privileged  | No                |

### Access control algorithm (`policy.ts: decideAccess()`)

```
if agent.ring >= 4 → DENY all mutations (quarantine)
if agent.ring > tool.minRing → DENY (insufficient privilege)
if tool.approvalRequired → require human approval gate
→ ALLOW
```

Ring 4 agents are hard-blocked from all mutations. Ring 3 agents cannot
access ring-0 or ring-1 tools (no shell, no git, no brain import). Ring
0 agents have unrestricted access but still face approval gates for
destructive actions.

### Priority queue mapping

The scheduler maps agent rings to priority queues:

```typescript
if ring <= 1 → Q0 (highest, interactive)
if ring === 2 → Q1
if ring === 3 → Q2
if ring === 4 → Q4 (lowest, self-improvement/background)
```

Ring 0 system operations run on Q0 alongside interactive CLI agents.
Ring 4 quarantined agents are scheduled at the lowest priority and
prevented from producing back-pressure on interactive work.

### Quarantine lifecycle

An active agent at ring 1–3 may be moved to ring 4 (quarantine) by:

- Policy violation: excessive error rate, suspicious call patterns,
  resource abuse.
- Manual admin action: `kernel.quarantineAgent(agentId)`.

A quarantined agent can be reinstated to ring 1 by explicit kernel
syscall `kernel.releaseAgent(agentId)`. There is no automatic
escalation path out of quarantine.

### Approval gates

Destructive tools that are _not_ hard-blocked require human approval:

```
tool.fn → approvalRequired: true → emit approval.request signal
                                   → wait for human decision (timeout)
                                   → execute or abort → audit
```

Approval gates are implemented as async signal-wait in the kernel
syscall path, not at the agent level. The agent sees a `{ status: 'pending_approval' }`
response until the human approves or rejects.

## Consequences

Positive:

- Least-privilege by default: new agents default to ring 3 unless the
  manifest explicitly requests a lower ring (which requires kernel
  approval).
- Clear audit trail: every `AccessDecision` records the agent ring, tool
  minRing, and whether the action was approved, denied, or blocked.
- Quarantine provides a non-destructive isolation path — the agent's
  state is preserved for investigation.
- Queue priority alignment ensures high-trust work is not starved by
  low-trust background agents.

Negative:

- Ring is a static manifest property — dynamic re-grading (temporary
  escalation for a specific operation) is not implemented.
- The four-level model adds complexity for deployments that only have
  one or two agent types.
- Quarantine detection is currently heuristic-based (error rate + resource
  metrics), not a formal anomaly detection system.
