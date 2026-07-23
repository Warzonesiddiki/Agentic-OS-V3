# Story E4-S3 — Bounded native tool gateway

**Epic:** E4
**Priority:** P0
**Estimate:** 8
**Status:** done
**Sprint:** sprint-4

## Acceptance criteria
- [x] Read-file tool enforces project-root/path allowlist.
- [x] Write-file tool requires approval and records a receipt.
- [x] Constrained-command tool runs only in the selected sandbox with timeout and resource limits.
- [x] Tool inputs and outputs are schema-validated and redacted where needed.
- [x] Network, credentials, path traversal, and command injection tests fail closed.
- [x] Every attempt is linked to task step, approval, receipt, audit, and trace IDs.

## Implementation
- SDK `BoundedToolGateway` with Zod schemas for read, write, constrained-command.
- `resolvePath` enforces disallowed patterns (.., /etc/, /root/, ~/.ssh, .env, credentials, secrets) and requires path inside project root (default /tmp/projects/<id> or injected map).
- Write-file requires `isApprovalApproved` callback; denied if not approved, records receipt deny.
- Constrained-command: injection detection via `;[&|$` and disallowed list (rm -rf, mkfs, shutdown, fork bomb, curl|sh), sandboxExecutor injected with allowed list ls, cat, echo, npm, pnpm, node, git, pwd and timeout; disallowed commands blocked.
- Redaction: secret keys redacted in receipt payload, content hash not raw content.
- Receipt linking: every attempt records ActionReceipt with projectId, correlationId, kind (tool_call/file_write), actor, decision, payload containing taskId, approvalId, operation, exitCode, lengths, contentHash.
- Routes: POST /tool/read, /tool/write, /tool/exec delegate to gateway, record telemetry tool span and failure metric.
- Frontend: Task detail shows tool attempts via evidence timeline, no raw secrets exposed.

## Evidence
- packages/sdk/src/r1-tool-gateway.ts
- server/src/services/r1-extended-runtime.ts (sandboxExecutor mock + fs reader/writer)
- server/src/routes/r1-extended.ts
- server/tests/r1-security-isolation.test.ts (path traversal, command injection blocked)

## Validation
- Security suite: traversal, injection, disallowed commands all deny with receipt.
