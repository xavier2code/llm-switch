import type { TargetConfig } from '@llm-switch/core/config.js';
import { getBackupPath } from '@llm-switch/core/config.js';
import { restoreBackup, isSameContent } from '@llm-switch/core/backup.js';
import { exists } from '@llm-switch/core/fs-utils.js';
import { NoBackupError } from '@llm-switch/core';
import { ProfileStore, defaultProfileStore } from '@llm-switch/core/store/profile-store.js';

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
    await store.clearActiveRecord(target);
    restored.push(`${target.displayName}: restored from backup.`);
  }

  for (const line of restored) io.stdout.write(`${line}\n`);
  for (const line of skipped) io.stdout.write(`${line}\n`);

  if (errors.length > 0) {
    throw new NoBackupError(errors.join('\n'));
  }
}
