# R1 Governed Sandbox Security Contract

**Story:** E10-S6  
**Status:** In progress — release-blocking until E10-S8 adversarial validation, platform policy review, and E10-S29 clean-machine evidence complete. This contract does not approve the runner or R1 release.

## Security boundary

The runner is a bounded local process runner, **not** a VM, container, or OS security sandbox. It is suitable only for explicitly approved, low-privilege project commands. It must never be represented as isolation from a malicious local executable or hostile repository.

## Admission contract

| Control | Requirement |
|---|---|
| Approval | `runConstrainedCommand` requires a project-scoped approved durable approval before a claim or process spawn. |
| Command identity | Exact allowlist only: `cat`, `echo`, `git`, `ls`, `node`, `npm`, `pnpm`, `pwd`. Shell commands, absolute paths, and aliases are not accepted by the gateway contract. |
| Arguments | Zod limits to 20 arguments and 500 characters each; shell metacharacters and known destructive patterns are blocked before process spawn. |
| Working directory | Project root only. The server Zod-validates an absolute `NEXUS_PROJECT_ROOT` parent and derives `<parent>/<projectId>`; the runner rejects a symlinked root alias. The runner never derives cwd from tool arguments. |
| Environment | On supported POSIX hosts, minimal environment: fixed system `PATH` (`/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`), project-root `HOME`, and `NO_COLOR=1`. Secrets and arbitrary parent environment variables are not forwarded. The fixed path prevents repository/parent-PATH hijack but does not prove executable provenance. |
| Process launch | `spawn` uses `shell: false`, ignored stdin, detached POSIX process group, and explicit stdout/stderr pipes. Windows execution is explicitly rejected pending a separately tested platform implementation. |
| Timeout | Request value must be 100–60,000 ms. On supported POSIX platforms, timeout terminates the process group. Windows has no supported constrained-command execution path at this time and is a release-platform block, not a silently degraded success. |
| Output | Combined stdout/stderr is capped at 1,000,000 bytes. Overflow terminates the process and returns an error. |
| Evidence | Every allow/deny outcome records a redacted receipt. Successful effects also complete the durable effect claim. |

## Threat model and control matrix

The runner protects a trusted local operator from accidental shell expansion, repository-level PATH injection, ambient-secret inheritance, unbounded process output, and orphaned POSIX child processes. It does **not** protect against a malicious administrator, a compromised executable in a system path, a hostile repository interpreted by an approved high-risk command, kernel escape, or network egress. Those are separate policy/deployment controls.

| Threat | Required control | Evidence required | Residual risk / release disposition |
|---|---|---|---|
| Shell/metacharacter injection | Gateway schema and injection checks before `spawn`; runner uses `shell: false` | Gateway negative tests and direct runner absolute-command rejection | A permitted `node`, `npm`, `pnpm`, or `git` invocation can still interpret approved repository content; risk remains high and approval-gated. |
| Parent/repository PATH hijack | Fixed POSIX system PATH, not inherited `PATH` | Test with a fake parent-PATH executable; real command must resolve to system path | The runner does not attest the binary in a system path; executable provenance remains outside this boundary. |
| Secret inheritance | Minimal environment only | Child process reads an injected parent secret and observes absence | Secrets supplied as command arguments are governed separately and must be redacted. |
| Symlink/cwd escape | Canonical project root; reject symlink root aliases; cwd never comes from tool arguments | Symlink-root and real project-root command tests | File arguments are controlled by the gateway path policy, not by this runner alone. |
| Output/resource exhaustion | Combined stdout/stderr byte cap and process-group termination | Output flood test | No cgroup CPU/memory enforcement; deployment policy is required for high-risk operations. |
| Timeout/orphan children | Detached POSIX process group and group kill | Nested-child marker test after timeout | Windows is unsupported pending a tested implementation. |
| Network-risk command | Risk classification and durable approval; runner does not isolate egress | Policy/approval integration and clean-machine review | No network isolation. High-risk `npm`, `pnpm`, `node`, and `git` remain release-blocking without deployment controls. |
| Crash after external effect | Durable scoped claim, receipt correlation, governed reconciliation | E10-S9–S11 real fault-injection evidence | Uncertain non-transactional effects must never replay automatically. |

## Effect and recovery contract

1. An approved effect obtains an atomic claim keyed by `(projectId, taskId, correlationId, operation)` immediately before process/file execution.
2. A second worker cannot obtain the same claim and must not repeat the side effect.
3. After a successful effect, the system records a receipt and marks the claim completed.
4. A crash after claim acquisition leaves `state=claimed`. It is **not replayed automatically**.
5. Administrators inspect stale claims through `GET /projects/:projectId/effects/recovery`; the response explicitly says reconciliation is required.
6. Automated recovery may requeue task orchestration only after it proves the external effect did not occur, or a human selects a governed reconciliation action with evidence. That action is pending E10-S10/E10-S11.

## Explicit non-goals and release constraints

- No CPU/memory cgroup enforcement currently exists; production deployment must provide OS/container policy before high-risk commands are enabled.
- The allowlist alone does not establish executable provenance. Fixed POSIX PATH blocks parent/repository PATH hijack but does not attest system executables; E10-S8 must retain PATH/executable-spoofing evidence.
- `npm`, `pnpm`, `node`, and `git` can execute repository-controlled code. They remain high-risk approved operations, not low-risk reads.
- Network egress is not independently isolated by this runner. Commands that can fetch remote content require separate policy and environment controls.

## Required adversarial proof before release

- shell injection and metacharacters;
- command aliases and PATH hijacking;
- inherited secret absence;
- timeout/process-tree cleanup;
- output exhaustion;
- symlink/path boundary failures;
- nonzero command exit behavior;
- concurrent effect claim behavior;
- crash after claim, after effect, after receipt, and after completion marker;
- POSIX behavior on a supported Linux runner; Windows execution must stay explicitly unsupported and release-blocking until a separately tested implementation replaces the fail-closed rejection.
