import fs from 'node:fs/promises';
import { atomicWrite, exists } from './fs-utils.js';
import { NoBackupError } from './errors.js';

export async function restoreBackup(activePath: string, backupPath: string): Promise<void> {
  if (!(await exists(backupPath))) {
    throw new NoBackupError(`No backup found at ${backupPath}.`);
  }

  const content = await fs.readFile(backupPath);
  await atomicWrite(activePath, content, { mode: 0o600, fsync: true });
  await fs.rm(backupPath, { force: true });
}

export async function isSameContent(a: string, b: string): Promise<boolean> {
  try {
    const [ca, cb] = await Promise.all([fs.readFile(a), fs.readFile(b)]);
    return ca.equals(cb);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}
