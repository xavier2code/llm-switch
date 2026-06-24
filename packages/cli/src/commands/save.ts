import fs from 'node:fs/promises';
import type { Readable, Writable } from 'node:stream';
import { confirm as inquirerConfirm } from '@inquirer/prompts';
import { getConfigDir, getSettingsPath, profilePath, assertAlias } from '../config.js';
import { listProfiles } from '../scanner.js';
import { promptAlias } from '../ui.js';
import { exists } from '../fs-utils.js';
import { NoCurrentSettingsError, UserCancelledError } from '../errors.js';
import { interactiveTtyRequiredHint } from '../messages.js';

export interface SaveIO {
  alias?: string;
  force?: boolean;
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  confirmFn?: typeof inquirerConfirm;
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
      throw new UserCancelledError(interactiveTtyRequiredHint('save'));
    }
    const profiles = await listProfiles(configDir);
    const result = await promptAlias(profiles.map((p) => p.alias));
    if (!result) throw new UserCancelledError('Cancelled.');
    alias = result;
  } else {
    assertAlias(alias);
  }

  const target = profilePath(alias);
  const existed = await exists(target);

  if (existed && !io.force) {
    if (!io.isTTY) {
      throw new UserCancelledError(
        `Profile '${alias}' already exists. Pass --force to overwrite, or run in a TTY.`,
      );
    }
    const confirmFn = io.confirmFn ?? inquirerConfirm;
    const overwrite = await confirmFn({
      message: `Profile '${alias}' exists. Overwrite?`,
      default: false,
    });
    if (!overwrite) throw new UserCancelledError('Cancelled.');
  }

  await fs.copyFile(settingsPath, target);
  await fs.chmod(target, 0o600);

  if (existed) {
    io.stderr.write(`Overwrote existing profile '${alias}'.\n`);
  }
  io.stdout.write(`Saved current settings as '${alias}'.\n`);
}
