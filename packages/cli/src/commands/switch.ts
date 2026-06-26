import type { Writable } from 'node:stream';
import type { TargetConfig } from '../config.js';
import { getActiveConfigPath, getBackupPath, profilePath, assertAlias } from '../config.js';
import { listProfiles } from '../scanner.js';
import { switchTo } from '../switcher.js';
import { pickProfile } from '../ui.js';
import { ProfileNotFoundError, UserCancelledError } from '../errors.js';
import { restartHint, interactiveTtyRequiredHint } from '../messages.js';

export interface SwitchIO {
  target: TargetConfig;
  alias?: string;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
}

export async function run(io: SwitchIO): Promise<void> {
  const settingsPath = getActiveConfigPath(io.target);
  const backupPath = getBackupPath(io.target);

  if (io.alias !== undefined) {
    assertAlias(io.alias);
    const source = profilePath(io.alias, io.target);
    const profiles = await listProfiles(io.target);
    if (!profiles.find((p) => p.alias === io.alias)) {
      throw new ProfileNotFoundError(
        `Profile '${io.alias}' not found. Run 'sw list' to see available profiles.`,
      );
    }
    await switchTo(source, settingsPath, backupPath);
    io.stdout.write(`Switched to ${io.alias}. ${restartHint(io.target)}\n`);
    return;
  }

  if (!io.isTTY) {
    throw new UserCancelledError(interactiveTtyRequiredHint('switch'));
  }

  const profiles = await listProfiles(io.target);
  const chosen = await pickProfile(profiles);
  if (!chosen) {
    throw new UserCancelledError('Cancelled.');
  }
  await switchTo(chosen.path, settingsPath, backupPath);
  io.stdout.write(`Switched to ${chosen.alias}. ${restartHint(io.target)}\n`);
}
