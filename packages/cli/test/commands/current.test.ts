import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/current.js';
import { ConfigDirNotFoundError } from '../../src/errors.js';

let tmpDir: string;
let savedEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('current command', () => {
  it('throws ConfigDirNotFoundError when missing', async () => {
    process.env.CLAUDE_CONFIG_DIR = '/nonexistent/path/12345';
    const io = { stdout: { write: () => {} } };
    await expect(run(io as never)).rejects.toBeInstanceOf(ConfigDirNotFoundError);
  });

  it('prints summary', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({
        env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_MODEL: 'claude-sonnet-4' },
        mcpServers: { foo: {} },
      }),
    );
    const writes: string[] = [];
    const io = { stdout: { write: (s: string) => writes.push(s) } };

    await run(io as never);

    const out = writes.join('');
    expect(out).toContain('Source: default');
    expect(out).toContain('Base URL: https://x');
    expect(out).toContain('Model: claude-sonnet-4');
    expect(out).toContain('MCP servers: yes');
  });

  it('omits missing fields', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');
    const writes: string[] = [];
    const io = { stdout: { write: (s: string) => writes.push(s) } };

    await run(io as never);

    const out = writes.join('');
    expect(out).toContain('Source: default');
    expect(out).not.toContain('Base URL');
    expect(out).not.toContain('Model');
    expect(out).toContain('MCP servers: no');
  });
});
