import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import {
  getConfigDir,
  getSettingsPath,
  getBackupPath,
  profilePath,
  ALIAS_RE,
  validateAlias,
} from '../src/config.js';

describe('path resolution', () => {
  const originalEnv = process.env.CLAUDE_CONFIG_DIR;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalEnv;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  });

  it('uses CLAUDE_CONFIG_DIR when set', () => {
    process.env.CLAUDE_CONFIG_DIR = '/tmp/claude-test';
    expect(getConfigDir()).toBe('/tmp/claude-test');
  });

  it('falls back to ~/.claude', () => {
    process.env.HOME = '/Users/alice';
    expect(getConfigDir()).toBe(path.join('/Users/alice', '.claude'));
  });

  it('expands ~ in CLAUDE_CONFIG_DIR', () => {
    process.env.CLAUDE_CONFIG_DIR = '~/my-claude';
    process.env.HOME = '/Users/bob';
    expect(getConfigDir()).toBe(path.join('/Users/bob', 'my-claude'));
  });
});

describe('derived paths', () => {
  it('getSettingsPath joins configDir + settings.json', () => {
    expect(getSettingsPath()).toMatch(/settings\.json$/);
  });

  it('getBackupPath returns settings.json.bak', () => {
    expect(getBackupPath()).toMatch(/settings\.json\.bak$/);
  });

  it('profilePath joins configDir + settings.json.<alias>', () => {
    expect(profilePath('glm')).toMatch(/settings\.json\.glm$/);
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
