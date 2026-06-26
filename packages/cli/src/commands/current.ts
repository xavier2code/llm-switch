import type { TargetConfig } from '../config.js';
import { ProfileStore, defaultProfileStore } from '../store/profile-store.js';
import { summarize } from '../display.js';

export interface CurrentIO {
  targets: TargetConfig[];
  stdout: { write(s: string): unknown };
  store?: ProfileStore;
}

export async function run(io: CurrentIO): Promise<void> {
  const store = io.store ?? defaultProfileStore();
  const lines: string[] = [];

  for (const target of io.targets) {
    const s = await summarize(target, store);
    lines.push(`${target.displayName}:`);
    lines.push(`  Source: ${s.source} (${s.sourcePath})`);
    if (s.baseUrl) lines.push(`  Base URL: ${s.baseUrl}`);
    if (s.model) lines.push(`  Model: ${s.model}`);
    lines.push(`  MCP servers: ${s.hasMcp ? 'yes' : 'no'}`);
  }

  io.stdout.write(lines.join('\n') + '\n');
}
