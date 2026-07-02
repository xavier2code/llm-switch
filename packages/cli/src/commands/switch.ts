import type { Writable } from 'node:stream';
import type { TargetConfig } from '@xavier2code/llm-switch-core/config.js';
import { assertAlias } from '@xavier2code/llm-switch-core/config.js';
import {
  ProfileStore,
  defaultProfileStore,
} from '@xavier2code/llm-switch-core/store/profile-store.js';
import { pickProfile } from '../ui.js';
import { ProfileNotFoundError, UserCancelledError } from '@xavier2code/llm-switch-core';
import { interactiveTtyRequiredHint, printSwitched } from '../messages.js';
import type { Profile, ProfileContent } from '@xavier2code/llm-switch-core/adapters/types.js';

export interface SwitchIO {
  targets: TargetConfig[];
  alias?: string;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  store?: ProfileStore;
  dryRun?: boolean;
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

    const results = await Promise.all(
      io.targets.map(async (target) => {
        const adapter = store.adapter(target);
        let content = await adapter.readProfile(alias);
        if (!content) {
          if (io.dryRun) {
            const source = await dryRunAutoCreateSource(io, store, target, alias);
            return source
              ? { kind: 'dryRun' as const, target, source }
              : { kind: 'missing' as const };
          }
          content = await autoCreateProfile(io, store, target, alias);
        }
        if (!content) return { kind: 'missing' as const };
        if (io.dryRun) {
          return { kind: 'dryRun' as const, target, source: null };
        }
        await adapter.writeActive(content);
        await store.writeActiveRecord(target, alias);
        return { kind: 'switched' as const, target };
      }),
    );

    const switchedAny = results.some((r) => r.kind !== 'missing');
    if (!switchedAny) {
      throw new ProfileNotFoundError(
        `Profile '${alias}' not found. Run 'sw list' to see available profiles.`,
      );
    }
    if (io.dryRun) {
      for (const result of results) {
        if (result.kind !== 'dryRun') continue;
        if (result.source) {
          io.stdout.write(
            `[dry-run] Would switch ${result.target.displayName} to '${alias}' (${result.source}).\n`,
          );
        } else {
          io.stdout.write(`[dry-run] Would switch ${result.target.displayName} to '${alias}'.\n`);
        }
      }
    } else {
      printSwitched(io.stdout, alias, io.targets);
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

  await Promise.all(
    io.targets.map(async (target) => {
      const adapter = store.adapter(target);
      const content = await adapter.readProfile(chosen.alias);
      if (!content) return;
      if (io.dryRun) {
        io.stdout.write(`[dry-run] Would switch ${target.displayName} to '${chosen.alias}'.\n`);
        return;
      }
      await adapter.writeActive(content);
      await store.writeActiveRecord(target, chosen.alias);
    }),
  );
  if (!io.dryRun) {
    printSwitched(io.stdout, chosen.alias, io.targets);
  }
}

async function dryRunAutoCreateSource(
  io: SwitchIO,
  store: ProfileStore,
  target: TargetConfig,
  alias: string,
): Promise<string | null> {
  for (const other of io.targets) {
    if (other.id === target.id) continue;
    if (other.family !== target.family) continue;
    const otherContent = await store.readProfile(other, alias);
    if (otherContent) {
      return `auto-create from ${other.displayName}`;
    }
  }
  const active = await store.adapter(target).readActive();
  if (active) return 'auto-create from current config';
  return null;
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
