import fs from 'node:fs/promises';
import { NoBackupError } from './errors.js';

export async function restoreBackup(settingsPath: string, backupPath: string): Promise<void> {
  try {
    // fsync the backup file before renaming it into place, so the restored
    // active config is guaranteed to be on disk (best-effort).
    const fh = await fs.open(backupPath, 'r+');
    try {
      await fh.sync();
    } finally {
      await fh.close();
    }
    await fs.rename(backupPath, settingsPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NoBackupError(`No backup found at ${backupPath}.`);
    }
    throw err;
  }
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
