import type { TargetConfig } from '@xavier2code/llm-switch-core/config.js';
import { getBackupPath } from '@xavier2code/llm-switch-core/config.js';
import { restoreBackup, isSameContent } from '@xavier2code/llm-switch-core/backup.js';
import { exists } from '@xavier2code/llm-switch-core/fs-utils.js';
import { NoBackupError } from '@xavier2code/llm-switch-core';
import {
  ProfileStore,
  defaultProfileStore,
} from '@xavier2code/llm-switch-core/store/profile-store.js';

export interface RestoreIO {
  targets: TargetConfig[];
  stdout: { write(s: string): unknown };
  store?: ProfileStore;
}

export async function run(io: RestoreIO): Promise<void> {
  const store = io.store ?? defaultProfileStore();

  const results = await Promise.all(
    io.targets.map(async (target) => {
      const settingsPath = store.adapter(target).activePath();
      const backupPath = getBackupPath(target);

      if (!(await exists(backupPath))) {
        return { kind: 'error' as const, message: `No backup found at ${backupPath}.` };
      }
      if (!(await exists(settingsPath))) {
        return {
          kind: 'error' as const,
          message: `No current ${target.activeConfigFileName} to restore at ${settingsPath}.`,
        };
      }
      if (await isSameContent(settingsPath, backupPath)) {
        return {
          kind: 'skipped' as const,
          message: `${target.displayName}: already at backup state.`,
        };
      }

      await restoreBackup(settingsPath, backupPath);
      await store.clearActiveRecord(target);
      return { kind: 'restored' as const, message: `${target.displayName}: restored from backup.` };
    }),
  );

  const errors: string[] = [];
  const restored: string[] = [];
  const skipped: string[] = [];

  for (const result of results) {
    if (result.kind === 'error') errors.push(result.message);
    else if (result.kind === 'restored') restored.push(result.message);
    else skipped.push(result.message);
  }

  for (const line of restored) io.stdout.write(`${line}\n`);
  for (const line of skipped) io.stdout.write(`${line}\n`);

  if (errors.length > 0) {
    throw new NoBackupError(errors.join('\n'));
  }
}
