import { afterEach, describe, expect, it } from 'vitest';
import { access, chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { BoundedToolGateway, InMemoryR1Repositories } from '@agentic-os/sdk';
import { runR1ConstrainedCommand } from '../src/services/r1-sandbox-runner.js';

const executeFile = promisify(execFile);

const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'r1-sandbox-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('runR1ConstrainedCommand', () => {
  it('executes an allowlisted command without a shell', async () => {
    const workingDirectory = await temporaryDirectory();

    await expect(runR1ConstrainedCommand({
      command: 'echo', args: ['governed runner'], timeoutMs: 1_000, workingDirectory,
    })).resolves.toMatchObject({ stdout: 'governed runner\n', stderr: '', exitCode: 0 });
  });

  it('rejects a command outside the explicit allowlist before process creation', async () => {
    const workingDirectory = await temporaryDirectory();

    await expect(runR1ConstrainedCommand({
      command: 'sh', args: ['-c', 'echo unsafe'], timeoutMs: 1_000, workingDirectory,
    })).rejects.toThrow('Command not allowed in sandbox');
  });

  it('defensively rejects timeout and argument limits before process creation', async () => {
    const workingDirectory = await temporaryDirectory();

    await expect(runR1ConstrainedCommand({
      command: 'echo', args: [], timeoutMs: 99, workingDirectory,
    })).rejects.toThrow('Sandbox timeout must be an integer');
    await expect(runR1ConstrainedCommand({
      command: 'echo', args: Array.from({ length: 21 }, () => 'x'), timeoutMs: 1_000, workingDirectory,
    })).rejects.toThrow('Sandbox command accepts at most');
  });

  it('kills a timed-out process and reports a timeout rather than a successful result', async () => {
    const workingDirectory = await temporaryDirectory();

    await expect(runR1ConstrainedCommand({
      command: 'node', args: ['-e', 'setTimeout(() => {}, 5000)'], timeoutMs: 100, workingDirectory,
    })).rejects.toThrow('timed out');
  });

  it('preserves a nonzero exit result for the gateway to deny rather than simulating success', async () => {
    const workingDirectory = await temporaryDirectory();

    await expect(runR1ConstrainedCommand({
      command: 'node', args: ['-e', "process.stderr.write('intentional failure'); process.exit(7)"], timeoutMs: 1_000, workingDirectory,
    })).resolves.toMatchObject({ stderr: 'intentional failure', exitCode: 7 });
  });

  it('rejects a symlinked working-directory alias', async () => {
    const workingDirectory = await temporaryDirectory();
    const alias = `${workingDirectory}-alias`;
    await symlink(workingDirectory, alias);
    directories.push(alias);

    await expect(runR1ConstrainedCommand({
      command: 'pwd', args: [], timeoutMs: 1_000, workingDirectory: alias,
    })).rejects.toThrow('symlink traversal');
  });

  it('executes real project-root cat and git inspection commands', async () => {
    const workingDirectory = await temporaryDirectory();
    await writeFile(join(workingDirectory, 'package.json'), '{"name":"runner-fixture"}\n', 'utf8');
    await executeFile('git', ['init', '--quiet', workingDirectory]);

    await expect(runR1ConstrainedCommand({
      command: 'cat', args: ['package.json'], timeoutMs: 1_000, workingDirectory,
    })).resolves.toMatchObject({ stdout: '{"name":"runner-fixture"}\n', exitCode: 0 });
    await expect(runR1ConstrainedCommand({
      command: 'git', args: ['rev-parse', '--show-toplevel'], timeoutMs: 1_000, workingDirectory,
    })).resolves.toMatchObject({ stdout: `${workingDirectory}\n`, exitCode: 0 });
  });

  it('runs a real project-root command through approval, effect-claim, and receipt gateway composition', async () => {
    const workingDirectory = await temporaryDirectory();
    await writeFile(join(workingDirectory, 'package.json'), '{"name":"gateway-fixture"}\n', 'utf8');
    const repositories = new InMemoryR1Repositories();
    const projectId = randomUUID();
    const gateway = new BoundedToolGateway(repositories, {
      projectRoots: new Map([[projectId, workingDirectory]]),
      isApprovalApproved: async () => true,
      sandboxExecutor: async (command, args, timeoutMs, root) =>
        runR1ConstrainedCommand({ command, args, timeoutMs, workingDirectory: root }),
    });

    const result = await gateway.runConstrainedCommand({
      projectId,
      taskId: randomUUID(),
      command: 'cat',
      args: ['package.json'],
      approvalId: randomUUID(),
      timeoutMs: 1_000,
      correlationId: randomUUID(),
    });

    expect(result).toMatchObject({ ok: true, output: '{"name":"gateway-fixture"}\n' });
  });

  it('does not forward an ambient secret into a spawned command', async () => {
    const workingDirectory = await temporaryDirectory();
    const key = 'R1_SANDBOX_TEST_SECRET';
    const original = process.env[key];
    process.env[key] = 'must-not-reach-child';

    try {
      await expect(runR1ConstrainedCommand({
        command: 'node',
        args: ['-e', `process.stdout.write(process.env.${key} ?? 'absent')`],
        timeoutMs: 1_000,
        workingDirectory,
      })).resolves.toMatchObject({ stdout: 'absent', exitCode: 0 });
    } finally {
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });

  it('does not resolve an allowlisted command from a parent PATH hijack on supported POSIX platforms', async () => {
    const workingDirectory = await temporaryDirectory();
    if (process.platform === 'win32') {
      await expect(runR1ConstrainedCommand({
        command: 'echo', args: ['not-run'], timeoutMs: 1_000, workingDirectory,
      })).rejects.toThrow('Windows constrained-command execution is unsupported');
      return;
    }

    const hijackDirectory = join(workingDirectory, 'hijack-bin');
    await mkdir(hijackDirectory);
    const fakeEcho = join(hijackDirectory, 'echo');
    await writeFile(fakeEcho, '#!/bin/sh\nprintf hijacked\n', 'utf8');
    await chmod(fakeEcho, 0o755);
    const originalPath = process.env.PATH;
    process.env.PATH = hijackDirectory;

    try {
      await expect(runR1ConstrainedCommand({
        command: 'echo', args: ['trusted'], timeoutMs: 1_000, workingDirectory,
      })).resolves.toMatchObject({ stdout: 'trusted\n', exitCode: 0 });
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
    }
  });

  it('terminates a nested POSIX process tree after timeout or fails closed on Windows', async () => {
    const workingDirectory = await temporaryDirectory();
    if (process.platform === 'win32') {
      await expect(runR1ConstrainedCommand({
        command: 'node', args: ['-e', ''], timeoutMs: 1_000, workingDirectory,
      })).rejects.toThrow('Windows constrained-command execution is unsupported');
      return;
    }

    const marker = join(workingDirectory, 'orphan-marker.txt');
    const childProgram = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'orphan'), 400)`;
    const parentProgram = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childProgram)}]); setTimeout(() => {}, 5000)`;

    await expect(runR1ConstrainedCommand({
      command: 'node', args: ['-e', parentProgram], timeoutMs: 100, workingDirectory,
    })).rejects.toThrow('timed out');
    await new Promise<void>((resolve) => setTimeout(resolve, 700));
    await expect(access(marker)).rejects.toThrow();
  });

  it('caps combined command output and reports an error instead of returning a truncated success', async () => {
    const workingDirectory = await temporaryDirectory();

    await expect(runR1ConstrainedCommand({
      command: 'node', args: ['-e', "process.stdout.write('x'.repeat(1000001))"], timeoutMs: 5_000, workingDirectory,
    })).rejects.toThrow('exceeded 1000000 output bytes');
  });
});
