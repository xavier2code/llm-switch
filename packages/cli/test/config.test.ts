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
} from '../src/config.js';
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

  it('getBackupPath lives under llm-switch/backups', () => {
    expect(getBackupPath(mockClaudeTarget())).toMatch(/llm-switch\/backups\/settings\.json\.bak$/);
  });

  it('profilePath lives under llm-switch/profiles and uses .json', () => {
    expect(profilePath('glm', mockClaudeTarget())).toMatch(/llm-switch\/profiles\/glm\.json$/);
  });

  it('getProfilesDir returns the profiles subdirectory', () => {
    expect(getProfilesDir(mockClaudeTarget())).toMatch(/llm-switch\/profiles$/);
  });
});

describe('migration', () => {
  let tmpDir: string;
  const originalEnv = process.env.CLAUDE_CONFIG_DIR;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
    process.env.CLAUDE_CONFIG_DIR = tmpDir;
  });

  afterEach(async () => {
    if (originalEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalEnv;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('migrates old flat-layout profiles and backup', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.kimi'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.bak'), '{}');

    await ensureMigrated(mockClaudeTarget());

    const profiles = await fs.readdir(path.join(tmpDir, 'llm-switch', 'profiles'));
    expect(profiles.sort()).toEqual(['glm.json', 'kimi.json']);
    const backups = await fs.readdir(path.join(tmpDir, 'llm-switch', 'backups'));
    expect(backups).toEqual(['settings.json.bak']);
    const root = await fs.readdir(tmpDir);
    expect(root).not.toContain('settings.json.glm');
    expect(root).not.toContain('settings.json.bak');
  });

  it('creates new directories when no old files exist', async () => {
    await ensureMigrated(mockClaudeTarget());

    const stat = await fs.stat(path.join(tmpDir, 'llm-switch', 'profiles'));
    expect(stat.isDirectory()).toBe(true);
    expect((await fs.readdir(path.join(tmpDir, 'llm-switch', 'profiles'))).length).toBe(0);
  });

  it('is a no-op when already migrated', async () => {
    await fs.mkdir(path.join(tmpDir, 'llm-switch', 'profiles'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');

    await ensureMigrated(mockClaudeTarget());

    const root = await fs.readdir(tmpDir);
    expect(root).toContain('settings.json.glm');
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
