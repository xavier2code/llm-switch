import type { Readable, Writable } from 'node:stream';
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
import {
  ProfileNotFoundError,
  UserCancelledError,
} from '../errors.js';

export interface SwitchIO {
  alias?: string;
  stdin: Readable;
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
    io.stdout.write(`Switched to ${io.alias}. Restart Claude Code to apply.\n`);
    return;
  }

  if (!io.isTTY) {
    throw new UserCancelledError(
      'Interactive mode requires a TTY. Use: llm-switch <alias>',
    );
  }

  const profiles = await listProfiles(configDir);
  const chosen = await pickProfile(profiles, { input: io.stdin, output: io.stdout });
  if (!chosen) {
    throw new UserCancelledError('Cancelled.');
  }
  await switchTo(chosen.path, settingsPath, backupPath);
  io.stdout.write(`Switched to ${chosen.alias}. Restart Claude Code to apply.\n`);
}