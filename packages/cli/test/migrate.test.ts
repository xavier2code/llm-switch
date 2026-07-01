import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ensureMigratedToCentralStore } from '@xavier2code/llm-switch-core/migrate.js';
import { getTarget } from '@xavier2code/llm-switch-core/config.js';

let tmpDir: string;
let savedHome: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-migrate-'));
  savedHome = process.env.HOME;
  process.env.HOME = tmpDir;
});

afterEach(async () => {
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('ensureMigratedToCentralStore', () => {
  it('copies existing profiles from old per-target store to centralized store', async () => {
    const oldClaudeProfiles = path.join(tmpDir, '.claude', 'llm-switch', 'profiles');
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

  it('copies existing profiles from old central store to new central store', async () => {
    const oldCentralProfiles = path.join(tmpDir, '.config', 'llm-switch', 'profiles', 'claude');
    await fs.mkdir(oldCentralProfiles, { recursive: true });
    await fs.writeFile(path.join(oldCentralProfiles, 'glm.json'), '{}');

    const centralDir = path.join(tmpDir, 'central');
    await ensureMigratedToCentralStore(centralDir, [getTarget('claude')]);

    const copied = await fs.readFile(
      path.join(centralDir, 'profiles', 'claude', 'glm.json'),
      'utf8',
    );
    expect(copied).toBe('{}');
  });

  it('creates a per-target marker after copying legacy profiles', async () => {
    const oldClaudeProfiles = path.join(tmpDir, '.claude', 'llm-switch', 'profiles');
    await fs.mkdir(oldClaudeProfiles, { recursive: true });
    await fs.writeFile(path.join(oldClaudeProfiles, 'glm.json'), '{}');

    const centralDir = path.join(tmpDir, 'central');
    await ensureMigratedToCentralStore(centralDir, [getTarget('claude')]);
    const marker = await fs.stat(path.join(centralDir, 'profiles', 'claude', '.migrated'));
    expect(marker.isFile()).toBe(true);
  });

  it('is idempotent (does not re-copy when marker exists)', async () => {
    const oldClaudeProfiles = path.join(tmpDir, '.claude', 'llm-switch', 'profiles');
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

    const oldClaude = path.join(tmpDir, '.claude', 'llm-switch', 'profiles');
    await fs.mkdir(oldClaude, { recursive: true });
    await fs.writeFile(path.join(oldClaude, 'glm.json'), '{}');
    await ensureMigratedToCentralStore(centralDir, [getTarget('claude')]);

    // opencode legacy profiles live under a separate config dir.
    const oldOpencode = path.join(tmpDir, '.config', 'opencode', 'llm-switch', 'profiles');
    await fs.mkdir(oldOpencode, { recursive: true });
    await fs.writeFile(path.join(oldOpencode, 'work.json'), '{}');
    await ensureMigratedToCentralStore(centralDir, [getTarget('opencode')]);

    const copied = await fs.readFile(
      path.join(centralDir, 'profiles', 'opencode', 'work.json'),
      'utf8',
    );
    expect(copied).toBe('{}');
  });

  it('migrates state.json from old central store to new central store', async () => {
    const oldCentralDir = path.join(tmpDir, '.config', 'llm-switch');
    await fs.mkdir(oldCentralDir, { recursive: true });
    await fs.writeFile(
      path.join(oldCentralDir, 'state.json'),
      '{"version":1,"lastSelectedTargets":["codex"]}',
    );

    const centralDir = path.join(tmpDir, 'central');
    await ensureMigratedToCentralStore(centralDir, [getTarget('claude')]);

    const state = await fs.readFile(path.join(centralDir, 'state.json'), 'utf8');
    expect(JSON.parse(state)).toEqual({ version: 1, lastSelectedTargets: ['codex'] });
  });

  it('does not overwrite existing state.json in new central store', async () => {
    const oldCentralDir = path.join(tmpDir, '.config', 'llm-switch');
    await fs.mkdir(oldCentralDir, { recursive: true });
    await fs.writeFile(
      path.join(oldCentralDir, 'state.json'),
      '{"version":1,"lastSelectedTargets":["codex"]}',
    );

    const centralDir = path.join(tmpDir, 'central');
    await fs.mkdir(centralDir, { recursive: true });
    await fs.writeFile(
      path.join(centralDir, 'state.json'),
      '{"version":1,"lastSelectedTargets":["claude"]}',
    );

    await ensureMigratedToCentralStore(centralDir, [getTarget('claude')]);

    const state = await fs.readFile(path.join(centralDir, 'state.json'), 'utf8');
    expect(JSON.parse(state)).toEqual({ version: 1, lastSelectedTargets: ['claude'] });
  });

  it('removes markers on failure so next run can retry', async () => {
    const oldClaudeProfiles = path.join(tmpDir, '.claude', 'llm-switch', 'profiles');
    await fs.mkdir(oldClaudeProfiles, { recursive: true });
    await fs.writeFile(path.join(oldClaudeProfiles, 'glm.json'), '{}');

    const centralDir = path.join(tmpDir, 'central');
    // Make the profiles directory read-only to force a copy failure
    const claudeDir = path.join(centralDir, 'profiles', 'claude');
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.chmod(claudeDir, 0o500);

    await expect(ensureMigratedToCentralStore(centralDir, [getTarget('claude')])).rejects.toThrow();

    // Marker should not exist after failure
    const markerExists = await fs.stat(path.join(claudeDir, '.migrated')).then(
      () => true,
      () => false,
    );
    expect(markerExists).toBe(false);

    // Restore permissions for cleanup
    await fs.chmod(claudeDir, 0o700);
  });
});
