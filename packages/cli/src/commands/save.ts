import fs from 'node:fs/promises';
import type { Readable, Writable } from 'node:stream';
import { getConfigDir, getSettingsPath, profilePath, assertAlias } from '../config.js';
import { listProfiles } from '../scanner.js';
import { promptAlias } from '../ui.js';
import { exists } from '../fs-utils.js';
import { NoCurrentSettingsError, UserCancelledError } from '../errors.js';

export interface SaveIO {
  alias?: string;
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
}

export async function run(io: SaveIO): Promise<void> {
  const configDir = getConfigDir();
  const settingsPath = getSettingsPath();

  if (!(await exists(settingsPath))) {
    throw new NoCurrentSettingsError(
      `No current settings.json at ${settingsPath}. Nothing to save.`,
    );
  }

  let alias = io.alias;
  if (alias === undefined) {
    if (!io.isTTY) {
      throw new UserCancelledError(
        'Interactive mode requires a TTY. Use: llm-switch save <alias>',
      );
    }
    const profiles = await listProfiles(configDir);
    const result = await promptAlias(profiles.map((p) => p.alias), {
      input: io.stdin,
      output: io.stdout,
    });
    if (!result) throw new UserCancelledError('Cancelled.');
    alias = result;
  } else {
    assertAlias(alias);
  }

  const target = profilePath(alias);
  const existed = await exists(target);
  await fs.copyFile(settingsPath, target);
  await fs.chmod(target, 0o600);

  if (existed) {
    io.stderr.write(`Overwrote existing profile '${alias}'.\n`);
  }
  io.stdout.write(`Saved current settings as '${alias}'.\n`);
}