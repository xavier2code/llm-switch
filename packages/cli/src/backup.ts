import fs from 'node:fs/promises';
import { NoBackupError } from './errors.js';

export async function backupCurrent(settingsPath: string, backupPath: string): Promise<void> {
  try {
    await fs.copyFile(settingsPath, backupPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw err;
  }
}

export async function restoreBackup(settingsPath: string, backupPath: string): Promise<void> {
  try {
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
  } catch {
    return false;
  }
}
