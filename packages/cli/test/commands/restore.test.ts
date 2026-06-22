import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/restore.js';
import { NoBackupError, NoCurrentSettingsError } from '../../src/errors.js';

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

describe('restore command', () => {
  it('throws NoBackupError when .bak missing', async () => {
    const writes: string[] = [];
    const io = { stdout: { write: (s: string) => writes.push(s) } };
    await expect(run(io as never)).rejects.toBeInstanceOf(NoBackupError);
  });

  it('throws NoCurrentSettingsError when settings.json missing but .bak exists', async () => {
    const writes: string[] = [];
    const io = { stdout: { write: (s: string) => writes.push(s) } };
    await fs.writeFile(path.join(tmpDir, 'settings.json.bak'), '{}');
    await expect(run(io as never)).rejects.toBeInstanceOf(NoCurrentSettingsError);
  });

  it('skips when current == backup', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.bak'), '{"a":1}');
    const writes: string[] = [];
    const io = { stdout: { write: (s: string) => writes.push(s) } };

    await run(io as never);

    expect(writes.join('')).toContain('Already at backup state');
  });

  it('restores from backup', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"current":true}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.bak'), '{"previous":true}');
    const writes: string[] = [];
    const io = { stdout: { write: (s: string) => writes.push(s) } };

    await run(io as never);

    expect(JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8'))).toEqual({ previous: true });
    expect(writes.join('')).toContain('Restored from backup');
  });
});