import { getConfigDir } from '../config.js';
import { summarize } from '../display.js';

export interface CurrentIO {
  stdout: { write(s: string): unknown };
}

export async function run(io: CurrentIO): Promise<void> {
  const s = await summarize(getConfigDir());
  const lines: string[] = [];
  lines.push(`Source: ${s.source} (${s.sourcePath})`);
  if (s.baseUrl) lines.push(`Base URL: ${s.baseUrl}`);
  if (s.model) lines.push(`Model: ${s.model}`);
  lines.push(`MCP servers: ${s.hasMcp ? 'yes' : 'no'}`);
  io.stdout.write(lines.join('\n') + '\n');
}
