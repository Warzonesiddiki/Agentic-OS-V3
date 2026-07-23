# R1 Governed Sandbox Security Contract

**Story:** E10-S6  
**Status:** Draft implementation contract — release-blocking until E10-S8 adversarial validation and E10-S29 clean-machine evidence complete.

## Security boundary

The runner is a bounded local process runner, **not** a VM, container, or OS security sandbox. It is suitable only for explicitly approved, low-privilege project commands. It must never be represented as isolation from a malicious local executable or hostile repository.

## Admission contract

| Control | Requirement |
|---|---|
| Approval | `runConstrainedCommand` requires a project-scoped approved durable approval before a claim or process spawn. |
| Command identity | Exact allowlist only: `cat`, `echo`, `git`, `ls`, `node`, `npm`, `pnpm`, `pwd`. Shell commands, absolute paths, and aliases are not accepted by the gateway contract. |
| Arguments | Zod limits to 20 arguments and 500 characters each; shell metacharacters and known destructive patterns are blocked before process spawn. |
| Working directory | Project root only. A symlinked root alias is rejected. The runner never derives cwd from tool arguments. |
| Environment | Minimal environment: `PATH`, project-root `HOME`, and `NO_COLOR=1`. Secrets and arbitrary parent environment variables are not forwarded. |
| Process launch | `spawn` uses `shell: false`, ignored stdin, hidden Windows process window, and explicit stdout/stderr pipes. |
| Timeout | Request value must be 100–60,000 ms. Timeout terminates the process group on supported POSIX platforms and the process tree via `taskkill` on Windows. |
| Output | Combined stdout/stderr is capped at 1,000,000 bytes. Overflow terminates the process and returns an error. |
| Evidence | Every allow/deny outcome records a redacted receipt. Successful effects also complete the durable effect claim. |

## Effect and recovery contract

1. An approved effect obtains an atomic claim keyed by `(projectId, taskId, correlationId, operation)` immediately before process/file execution.
2. A second worker cannot obtain the same claim and must not repeat the side effect.
3. After a successful effect, the system records a receipt and marks the claim completed.
4. A crash after claim acquisition leaves `state=claimed`. It is **not replayed automatically**.
5. Administrators inspect stale claims through `GET /projects/:projectId/effects/recovery`; the response explicitly says reconciliation is required.
6. Automated recovery may requeue task orchestration only after it proves the external effect did not occur, or a human selects a governed reconciliation action with evidence. That action is pending E10-S10/E10-S11.

## Explicit non-goals and release constraints

- No CPU/memory cgroup enforcement currently exists; production deployment must provide OS/container policy before high-risk commands are enabled.
- The allowlist alone does not establish executable provenance. E10-S8 must test PATH/executable spoofing and platform behavior.
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
- Linux and Windows platform behavior or a documented unsupported-platform release block.
