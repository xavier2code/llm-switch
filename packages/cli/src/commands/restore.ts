import type { TargetConfig } from '../config.js';
import { getBackupPath } from '../config.js';
import { restoreBackup, isSameContent } from '../backup.js';
import { exists } from '../fs-utils.js';
import { NoBackupError, NoCurrentSettingsError } from '../errors.js';
import { ProfileStore, defaultProfileStore } from '../store/profile-store.js';

export interface RestoreIO {
  targets: TargetConfig[];
  stdout: { write(s: string): unknown };
  store?: ProfileStore;
}

export async function run(io: RestoreIO): Promise<void> {
  const store = io.store ?? defaultProfileStore();

  for (const target of io.targets) {
    const settingsPath = store.adapter(target).activePath();
    const backupPath = getBackupPath(target);

    if (!(await exists(backupPath))) {
      throw new NoBackupError(`No backup found at ${backupPath}.`);
    }
    if (!(await exists(settingsPath))) {
      throw new NoCurrentSettingsError(
        `No current ${target.activeConfigFileName} to restore at ${settingsPath}.`,
      );
    }
    if (await isSameContent(settingsPath, backupPath)) {
      io.stdout.write(`${target.displayName}: already at backup state.\n`);
      continue;
    }

    await restoreBackup(settingsPath, backupPath);
    io.stdout.write(`${target.displayName}: restored from backup.\n`);
  }
}
