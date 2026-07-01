import type { TargetConfig } from '@xavier2code/llm-switch-core/config.js';
import {
  ProfileStore,
  defaultProfileStore,
} from '@xavier2code/llm-switch-core/store/profile-store.js';
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
    if (s.warning) lines.push(`  Warning: ${s.warning}`);
    if (s.baseUrl) lines.push(`  Base URL: ${s.baseUrl}`);
    if (s.model) lines.push(`  Model: ${s.model}`);
    if (s.drifted) lines.push(`  Warning: active config has drifted from profile '${s.source}'`);
    lines.push(`  MCP servers: ${s.hasMcp ? 'yes' : 'no'}`);
  }

  io.stdout.write(lines.join('\n') + '\n');
}
