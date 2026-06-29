import type { TargetConfig } from '../config.js';
import { getBackupPath } from '../config.js';
import { restoreBackup, isSameContent } from '../backup.js';
import { exists } from '../fs-utils.js';
import { NoBackupError } from '../errors.js';
import { ProfileStore, defaultProfileStore } from '../store/profile-store.js';

export interface RestoreIO {
  targets: TargetConfig[];
  stdout: { write(s: string): unknown };
  store?: ProfileStore;
}

export async function run(io: RestoreIO): Promise<void> {
  const store = io.store ?? defaultProfileStore();
  const errors: string[] = [];
  const restored: string[] = [];
  const skipped: string[] = [];

  for (const target of io.targets) {
    const settingsPath = store.adapter(target).activePath();
    const backupPath = getBackupPath(target);

    if (!(await exists(backupPath))) {
      errors.push(`No backup found at ${backupPath}.`);
      continue;
    }
    if (!(await exists(settingsPath))) {
      errors.push(`No current ${target.activeConfigFileName} to restore at ${settingsPath}.`);
      continue;
    }
    if (await isSameContent(settingsPath, backupPath)) {
      skipped.push(`${target.displayName}: already at backup state.`);
      continue;
    }

    await restoreBackup(settingsPath, backupPath);
    restored.push(`${target.displayName}: restored from backup.`);
  }

  for (const line of restored) io.stdout.write(`${line}\n`);
  for (const line of skipped) io.stdout.write(`${line}\n`);

  if (errors.length > 0) {
    throw new NoBackupError(errors.join('\n'));
  }
}
