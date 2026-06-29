import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/restore.js';
import { NoBackupError } from '../../src/errors.js';
import { ProfileStore } from '../../src/store/profile-store.js';
import { mockClaudeTarget, mockOpencodeTarget } from '../helpers.js';

let tmpDir: string;
let savedClaude: string | undefined;
let savedOpencode: string | undefined;
let savedHome: string | undefined;
let store: ProfileStore;
const claude = mockClaudeTarget();
const opencode = mockOpencodeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-restore-'));
  savedClaude = process.env.CLAUDE_CONFIG_DIR;
  savedOpencode = process.env.OPENCODE_CONFIG_DIR;
  savedHome = process.env.HOME;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  process.env.OPENCODE_CONFIG_DIR = tmpDir;
  process.env.HOME = tmpDir;
  store = new ProfileStore(path.join(tmpDir, '.llm-switch'));
});

afterEach(async () => {
  if (savedClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedClaude;
  if (savedOpencode === undefined) delete process.env.OPENCODE_CONFIG_DIR;
  else process.env.OPENCODE_CONFIG_DIR = savedOpencode;
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function backupsDir(): string {
  return path.join(tmpDir, '.llm-switch', 'backups');
}

async function setupBackupsDir(): Promise<void> {
  await fs.mkdir(path.join(backupsDir(), 'claude'), { recursive: true });
}

function captureIO() {
  const writes: string[] = [];
  return { writes, stdout: { write: (s: string) => writes.push(s) } };
}

describe('restore command', () => {
  it('throws NoBackupError when .bak missing', async () => {
    const io = { targets: [claude], store, ...captureIO() };
    await expect(run(io)).rejects.toBeInstanceOf(NoBackupError);
  });

  it('throws NoBackupError when settings.json missing but .bak exists', async () => {
    await setupBackupsDir();
    await fs.writeFile(path.join(backupsDir(), 'claude', 'settings.json.bak'), '{}');
    const io = { targets: [claude], store, ...captureIO() };
    await expect(run(io)).rejects.toBeInstanceOf(NoBackupError);
  });

  it('continues with remaining targets when one lacks a backup', async () => {
    await fs.mkdir(path.join(backupsDir(), 'claude'), { recursive: true });
    await fs.mkdir(path.join(backupsDir(), 'opencode'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"c":1}');
    await fs.writeFile(path.join(tmpDir, 'opencode.json'), '{"c":1}');
    await fs.writeFile(path.join(backupsDir(), 'opencode', 'opencode.json.bak'), '{"p":1}');
    const io = { targets: [claude, opencode], store, ...captureIO() };
    await expect(run(io)).rejects.toBeInstanceOf(NoBackupError);
    expect(io.writes.join('')).toContain('OpenCode');
    expect(io.writes.join('')).toContain('restored from backup');
    expect(JSON.parse(await fs.readFile(path.join(tmpDir, 'opencode.json'), 'utf8'))).toEqual({
      p: 1,
    });
  });

  it('reports already-at-backup-state when current == backup', async () => {
    await fs.mkdir(path.join(backupsDir(), 'claude'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    await fs.writeFile(path.join(backupsDir(), 'claude', 'settings.json.bak'), '{"a":1}');
    const io = { targets: [claude], store, ...captureIO() };
    await run(io);
    expect(io.writes.join('')).toContain('already at backup state');
  });

  it('restores from backup and prefixes target name', async () => {
    await fs.mkdir(path.join(backupsDir(), 'claude'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"current":true}');
    await fs.writeFile(path.join(backupsDir(), 'claude', 'settings.json.bak'), '{"previous":true}');
    const io = { targets: [claude], store, ...captureIO() };
    await run(io);
    expect(JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8'))).toEqual({
      previous: true,
    });
    expect(io.writes.join('')).toContain('Claude Code');
    expect(io.writes.join('')).toContain('restored from backup');
  });

  it('loops over multiple targets', async () => {
    await fs.mkdir(path.join(backupsDir(), 'claude'), { recursive: true });
    await fs.mkdir(path.join(backupsDir(), 'opencode'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"c":1}');
    await fs.writeFile(path.join(tmpDir, 'opencode.json'), '{"c":1}');
    await fs.writeFile(path.join(backupsDir(), 'claude', 'settings.json.bak'), '{"p":1}');
    await fs.writeFile(path.join(backupsDir(), 'opencode', 'opencode.json.bak'), '{"p":1}');
    const io = { targets: [claude, opencode], store, ...captureIO() };
    await run(io);
    const out = io.writes.join('');
    expect(out).toContain('Claude Code');
    expect(out).toContain('OpenCode');
    expect(JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8'))).toEqual({
      p: 1,
    });
    expect(JSON.parse(await fs.readFile(path.join(tmpDir, 'opencode.json'), 'utf8'))).toEqual({
      p: 1,
    });
  });
});
