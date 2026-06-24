import type { Writable } from 'node:stream';
import {
  getConfigDir,
  getSettingsPath,
  getBackupPath,
  profilePath,
  assertAlias,
} from '../config.js';
import { listProfiles } from '../scanner.js';
import { switchTo } from '../switcher.js';
import { pickProfile } from '../ui.js';
import { ProfileNotFoundError, UserCancelledError } from '../errors.js';
import { RESTART_HINT, interactiveTtyRequiredHint } from '../messages.js';

export interface SwitchIO {
  alias?: string;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
}

export async function run(io: SwitchIO): Promise<void> {
  const configDir = getConfigDir();
  const settingsPath = getSettingsPath();
  const backupPath = getBackupPath();

  if (io.alias !== undefined) {
    assertAlias(io.alias);
    const source = profilePath(io.alias);
    const profiles = await listProfiles(configDir);
    if (!profiles.find((p) => p.alias === io.alias)) {
      throw new ProfileNotFoundError(
        `Profile '${io.alias}' not found. Run 'llm-switch list' to see available profiles.`,
      );
    }
    await switchTo(source, settingsPath, backupPath);
    io.stdout.write(`Switched to ${io.alias}. ${RESTART_HINT}\n`);
    return;
  }

  if (!io.isTTY) {
    throw new UserCancelledError(interactiveTtyRequiredHint('switch'));
  }

  const profiles = await listProfiles(configDir);
  const chosen = await pickProfile(profiles);
  if (!chosen) {
    throw new UserCancelledError('Cancelled.');
  }
  await switchTo(chosen.path, settingsPath, backupPath);
  io.stdout.write(`Switched to ${chosen.alias}. ${RESTART_HINT}\n`);
}
