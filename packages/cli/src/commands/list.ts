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

  const lines = ['Available profiles:', ''];
  profiles.forEach((p, i) => {
    const marker = p.active ? '*' : ' ';
    lines.push(`  ${marker} ${i + 1}. ${p.alias}  (${p.path})`);
  });
  lines.push('');
  lines.push('* = currently active');
  io.stdout.write(lines.join('\n') + '\n');
}
