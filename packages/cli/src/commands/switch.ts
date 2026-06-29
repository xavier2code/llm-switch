import type { Writable } from 'node:stream';
import type { TargetConfig } from '../config.js';
import { assertAlias } from '../config.js';
import { ProfileStore, defaultProfileStore } from '../store/profile-store.js';
import { pickProfile } from '../ui.js';
import { ProfileNotFoundError, UserCancelledError } from '../errors.js';
import { restartHint, interactiveTtyRequiredHint } from '../messages.js';
import type { Profile, ProfileContent } from '../adapters/types.js';

export interface SwitchIO {
  targets: TargetConfig[];
  alias?: string;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  store?: ProfileStore;
}

export async function run(io: SwitchIO): Promise<void> {
  const store = io.store ?? defaultProfileStore();

  if (io.alias !== undefined) {
    const alias = io.alias;
    assertAlias(alias);

    if (io.isTTY && io.targets.length > 1) {
      const result = await profileAliasIntersection(io.targets, store);
      if (result !== null && !result.intersection.has(alias)) {
        const missing = io.targets.filter((t) => {
          const idx = io.targets.indexOf(t);
          return !result.aliasSets[idx]?.has(alias);
        });
        const missingNames = missing.map((t) => t.displayName).join(', ');
        io.stderr.write(
          `Warning: '${alias}' is not shared by all selected tools (missing on ${missingNames}).\n`,
        );
      }
    }

    let switchedAny = false;
    for (const target of io.targets) {
      const adapter = store.adapter(target);
      let content = await adapter.readProfile(alias);
      if (!content) {
        content = await autoCreateProfile(io, store, target, alias);
      }
      if (!content) continue;
      await adapter.writeActive(content);
      switchedAny = true;
    }
    if (!switchedAny) {
      throw new ProfileNotFoundError(
        `Profile '${alias}' not found. Run 'sw list' to see available profiles.`,
      );
    }
    io.stdout.write(`Switched to ${alias}:\n`);
    for (const target of io.targets) {
      io.stdout.write(`  ${target.displayName}  ${restartHint(target)}\n`);
    }
    return;
  }

  if (!io.isTTY) {
    throw new UserCancelledError(interactiveTtyRequiredHint('switch'));
  }

  const chosen = await pickProfileFromIntersection(io.targets, store);
  if (chosen === 'empty') {
    throw new ProfileNotFoundError(
      'No profiles are shared across the selected tools. Run `sw list` to see per-target profiles.',
    );
  }
  if (!chosen) {
    throw new UserCancelledError('Cancelled.');
  }

  for (const target of io.targets) {
    const adapter = store.adapter(target);
    const content = await adapter.readProfile(chosen.alias);
    if (!content) continue;
    await adapter.writeActive(content);
  }
  io.stdout.write(`Switched to ${chosen.alias}:\n`);
  for (const target of io.targets) {
    io.stdout.write(`  ${target.displayName}  ${restartHint(target)}\n`);
  }
}

async function autoCreateProfile(
  io: SwitchIO,
  store: ProfileStore,
  target: TargetConfig,
  alias: string,
): Promise<ProfileContent | null> {
  // 1. Try same-family source from other selected targets.
  for (const other of io.targets) {
    if (other.id === target.id) continue;
    if (other.family !== target.family) continue;
    const otherContent = await store.readProfile(other, alias);
    if (otherContent) {
      io.stderr.write(
        `Auto-created '${alias}' for ${target.displayName} from ${other.displayName}.\n`,
      );
      await store.writeProfile(target, alias, otherContent);
      return store.readProfile(target, alias);
    }
  }

  // 2. Try the target's current active config.
  const adapter = store.adapter(target);
  const active = await adapter.readActive();
  if (active) {
    io.stderr.write(`Auto-created '${alias}' for ${target.displayName} from current config.\n`);
    await store.writeProfile(target, alias, active);
    return store.readProfile(target, alias);
  }

  io.stderr.write(
    `Could not auto-create '${alias}' for ${target.displayName}: no source available.\n`,
  );
  return null;
}

async function pickProfileFromIntersection(
  targets: TargetConfig[],
  store: ProfileStore,
): Promise<Profile | 'empty' | null> {
  const result = await profileAliasIntersection(targets, store);
  if (result === null || result.intersection.size === 0) {
    return result === null ? null : 'empty';
  }

  const profiles = (await store.listProfiles(targets[0])).filter((p) =>
    result.intersection.has(p.alias),
  );
  return pickProfile(profiles);
}

async function profileAliasIntersection(
  targets: TargetConfig[],
  store: ProfileStore,
): Promise<{ aliasSets: Set<string>[]; intersection: Set<string> } | null> {
  if (targets.length === 0) return null;

  const aliasSets = await Promise.all(
    targets.map(async (target) => {
      const profiles = await store.listProfiles(target);
      return new Set(profiles.map((p) => p.alias));
    }),
  );
  const [first, ...rest] = aliasSets;
  const intersection = rest.reduce<Set<string>>(
    (acc, set) => new Set([...acc].filter((a) => set.has(a))),
    first,
  );

  return { aliasSets, intersection };
}
