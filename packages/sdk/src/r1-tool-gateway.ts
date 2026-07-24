/**
 * E4-S3 Bounded native tool gateway
 * - read-file enforces project-root/path allowlist
 * - write-file requires approval and receipt
 * - constrained-command runs only through the configured bounded process runner with timeout and output limits
 * - inputs/outputs schema-validated and redacted where needed
 * - network, credentials, path traversal, command injection tests fail closed
 */

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { R1Repositories } from './repositories.js';
import type { ActionReceipt } from './r1-types.js';
import { InMemoryEffectClaimStore, type EffectClaimStore } from './r1-effect-claims.js';

export const ReadFileInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  path: z.string().min(1).max(1000),
  correlationId: z.string().uuid().optional(),
});
export type ReadFileInput = z.infer<typeof ReadFileInputSchema>;

export const WriteFileInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  path: z.string().min(1).max(1000),
  content: z.string().max(1_000_000),
  approvalId: z.string().uuid(),
  correlationId: z.string().uuid().optional(),
});
export type WriteFileInput = z.infer<typeof WriteFileInputSchema>;

export const ConstrainedCommandInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  command: z.string().min(1).max(500),
  args: z.array(z.string().max(500)).max(20).default([]),
  approvalId: z.string().uuid(),
  timeoutMs: z.number().int().min(100).max(60_000).default(5000),
  correlationId: z.string().uuid().optional(),
});
export type ConstrainedCommandInput = z.infer<typeof ConstrainedCommandInputSchema>;

export const ALLOWED_CONSTRAINED_COMMANDS = [
  'cat',
  'echo',
  'git',
  'ls',
  'node',
  'npm',
  'pnpm',
  'pwd',
] as const;

const allowedConstrainedCommandSet = new Set<string>(ALLOWED_CONSTRAINED_COMMANDS);
const localReadOnlyGitCommands = new Set(['rev-parse', 'status']);

export interface ConstrainedCommandRisk {
  readonly level: 'low' | 'high';
  readonly networkCapable: boolean;
  readonly repositoryCodeExecution: boolean;
  readonly reason: string;
}

export interface HighRiskCommandAuthorizationRequest {
  readonly projectId: string;
  readonly taskId: string;
  readonly approvalId: string;
  readonly correlationId: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly risk: ConstrainedCommandRisk;
}

/**
 * Static admission classification, not network isolation. Commands classified as
 * high risk require a separate deployment-policy decision in addition to durable
 * user approval. The bounded runner cannot prevent an authorized process from
 * opening sockets.
 */
export function classifyConstrainedCommandRisk(
  command: string,
  args: readonly string[],
): ConstrainedCommandRisk {
  if (command === 'node' || command === 'npm' || command === 'pnpm') {
    return {
      level: 'high',
      networkCapable: true,
      repositoryCodeExecution: true,
      reason: `${command} can execute repository-controlled code and open network connections`,
    };
  }
  if (command === 'git' && !localReadOnlyGitCommands.has(args[0] ?? '')) {
    return {
      level: 'high',
      networkCapable: true,
      repositoryCodeExecution: true,
      reason: 'git operation is outside the local read-only subcommand policy',
    };
  }
  return {
    level: 'low',
    networkCapable: false,
    repositoryCodeExecution: false,
    reason: command === 'git' ? 'local read-only git inspection' : 'bounded local inspection command',
  };
}

export type ToolResult = { ok: true; output: string; receiptId: string } | { ok: false; error: string; receiptId: string };

export interface ToolGatewayOptions {
  readonly now?: () => string;
  readonly projectRoots?: Map<string, string>; // projectId -> allowed root path
  /** Trusted runtime configuration; request data can never select this parent directory. */
  readonly projectRootBase?: string;
  readonly isApprovalApproved?: (approvalId: string, projectId: string) => Promise<boolean>;
  /**
   * Separate deployment-policy decision for network-capable or repository-code
   * execution. Durable user approval alone is insufficient. This callback does
   * not provide network isolation; callers must enforce the documented host policy.
   */
  readonly authorizeHighRiskCommand?: (request: HighRiskCommandAuthorizationRequest) => Promise<boolean>;
  readonly sandboxExecutor?: (command: string, args: string[], timeoutMs: number, workingDirectory: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  readonly fileReader?: (fullPath: string) => Promise<string>;
  readonly fileWriter?: (fullPath: string, content: string) => Promise<void>;
  readonly effectClaims?: EffectClaimStore;
}

const DISALLOWED_PATH_PATTERNS = [
  /\.\./, // path traversal
  /^\/etc\//,
  /^\/root\//,
  /^\~\/\.ssh/,
  /\.env/i,
  /credentials/i,
  /secrets/i,
];

const DISALLOWED_COMMANDS = [
  /rm\s+-rf/i,
  /mkfs/i,
  /shutdown/i,
  /reboot/i,
  />\/dev\/sda/i,
  /curl.*\|\s*sh/i,
  /wget.*\|\s*sh/i,
  /:\(\)\{\s*:\|\:&\s*\};:/, // fork bomb
];

const SECRET_KEY_PATTERN = /password|secret|token|api[_-]?key|authorization|credential|private[_-]?key/i;

function isPathTraversal(attempt: string): boolean {
  return DISALLOWED_PATH_PATTERNS.some((re) => re.test(attempt));
}

function isCommandInjection(attempt: string): boolean {
  // Basic injection detection: ;, &&, ||, $(), backticks when not expected
  const injection = /[;&|`$]/;
  // Allow args separately validated, but command itself should be simple
  return injection.test(attempt);
}

function redactContent(content: string): string {
  // Redact secret-like lines but keep rest for receipt payload metadata only (not content)
  if (SECRET_KEY_PATTERN.test(content)) return '[REDACTED_SECRET]';
  return content.slice(0, 500); // truncate for receipt
}

export class BoundedToolGateway {
  private readonly now: () => string;
  private readonly projectRoots: Map<string, string>;
  private readonly projectRootBase: string;
  private readonly isApprovalApproved: (id: string, projectId: string) => Promise<boolean>;
  private readonly authorizeHighRiskCommand: NonNullable<ToolGatewayOptions['authorizeHighRiskCommand']>;
  private readonly sandboxExecutor: NonNullable<ToolGatewayOptions['sandboxExecutor']>;
  private readonly fileReader: NonNullable<ToolGatewayOptions['fileReader']>;
  private readonly fileWriter: NonNullable<ToolGatewayOptions['fileWriter']>;
  private readonly effectClaims: EffectClaimStore;

  constructor(private readonly repos: R1Repositories, options: ToolGatewayOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.projectRoots = options.projectRoots ?? new Map();
    this.projectRootBase = options.projectRootBase ?? '/tmp/projects';
    this.isApprovalApproved = options.isApprovalApproved ?? (async () => false);
    this.authorizeHighRiskCommand = options.authorizeHighRiskCommand ?? (async () => false);
    this.sandboxExecutor = options.sandboxExecutor ?? (async () => {
      throw new Error('Constrained process executor is not configured');
    });
    this.fileReader = (options.fileReader ?? (async () => { throw new Error('fileReader not configured'); })) as NonNullable<ToolGatewayOptions['fileReader']>;
    this.fileWriter = (options.fileWriter ?? (async () => { throw new Error('fileWriter not configured'); })) as NonNullable<ToolGatewayOptions['fileWriter']>;
    this.effectClaims = options.effectClaims ?? new InMemoryEffectClaimStore();
  }

  private resolvePath(projectId: string, requestedPath: string): string {
    if (isPathTraversal(requestedPath)) throw new Error('Path traversal or disallowed path');
    const root = this.projectRoots.get(projectId) ?? `${this.projectRootBase}/${projectId}`;
    // Enforce allowlist: requested must be inside root
    // Simplified check: must not start with / if root is absolute and requested is absolute outside
    // Normalize: if requested starts with '/', it must start with root
    if (requestedPath.startsWith('/')) {
      if (!requestedPath.startsWith(root)) throw new Error('Path outside project root');
      return requestedPath;
    }
    if (requestedPath === '.') return root;
    // relative path: join with root but still check traversal already done
    return `${root}/${requestedPath}`.replace(/\/+/g, '/');
  }

  private async claimEffect(
    projectId: string,
    taskId: string,
    correlationId: string,
    operation: string,
  ): Promise<ToolResult | null> {
    const result = await this.effectClaims.claim({ projectId, taskId, correlationId, operation, createdAt: this.now() });
    if (result.acquired) return null;
    if (result.claim.state === 'completed') {
      const completed = await this.findCompletedEffect(projectId, taskId, correlationId, operation);
      return completed ?? { ok: false, error: `Completed ${operation} claim has no receipt; manual reconciliation required.`, receiptId: correlationId };
    }
    return { ok: false, error: `${operation} is already claimed by another worker; no side effect was repeated.`, receiptId: correlationId };
  }

  private async completeEffect(projectId: string, taskId: string, correlationId: string, operation: string): Promise<void> {
    await this.effectClaims.complete({ projectId, taskId, correlationId, operation, completedAt: this.now() });
  }

  private async findCompletedEffect(
    projectId: string,
    taskId: string,
    correlationId: string,
    operation: string,
  ): Promise<ToolResult | null> {
    const receipts = await this.repos.receipts.listForTask(projectId, taskId);
    const existing = receipts.find((receipt) =>
      receipt.correlationId === correlationId && receipt.payload.operation === operation,
    );
    if (!existing) return null;
    if (existing.decision === 'allow') {
      return { ok: true, output: `Previously completed ${operation}; no side effect was repeated.`, receiptId: existing.id };
    }
    return { ok: false, error: `Previous ${operation} attempt was denied; no side effect was repeated.`, receiptId: existing.id };
  }

  private async recordReceipt(input: { projectId: string; correlationId: string; kind: ActionReceipt['kind']; actor: string; decision: ActionReceipt['decision']; payload: Record<string, unknown> }): Promise<ActionReceipt> {
    const receipt: ActionReceipt = {
      id: randomUUID(),
      projectId: input.projectId,
      correlationId: input.correlationId,
      kind: input.kind,
      actor: input.actor,
      decision: input.decision,
      payload: input.payload,
      createdAt: this.now(),
    };
    return this.repos.receipts.append(receipt);
  }

  async readFile(inputRaw: unknown, actorId = 'tool-gateway'): Promise<ToolResult> {
    const input = ReadFileInputSchema.parse(inputRaw);
    const correlationId = input.correlationId ?? randomUUID();
    try {
      const fullPath = this.resolvePath(input.projectId, input.path);
      // Schema validation done, now attempt read
      const content = await this.fileReader(fullPath);
      const receipt = await this.recordReceipt({
        projectId: input.projectId,
        correlationId,
        kind: 'tool_call',
        actor: actorId,
        decision: 'allow',
        payload: { operation: 'read-file', path: input.path, taskId: input.taskId, contentLength: content.length },
      });
      return { ok: true, output: content, receiptId: receipt.id };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const receipt = await this.recordReceipt({
        projectId: input.projectId,
        correlationId,
        kind: 'tool_call',
        actor: actorId,
        decision: 'deny',
        payload: { operation: 'read-file', path: input.path, error: redactContent(errMsg) },
      });
      return { ok: false, error: errMsg, receiptId: receipt.id };
    }
  }

  async writeFile(inputRaw: unknown, actorId = 'tool-gateway'): Promise<ToolResult> {
    const input = WriteFileInputSchema.parse(inputRaw);
    const correlationId = input.correlationId ?? randomUUID();
    const previous = await this.findCompletedEffect(input.projectId, input.taskId, correlationId, 'write-file');
    if (previous) return previous;
    // Require approval
    const approved = await this.isApprovalApproved(input.approvalId, input.projectId);
    if (!approved) {
      const receipt = await this.recordReceipt({
        projectId: input.projectId,
        correlationId,
        kind: 'file_write',
        actor: actorId,
        decision: 'deny',
        payload: { operation: 'write-file', path: input.path, taskId: input.taskId, approvalId: input.approvalId, reason: 'approval not approved' },
      });
      return { ok: false, error: 'Write requires approved approval', receiptId: receipt.id };
    }
    const claimBlocked = await this.claimEffect(input.projectId, input.taskId, correlationId, 'write-file');
    if (claimBlocked) return claimBlocked;
    try {
      const fullPath = this.resolvePath(input.projectId, input.path);
      if (isPathTraversal(fullPath)) throw new Error('Path traversal disallowed');

      await this.fileWriter(fullPath, input.content);
      const receipt = await this.recordReceipt({
        projectId: input.projectId,
        correlationId,
        kind: 'file_write',
        actor: actorId,
        decision: 'allow',
        payload: { operation: 'write-file', path: input.path, taskId: input.taskId, approvalId: input.approvalId, contentHash: this.hashContent(input.content) },
      });
      await this.completeEffect(input.projectId, input.taskId, correlationId, 'write-file');
      return { ok: true, output: `wrote ${input.content.length} bytes to ${input.path}`, receiptId: receipt.id };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const receipt = await this.recordReceipt({
        projectId: input.projectId,
        correlationId,
        kind: 'file_write',
        actor: actorId,
        decision: 'deny',
        payload: { operation: 'write-file', path: input.path, taskId: input.taskId, error: redactContent(errMsg) },
      });
      return { ok: false, error: errMsg, receiptId: receipt.id };
    }
  }

  async runConstrainedCommand(inputRaw: unknown, actorId = 'tool-gateway'): Promise<ToolResult> {
    const input = ConstrainedCommandInputSchema.parse(inputRaw);
    const correlationId = input.correlationId ?? randomUUID();
    const previous = await this.findCompletedEffect(input.projectId, input.taskId, correlationId, 'constrained-command');
    if (previous) return previous;

    // Durable user approval is required for every command.
    const approved = await this.isApprovalApproved(input.approvalId, input.projectId);
    if (!approved) {
      const receipt = await this.recordReceipt({
        projectId: input.projectId,
        correlationId,
        kind: 'tool_call',
        actor: actorId,
        decision: 'deny',
        payload: { operation: 'constrained-command', command: input.command, taskId: input.taskId, reason: 'approval not approved' },
      });
      return { ok: false, error: 'Command requires approved approval', receiptId: receipt.id };
    }
    // Validate command against injection and disallowed list
    if (isCommandInjection(input.command) || input.args.some(isCommandInjection)) {
      const receipt = await this.recordReceipt({
        projectId: input.projectId,
        correlationId,
        kind: 'tool_call',
        actor: actorId,
        decision: 'deny',
        payload: { operation: 'constrained-command', command: input.command, reason: 'command injection detected' },
      });
      return { ok: false, error: 'Command injection detected, blocked', receiptId: receipt.id };
    }
    if (DISALLOWED_COMMANDS.some((re) => re.test(input.command) || input.args.some((a) => re.test(a)))) {
      const receipt = await this.recordReceipt({
        projectId: input.projectId,
        correlationId,
        kind: 'tool_call',
        actor: actorId,
        decision: 'deny',
        payload: { operation: 'constrained-command', command: input.command, reason: 'disallowed command' },
      });
      return { ok: false, error: 'Disallowed command blocked', receiptId: receipt.id };
    }
    if (!allowedConstrainedCommandSet.has(input.command)) {
      const receipt = await this.recordReceipt({
        projectId: input.projectId,
        correlationId,
        kind: 'tool_call',
        actor: actorId,
        decision: 'deny',
        payload: {
          operation: 'constrained-command',
          command: input.command,
          taskId: input.taskId,
          reason: 'command not in exact allowlist',
        },
      });
      return { ok: false, error: 'Command is not in the exact allowlist', receiptId: receipt.id };
    }

    const risk = classifyConstrainedCommandRisk(input.command, input.args);
    if (
      risk.level === 'high' &&
      !(await this.authorizeHighRiskCommand({
        projectId: input.projectId,
        taskId: input.taskId,
        approvalId: input.approvalId,
        correlationId,
        command: input.command,
        args: input.args,
        risk,
      }))
    ) {
      const receipt = await this.recordReceipt({
        projectId: input.projectId,
        correlationId,
        kind: 'tool_call',
        actor: actorId,
        decision: 'deny',
        payload: {
          operation: 'constrained-command',
          command: input.command,
          taskId: input.taskId,
          riskLevel: risk.level,
          networkCapable: risk.networkCapable,
          repositoryCodeExecution: risk.repositoryCodeExecution,
          reason: 'separate high-risk deployment policy denied command',
        },
      });
      return {
        ok: false,
        error: 'High-risk command requires separate deployment-policy authorization',
        receiptId: receipt.id,
      };
    }

    const claimBlocked = await this.claimEffect(input.projectId, input.taskId, correlationId, 'constrained-command');
    if (claimBlocked) return claimBlocked;

    try {
      const workingDirectory = this.resolvePath(input.projectId, '.');
      const result = await this.sandboxExecutor(input.command, input.args, input.timeoutMs, workingDirectory);
      const receipt = await this.recordReceipt({
        projectId: input.projectId,
        correlationId,
        kind: 'tool_call',
        actor: actorId,
        decision: 'allow',
        payload: {
          operation: 'constrained-command',
          command: input.command,
          taskId: input.taskId,
          approvalId: input.approvalId,
          exitCode: result.exitCode,
          stdoutLength: result.stdout.length,
          stderrLength: result.stderr.length,
        },
      });
      if (result.exitCode !== 0) {
        return { ok: false, error: result.stderr || `exit ${result.exitCode}`, receiptId: receipt.id };
      }
      await this.completeEffect(input.projectId, input.taskId, correlationId, 'constrained-command');
      return { ok: true, output: result.stdout, receiptId: receipt.id };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const receipt = await this.recordReceipt({
        projectId: input.projectId,
        correlationId,
        kind: 'tool_call',
        actor: actorId,
        decision: 'deny',
        payload: { operation: 'constrained-command', command: input.command, error: redactContent(errMsg) },
      });
      return { ok: false, error: errMsg, receiptId: receipt.id };
    }
  }

  private hashContent(content: string): string {
    // simple hash for receipt without exposing content
    let hash = 0;
    for (let i = 0; i < content.length; i++) hash = (hash * 31 + content.charCodeAt(i)) >>> 0;
    return hash.toString(16);
  }
}
