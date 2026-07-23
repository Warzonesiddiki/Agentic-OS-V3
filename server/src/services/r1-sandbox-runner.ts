import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface R1SandboxRunInput {
  readonly command: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly workingDirectory: string;
}

export interface R1SandboxRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

const ALLOWED_COMMANDS = new Set(['cat', 'echo', 'git', 'ls', 'node', 'npm', 'pnpm', 'pwd']);
const MAX_OUTPUT_BYTES = 1_000_000;

/**
 * Execute a deliberately small, shell-free command allowlist in a project root.
 * This is a bounded process runner, not a container/VM. Callers must treat its
 * explicit limits as part of their policy decision and never pass untrusted env.
 */
export async function runR1ConstrainedCommand(input: R1SandboxRunInput): Promise<R1SandboxRunResult> {
  if (!ALLOWED_COMMANDS.has(input.command)) {
    throw new Error(`Command not allowed in sandbox: ${input.command}`);
  }

  const root = await realpath(input.workingDirectory);
  const requested = resolve(input.workingDirectory);
  if (root !== requested) {
    throw new Error('Sandbox working directory must resolve without symlink traversal');
  }

  return new Promise<R1SandboxRunResult>((resolveResult, reject) => {
    const child = spawn(input.command, [...input.args], {
      cwd: root,
      detached: process.platform !== 'win32',
      env: { PATH: process.env.PATH ?? '', HOME: root, NO_COLOR: '1' },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let timedOut = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      fn();
    };

    const stop = (): void => {
      if (child.pid === undefined) return;
      if (process.platform === 'win32') {
        void import('node:child_process').then(({ execFile }) => {
          execFile('taskkill', ['/pid', String(child.pid), '/t', '/f']);
        });
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      }
    };

    const onData = (target: 'stdout' | 'stderr', chunk: Buffer): void => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        stop();
        return;
      }
      if (target === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };

    child.stdout.on('data', (chunk: Buffer) => onData('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => onData('stderr', chunk));
    child.once('error', (error: Error) => finish(() => reject(error)));
    child.once('close', (code: number | null, signal: NodeJS.Signals | null) => finish(() => {
      if (timedOut) {
        reject(new Error(`Sandbox command timed out after ${input.timeoutMs}ms`));
        return;
      }
      if (outputBytes > MAX_OUTPUT_BYTES) {
        reject(new Error(`Sandbox command exceeded ${MAX_OUTPUT_BYTES} output bytes`));
        return;
      }
      resolveResult({ stdout, stderr: signal ? `${stderr}\nterminated by ${signal}`.trim() : stderr, exitCode: code ?? 1 });
    }));

    timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, input.timeoutMs);
  });
}
