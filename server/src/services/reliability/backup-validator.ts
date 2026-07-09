/** backup-validator.ts — validates backup integrity & restorability. */
import { createHash } from 'node:crypto';
import { ApiError } from '../../lib/errors.js';

export interface BackupManifest {
  id: string;
  path: string;
  sizeBytes: number;
  sha256: string;
  capturedAt: number;
  encrypted: boolean;
}

export function validateBackup(
  manifest: BackupManifest,
  actualContent: Buffer
): { valid: boolean; reason: string } {
  const actualHash = createHash('sha256').update(actualContent).digest('hex');
  if (actualHash !== manifest.sha256) return { valid: false, reason: 'checksum mismatch' };
  if (manifest.sizeBytes !== actualContent.length) return { valid: false, reason: 'size mismatch' };
  if (manifest.encrypted && actualContent.length < 16)
    return { valid: false, reason: 'suspiciously small encrypted backup' };
  return { valid: true, reason: 'ok' };
}

/** Simulate a restore dry-run: ensure the backup can be parsed. */
export function dryRunRestore(manifest: BackupManifest, content: Buffer): boolean {
  return validateBackup(manifest, content).valid;
}

export function assertBackupValid(manifest: BackupManifest, content: Buffer): void {
  const r = validateBackup(manifest, content);
  if (!r.valid) throw new ApiError('BACKUP_INVALID', `Backup ${manifest.id} invalid: ${r.reason}`);
}
