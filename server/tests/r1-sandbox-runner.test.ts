import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runR1ConstrainedCommand } from '../src/services/r1-sandbox-runner.js';

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

  it('kills a timed-out process and reports a timeout rather than a successful result', async () => {
    const workingDirectory = await temporaryDirectory();

    await expect(runR1ConstrainedCommand({
      command: 'node', args: ['-e', 'setTimeout(() => {}, 5000)'], timeoutMs: 100, workingDirectory,
    })).rejects.toThrow('timed out');
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
});
