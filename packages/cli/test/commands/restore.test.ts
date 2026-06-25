import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/restore.js';
import { NoBackupError, NoCurrentSettingsError } from '../../src/errors.js';
import { mockClaudeTarget } from '../helpers.js';

let tmpDir: string;
let savedEnv: string | undefined;
const target = mockClaudeTarget();

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

async function backupsDir(): Promise<string> {
  return path.join(tmpDir, 'llm-switch', 'backups');
}

async function setupBackupsDir(): Promise<void> {
  await fs.mkdir(await backupsDir(), { recursive: true });
}

describe('restore command', () => {
  it('throws NoBackupError when .bak missing', async () => {
    const writes: string[] = [];
    const io = { target, stdout: { write: (s: string) => writes.push(s) } };
    await expect(run(io)).rejects.toBeInstanceOf(NoBackupError);
  });

  it('throws NoCurrentSettingsError when settings.json missing but .bak exists', async () => {
    await setupBackupsDir();
    const writes: string[] = [];
    const io = { target, stdout: { write: (s: string) => writes.push(s) } };
    await fs.writeFile(path.join(await backupsDir(), 'settings.json.bak'), '{}');
    await expect(run(io)).rejects.toBeInstanceOf(NoCurrentSettingsError);
  });

  it('skips when current == backup', async () => {
    await setupBackupsDir();
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    await fs.writeFile(path.join(await backupsDir(), 'settings.json.bak'), '{"a":1}');
    const writes: string[] = [];
    const io = { target, stdout: { write: (s: string) => writes.push(s) } };

    await run(io);

    expect(writes.join('')).toContain('Already at backup state');
  });

  it('restores from backup', async () => {
    await setupBackupsDir();
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"current":true}');
    await fs.writeFile(path.join(await backupsDir(), 'settings.json.bak'), '{"previous":true}');
    const writes: string[] = [];
    const io = { target, stdout: { write: (s: string) => writes.push(s) } };

    await run(io);

    expect(JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8'))).toEqual({
      previous: true,
    });
    expect(writes.join('')).toContain('Restored from backup');
  });
});
