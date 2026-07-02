import type { Writable } from 'node:stream';
import { confirm as inquirerConfirm } from '@inquirer/prompts';
import type { TargetConfig } from '@xavier2code/llm-switch-core/config.js';
import { assertAlias } from '@xavier2code/llm-switch-core/config.js';
import {
  ProfileStore,
  defaultProfileStore,
} from '@xavier2code/llm-switch-core/store/profile-store.js';
import { promptAlias } from '../ui.js';
import { NoCurrentSettingsError, UserCancelledError } from '@xavier2code/llm-switch-core';
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
    const profileLists = await Promise.all(io.targets.map((target) => store.listProfiles(target)));
    const allAliases = new Set<string>();
    for (const profiles of profileLists) {
      profiles.forEach((p) => allAliases.add(p.alias));
    }
    const result = await promptAlias([...allAliases]);
    if (!result) throw new UserCancelledError('Cancelled.');
    alias = result;
  } else {
    assertAlias(alias);
  }

  const classified = await Promise.all(
    io.targets.map(async (target) => {
      const adapter = store.adapter(target);
      const active = await adapter.readActive();
      const existed = active ? (await store.readProfile(target, alias!)) !== null : false;
      return { target, active, existed };
    }),
  );

  const targetsWithMissingActive: TargetConfig[] = [];
  const targetsToSave: TargetConfig[] = [];
  const targetsExisted: TargetConfig[] = [];

  for (const { target, active, existed } of classified) {
    if (!active) {
      targetsWithMissingActive.push(target);
      continue;
    }
    targetsToSave.push(target);
    if (existed) targetsExisted.push(target);
  }

  if (targetsWithMissingActive.length > 0 && targetsToSave.length === 0) {
    const names = targetsWithMissingActive.map((t) => t.displayName).join(', ');
    throw new NoCurrentSettingsError(`No current settings for ${names}. Nothing to save.`);
  }

  if (targetsExisted.length > 0 && !io.force) {
    if (!io.isTTY) {
      const names = targetsExisted.map((t) => t.displayName).join(', ');
      throw new UserCancelledError(
        `Profile '${alias}' exists for ${names}. Pass --force to overwrite, or run in a TTY.`,
      );
    }
    const confirmFn = io.confirmFn ?? inquirerConfirm;
    const names = targetsExisted.map((t) => t.displayName).join(', ');
    const overwrite = await confirmFn({
      message: `Profile '${alias}' exists for ${names}. Overwrite for all selected tools?`,
      default: false,
    });
    if (!overwrite) throw new UserCancelledError('Cancelled.');
  }

  await Promise.all(
    targetsToSave.map(async (target) => {
      const adapter = store.adapter(target);
      const active = (await adapter.readActive())!;
      const existed = targetsExisted.includes(target);
      await store.writeProfile(target, alias!, active);
      if (existed) {
        io.stderr.write(`Overwrote existing profile '${alias}' for ${target.displayName}.\n`);
      }
      io.stdout.write(`Saved ${target.displayName} settings as '${alias}'.\n`);
    }),
  );

  for (const target of targetsWithMissingActive) {
    io.stderr.write(
      `Skipped ${target.displayName}: no current ${target.activeConfigFileName} to save.\n`,
    );
  }
}
