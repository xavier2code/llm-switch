import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import {
  getConfigDir,
  getActiveConfigPath,
  getBackupPath,
  getProfilesDir,
  profilePath,
  ALIAS_RE,
  validateAlias,
  getTarget,
  getDefaultTarget,
  isTargetId,
  ensureMigrated,
  TARGETS,
} from '@llm-switch/core/config.js';
import { mockClaudeTarget, mockOpencodeTarget } from './helpers.js';
import fs from 'node:fs/promises';
import os from 'node:os';

describe('target registry', () => {
  it('exposes claude, opencode, and codex targets', () => {
    expect(TARGETS.map((t) => t.id)).toEqual(['claude', 'opencode', 'codex']);
  });

  it('getTarget returns the matching config', () => {
    const t = getTarget('opencode');
    expect(t.id).toBe('opencode');
    expect(t.activeConfigFileName).toBe('opencode.json');
  });

  it('isTargetId validates known targets', () => {
    expect(isTargetId('claude')).toBe(true);
    expect(isTargetId('opencode')).toBe(true);
    expect(isTargetId('codex')).toBe(true);
    expect(isTargetId('aider')).toBe(false);
    expect(isTargetId(123)).toBe(false);
  });

  it('codex has openai family and toml adapter', () => {
    const codex = getTarget('codex');
    expect(codex.family).toBe('openai');
    expect(codex.adapterType).toBe('openai-toml');
    expect(codex.envConfigDir).toBe('CODEX_HOME');
    expect(codex.activeConfigFileName).toBe('config.toml');
  });
});

describe('default target resolution', () => {
  const originalEnv = process.env.LLM_SWITCH_TARGET;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.LLM_SWITCH_TARGET;
    else process.env.LLM_SWITCH_TARGET = originalEnv;
  });

  it('defaults to claude', () => {
    delete process.env.LLM_SWITCH_TARGET;
    expect(getDefaultTarget().id).toBe('claude');
  });

  it('reads LLM_SWITCH_TARGET', () => {
    process.env.LLM_SWITCH_TARGET = 'opencode';
    expect(getDefaultTarget().id).toBe('opencode');
  });

  it('ignores invalid LLM_SWITCH_TARGET', () => {
    process.env.LLM_SWITCH_TARGET = 'unknown';
    expect(getDefaultTarget().id).toBe('claude');
  });
});

describe('path resolution', () => {
  const originalEnv = process.env.CLAUDE_CONFIG_DIR;
  const originalOpencodeEnv = process.env.OPENCODE_CONFIG_DIR;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.OPENCODE_CONFIG_DIR;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalEnv;
    if (originalOpencodeEnv === undefined) delete process.env.OPENCODE_CONFIG_DIR;
    else process.env.OPENCODE_CONFIG_DIR = originalOpencodeEnv;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  });

  it('uses target-specific env var for config dir', () => {
    process.env.CLAUDE_CONFIG_DIR = '/tmp/claude-test';
    process.env.OPENCODE_CONFIG_DIR = '/tmp/opencode-test';
    expect(getConfigDir(mockClaudeTarget())).toBe('/tmp/claude-test');
    expect(getConfigDir(mockOpencodeTarget())).toBe('/tmp/opencode-test');
  });

  it('falls back to target-specific default config dir', () => {
    process.env.HOME = '/Users/alice';
    expect(getConfigDir(mockClaudeTarget())).toBe(path.join('/Users/alice', '.claude'));
    expect(getConfigDir(mockOpencodeTarget())).toBe(path.join('/Users/alice', '.config/opencode'));
  });

  it('expands ~ in env config dir', () => {
    process.env.CLAUDE_CONFIG_DIR = '~/my-claude';
    process.env.HOME = '/Users/bob';
    expect(getConfigDir(mockClaudeTarget())).toBe(path.join('/Users/bob', 'my-claude'));
  });
});

describe('derived paths', () => {
  const originalEnv = process.env.CLAUDE_CONFIG_DIR;

  beforeEach(() => {
    process.env.CLAUDE_CONFIG_DIR = '/tmp/cfg';
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalEnv;
  });

  it('getActiveConfigPath returns settings.json for claude', () => {
    expect(getActiveConfigPath(mockClaudeTarget())).toMatch(/settings\.json$/);
  });

  it('getActiveConfigPath returns opencode.json for opencode', () => {
    expect(getActiveConfigPath(mockOpencodeTarget())).toMatch(/opencode\.json$/);
  });

  it('getBackupPath lives next to the active config file', () => {
    process.env.CLAUDE_CONFIG_DIR = '/tmp/cfg';
    expect(getBackupPath(mockClaudeTarget())).toBe(path.join('/tmp/cfg', 'settings.json.bak'));
  });

  it('profilePath lives under ~/.llm-switch/profiles and uses .json', () => {
    process.env.HOME = '/Users/alice';
    expect(profilePath('glm', mockClaudeTarget())).toMatch(
      /\.llm-switch\/profiles\/claude\/glm\.json$/,
    );
  });

  it('getProfilesDir returns the profiles subdirectory under ~/.llm-switch', () => {
    process.env.HOME = '/Users/alice';
    expect(getProfilesDir(mockClaudeTarget())).toMatch(/\.llm-switch\/profiles\/claude$/);
  });
});

describe('migration', () => {
  let tmpDir: string;
  const originalHome = process.env.HOME;
  const originalClaudeEnv = process.env.CLAUDE_CONFIG_DIR;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
    process.env.HOME = tmpDir;
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalClaudeEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalClaudeEnv;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('migrates old flat-layout profiles and backup', async () => {
    // Old flat layout lives in the target config dir
    const claudeDir = path.join(tmpDir, '.claude');
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.writeFile(path.join(claudeDir, 'settings.json.glm'), '{}');
    await fs.writeFile(path.join(claudeDir, 'settings.json.kimi'), '{}');
    await fs.writeFile(path.join(claudeDir, 'settings.json.bak'), '{}');

    await ensureMigrated(mockClaudeTarget());

    const profiles = await fs.readdir(path.join(tmpDir, '.llm-switch', 'profiles', 'claude'));
    expect(profiles.sort()).toEqual(['glm.json', 'kimi.json']);
    // Backup stays next to the active config file in the config dir root.
    const backup = await fs.readFile(path.join(claudeDir, 'settings.json.bak'), 'utf8');
    expect(backup).toBe('{}');
    const root = await fs.readdir(claudeDir);
    expect(root).not.toContain('settings.json.glm');
    expect(root).toContain('settings.json.bak');
  });

  it('creates new directories when no old files exist', async () => {
    await ensureMigrated(mockClaudeTarget());

    const stat = await fs.stat(path.join(tmpDir, '.llm-switch', 'profiles', 'claude'));
    expect(stat.isDirectory()).toBe(true);
    expect((await fs.readdir(path.join(tmpDir, '.llm-switch', 'profiles', 'claude'))).length).toBe(
      0,
    );
  });

  it('rolls back partial migrations on failure', async () => {
    const claudeDir = path.join(tmpDir, '.claude');
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.writeFile(path.join(claudeDir, 'settings.json.glm'), '{}');
    await fs.writeFile(path.join(claudeDir, 'settings.json.bak'), '{}');

    // Make the destination profiles dir read-only to force a rename failure
    const profilesDir = path.join(tmpDir, '.llm-switch', 'profiles', 'claude');
    await fs.mkdir(profilesDir, { recursive: true });
    await fs.chmod(profilesDir, 0o500);

    await expect(ensureMigrated(mockClaudeTarget())).rejects.toThrow();

    // Restore permissions for cleanup
    await fs.chmod(profilesDir, 0o700);

    // Original files should still be in place
    const root = await fs.readdir(claudeDir);
    expect(root).toContain('settings.json.glm');
    expect(root).toContain('settings.json.bak');
  });
});

describe('ALIAS_RE', () => {
  it.each(['glm', 'kimi', 'glm-v2', 'a.b', 'x_y', '123abc'])('accepts valid alias: %s', (alias) => {
    expect(ALIAS_RE.test(alias)).toBe(true);
  });

  it.each(['GLM', '-glm', '.glm', 'glm!', '', 'a'.repeat(65)])(
    'rejects invalid alias: %s',
    (alias) => {
      expect(ALIAS_RE.test(alias)).toBe(false);
    },
  );
});

describe('validateAlias', () => {
  it('returns null for valid alias', () => {
    expect(validateAlias('glm')).toBeNull();
  });

  it('returns error message for invalid alias', () => {
    expect(validateAlias('GLM')).toMatch(/Invalid alias/);
    expect(validateAlias('-glm')).toMatch(/Invalid alias/);
  });
});
