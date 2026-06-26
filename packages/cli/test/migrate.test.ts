import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ensureMigratedToCentralStore } from '../src/migrate.js';
import { getTarget } from '../src/config.js';

let tmpDir: string;
let savedClaude: string | undefined;
let savedOpencode: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-migrate-'));
  savedClaude = process.env.CLAUDE_CONFIG_DIR;
  savedOpencode = process.env.OPENCODE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  process.env.OPENCODE_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  if (savedClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedClaude;
  if (savedOpencode === undefined) delete process.env.OPENCODE_CONFIG_DIR;
  else process.env.OPENCODE_CONFIG_DIR = savedOpencode;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('ensureMigratedToCentralStore', () => {
  it('copies existing profiles to centralized store', async () => {
    const oldClaudeProfiles = path.join(tmpDir, 'llm-switch', 'profiles');
    await fs.mkdir(oldClaudeProfiles, { recursive: true });
    await fs.writeFile(path.join(oldClaudeProfiles, 'glm.json'), '{}');

    const centralDir = path.join(tmpDir, 'central');
    await ensureMigratedToCentralStore(centralDir, [getTarget('claude')]);

    const copied = await fs.readFile(
      path.join(centralDir, 'profiles', 'claude', 'glm.json'),
      'utf8',
    );
    expect(copied).toBe('{}');
  });

  it('creates a per-target marker after copying legacy profiles', async () => {
    const oldClaudeProfiles = path.join(tmpDir, 'llm-switch', 'profiles');
    await fs.mkdir(oldClaudeProfiles, { recursive: true });
    await fs.writeFile(path.join(oldClaudeProfiles, 'glm.json'), '{}');

    const centralDir = path.join(tmpDir, 'central');
    await ensureMigratedToCentralStore(centralDir, [getTarget('claude')]);
    const marker = await fs.stat(path.join(centralDir, 'profiles', 'claude', '.migrated'));
    expect(marker.isFile()).toBe(true);
  });

  it('is idempotent (does not re-copy when marker exists)', async () => {
    const oldClaudeProfiles = path.join(tmpDir, 'llm-switch', 'profiles');
    await fs.mkdir(oldClaudeProfiles, { recursive: true });
    await fs.writeFile(path.join(oldClaudeProfiles, 'glm.json'), '{}');

    const centralDir = path.join(tmpDir, 'central');
    await ensureMigratedToCentralStore(centralDir, [getTarget('claude')]);
    // Second run should be a no-op (no error).
    await expect(
      ensureMigratedToCentralStore(centralDir, [getTarget('claude')]),
    ).resolves.toBeUndefined();
  });

  it('migrates a target seen later even after an earlier target was migrated', async () => {
    // Regression: a global marker would skip opencode after claude was migrated.
    const centralDir = path.join(tmpDir, 'central');

    const oldClaude = path.join(tmpDir, 'llm-switch', 'profiles');
    await fs.mkdir(oldClaude, { recursive: true });
    await fs.writeFile(path.join(oldClaude, 'glm.json'), '{}');
    await ensureMigratedToCentralStore(centralDir, [getTarget('claude')]);

    // opencode legacy profiles live under a separate config dir.
    const opencodeHome = path.join(tmpDir, 'opencode-home');
    const oldOpencode = path.join(opencodeHome, 'llm-switch', 'profiles');
    await fs.mkdir(oldOpencode, { recursive: true });
    await fs.writeFile(path.join(oldOpencode, 'work.json'), '{}');
    process.env.OPENCODE_CONFIG_DIR = opencodeHome;
    await ensureMigratedToCentralStore(centralDir, [getTarget('opencode')]);

    const copied = await fs.readFile(
      path.join(centralDir, 'profiles', 'opencode', 'work.json'),
      'utf8',
    );
    expect(copied).toBe('{}');
  });

  it('skips targets whose old profile dir does not exist', async () => {
    const centralDir = path.join(tmpDir, 'central');
    await ensureMigratedToCentralStore(centralDir, [getTarget('opencode')]);
    const exists = await fs.stat(path.join(centralDir, 'profiles', 'opencode')).then(
      () => true,
      () => false,
    );
    expect(exists).toBe(false);
  });
});
