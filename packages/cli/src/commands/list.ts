import type { TargetConfig } from '@llm-switch/core/config.js';
import { ProfileStore, defaultProfileStore } from '@llm-switch/core/store/profile-store.js';
import { NoProfilesError } from '../errors.js';

export interface CommandIO {
  targets: TargetConfig[];
  stdout: { write(s: string): unknown };
  store?: ProfileStore;
}

export async function run(io: CommandIO): Promise<void> {
  const store = io.store ?? defaultProfileStore();
  const sections: string[] = [];

  for (const target of io.targets) {
    const profiles = await store.listProfiles(target);
    if (profiles.length === 0) continue;

    const maxAliasLen = Math.max(...profiles.map((p) => p.alias.length));
    const sorted = [...profiles].sort((a, b) => {
      if (a.active && !b.active) return -1;
      if (!a.active && b.active) return 1;
      return a.alias.localeCompare(b.alias);
    });

    sections.push(`${target.displayName} profiles:`);
    for (const p of sorted) {
      const marker = p.active ? '●' : '○';
      const tag = p.active ? ' (active)' : '';
      const padded = p.alias.padEnd(maxAliasLen);
      sections.push(`  ${marker} ${padded}${tag}  ${p.path}`);
    }
  }

  if (sections.length === 0) {
    throw new NoProfilesError('No profiles found. Create one with: sw save <alias>');
  }

  io.stdout.write(sections.join('\n') + '\n');
}
