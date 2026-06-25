import type { TargetConfig } from '../config.js';
import { getActiveConfigPath, getBackupPath } from '../config.js';
import { restoreBackup, isSameContent } from '../backup.js';
import { exists } from '../fs-utils.js';
import { NoBackupError, NoCurrentSettingsError } from '../errors.js';

export interface RestoreIO {
  target: TargetConfig;
  stdout: { write(s: string): unknown };
}

export async function run(io: RestoreIO): Promise<void> {
  const settingsPath = getActiveConfigPath(io.target);
  const backupPath = getBackupPath(io.target);

  if (!(await exists(backupPath))) {
    throw new NoBackupError(`No backup found at ${backupPath}.`);
  }
  if (!(await exists(settingsPath))) {
    throw new NoCurrentSettingsError(
      `No current ${io.target.activeConfigFileName} to restore at ${settingsPath}.`,
    );
  }
  if (await isSameContent(settingsPath, backupPath)) {
    io.stdout.write('Already at backup state. Nothing to do.\n');
    return;
  }

  await restoreBackup(settingsPath, backupPath);
  io.stdout.write('Restored from backup.\n');
}
