import type { ConfigDir } from '../config.js';
import { getConfigDir } from '../config.js';
import { listProfiles } from '../scanner.js';
import { NoProfilesError } from '../errors.js';

export interface CommandIO {
  stdout: { write(s: string): unknown };
}

export async function run(io: CommandIO): Promise<void> {
  const configDir: ConfigDir = getConfigDir();
  const profiles = await listProfiles(configDir);

  if (profiles.length === 0) {
    throw new NoProfilesError(
      "No profiles found. Create one with: llm-switch save <alias>",
    );
  }

  const maxAliasLen = Math.max(...profiles.map((p) => p.alias.length));

  const lines = ['Available profiles:', ''];
  profiles.forEach((p) => {
    const marker = p.active ? '●' : '○';
    const tag = p.active ? ' (active)' : '';
    const padded = p.alias.padEnd(maxAliasLen);
    lines.push(`  ${marker} ${padded}${tag}  ${p.path}`);
  });
  lines.push('');
  lines.push('Use `llm-switch switch` to change active profile.');
  io.stdout.write(lines.join('\n') + '\n');
}