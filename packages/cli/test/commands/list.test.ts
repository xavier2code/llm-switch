import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/list.js';
import { NoProfilesError, ConfigDirNotFoundError } from '../../src/errors.js';
import { ConfigDir } from '../../src/config.js';

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

describe('list command', () => {
  it('throws NoProfilesError when no profiles', async () => {
    await expect(run({ stdout: { write: () => {} } } as never)).rejects.toBeInstanceOf(NoProfilesError);
  });

  it('lists profiles via injected writer', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.kimi'), '{}');

    const writes: string[] = [];
    await run({ stdout: { write: (s: string) => writes.push(s) } } as never);

    const out = writes.join('');
    expect(out).toContain('glm');
    expect(out).toContain('kimi');
  });
});
