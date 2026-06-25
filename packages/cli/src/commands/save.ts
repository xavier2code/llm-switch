import fs from 'node:fs/promises';
import type { Writable } from 'node:stream';
import { confirm as inquirerConfirm } from '@inquirer/prompts';
import type { TargetConfig } from '../config.js';
import { getActiveConfigPath, profilePath, assertAlias } from '../config.js';
import { listProfiles } from '../scanner.js';
import { promptAlias } from '../ui.js';
import { exists } from '../fs-utils.js';
import { NoCurrentSettingsError, UserCancelledError } from '../errors.js';
import { interactiveTtyRequiredHint } from '../messages.js';

export interface SaveIO {
  target: TargetConfig;
  alias?: string;
  force?: boolean;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  confirmFn?: typeof inquirerConfirm;
}

export async function run(io: SaveIO): Promise<void> {
  const settingsPath = getActiveConfigPath(io.target);

  if (!(await exists(settingsPath))) {
    throw new NoCurrentSettingsError(
      `No current ${io.target.activeConfigFileName} at ${settingsPath}. Nothing to save.`,
    );
  }

  let alias = io.alias;
  if (alias === undefined) {
    if (!io.isTTY) {
      throw new UserCancelledError(interactiveTtyRequiredHint('save'));
    }
    const profiles = await listProfiles(io.target);
    const result = await promptAlias(profiles.map((p) => p.alias));
    if (!result) throw new UserCancelledError('Cancelled.');
    alias = result;
  } else {
    assertAlias(alias);
  }

  const targetPath = profilePath(alias, io.target);
  const existed = await exists(targetPath);

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

  await fs.copyFile(settingsPath, targetPath);
  await fs.chmod(targetPath, 0o600);

  if (existed) {
    io.stderr.write(`Overwrote existing profile '${alias}'.\n`);
  }
  io.stdout.write(`Saved current settings as '${alias}'.\n`);
}
