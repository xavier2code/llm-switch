import type { Writable } from 'node:stream';
import { confirm as inquirerConfirm } from '@inquirer/prompts';
import type { TargetConfig } from '../config.js';
import { assertAlias } from '../config.js';
import { ProfileStore, defaultProfileStore } from '../store/profile-store.js';
import { promptAlias } from '../ui.js';
import { NoCurrentSettingsError, UserCancelledError } from '../errors.js';
import { interactiveTtyRequiredHint } from '../messages.js';

export interface SaveIO {
  targets: TargetConfig[];
  alias?: string;
  force?: boolean;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  store?: ProfileStore;
  confirmFn?: typeof inquirerConfirm;
}

export async function run(io: SaveIO): Promise<void> {
  const store = io.store ?? defaultProfileStore();

  let alias = io.alias;
  if (alias === undefined) {
    if (!io.isTTY) {
      throw new UserCancelledError(interactiveTtyRequiredHint('save'));
    }
    const allAliases = new Set<string>();
    for (const target of io.targets) {
      const profiles = await store.listProfiles(target);
      profiles.forEach((p) => allAliases.add(p.alias));
    }
    const result = await promptAlias([...allAliases]);
    if (!result) throw new UserCancelledError('Cancelled.');
    alias = result;
  } else {
    assertAlias(alias);
  }

  for (const target of io.targets) {
    const adapter = store.adapter(target);
    const active = await adapter.readActive();
    if (!active) {
      throw new NoCurrentSettingsError(
        `No current ${target.activeConfigFileName} for ${target.displayName}. Nothing to save.`,
      );
    }

    const existed = (await store.readProfile(target, alias)) !== null;
    if (existed && !io.force) {
      if (!io.isTTY) {
        throw new UserCancelledError(
          `Profile '${alias}' exists for ${target.displayName}. Pass --force to overwrite, or run in a TTY.`,
        );
      }
      const confirmFn = io.confirmFn ?? inquirerConfirm;
      const overwrite = await confirmFn({
        message: `Profile '${alias}' exists for ${target.displayName}. Overwrite?`,
        default: false,
      });
      if (!overwrite) throw new UserCancelledError('Cancelled.');
    }

    await store.writeProfile(target, alias, active);
    if (existed) {
      io.stderr.write(`Overwrote existing profile '${alias}' for ${target.displayName}.\n`);
    }
    io.stdout.write(`Saved ${target.displayName} settings as '${alias}'.\n`);
  }
}
