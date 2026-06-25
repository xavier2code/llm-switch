import type { TargetConfig } from '../config.js';
import { listProfiles } from '../scanner.js';
import { NoProfilesError } from '../errors.js';

export interface CommandIO {
  target: TargetConfig;
  stdout: { write(s: string): unknown };
}

export async function run(io: CommandIO): Promise<void> {
  const profiles = await listProfiles(io.target);

  if (profiles.length === 0) {
    throw new NoProfilesError('No profiles found. Create one with: sw save <alias>');
  }

  const maxAliasLen = Math.max(...profiles.map((p) => p.alias.length));

  const sorted = [...profiles].sort((a, b) => {
    if (a.active && !b.active) return -1;
    if (!a.active && b.active) return 1;
    return a.alias.localeCompare(b.alias);
  });

  const lines = ['Available profiles:', ''];
  sorted.forEach((p) => {
    const marker = p.active ? '●' : '○';
    const tag = p.active ? ' (active)' : '';
    const padded = p.alias.padEnd(maxAliasLen);
    lines.push(`  ${marker} ${padded}${tag}  ${p.path}`);
  });
  lines.push('');
  lines.push('Use `sw switch` to change active profile.');
  io.stdout.write(lines.join('\n') + '\n');
}
