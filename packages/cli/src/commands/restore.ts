import fs from 'node:fs/promises';
import { getSettingsPath, getBackupPath } from '../config.js';
import { restoreBackup, isSameContent } from '../backup.js';
import { NoBackupError, NoCurrentSettingsError } from '../errors.js';

export interface RestoreIO {
  stdout: { write(s: string): unknown };
}

export async function run(io: RestoreIO): Promise<void> {
  const settingsPath = getSettingsPath();
  const backupPath = getBackupPath();

  if (!(await exists(backupPath))) {
    throw new NoBackupError(`No backup found at ${backupPath}.`);
  }
  if (!(await exists(settingsPath))) {
    throw new NoCurrentSettingsError(
      `No current settings.json to restore at ${settingsPath}.`,
    );
  }
  if (await isSameContent(settingsPath, backupPath)) {
    io.stdout.write('Already at backup state. Nothing to do.\n');
    return;
  }

  await restoreBackup(settingsPath, backupPath);
  io.stdout.write('Restored from backup.\n');
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}