import { describe, it, expect } from 'vitest';
import * as schemas from '../src/schemas.js';
import { SettingsSchema, parseSettings } from '../src/schemas.js';

describe('SettingsSchema', () => {
  it('accepts empty object', () => {
    expect(() => SettingsSchema.parse({})).not.toThrow();
  });

  it('accepts full valid config', () => {
    const cfg = {
      env: {
        ANTHROPIC_BASE_URL: 'https://api.example.com',
        ANTHROPIC_MODEL: 'claude-sonnet-4',
      },
      mcpServers: {
        foo: { command: 'npx', args: ['-y', 'foo'] },
      },
    };
    expect(() => SettingsSchema.parse(cfg)).not.toThrow();
  });

  it('rejects invalid env types', () => {
    expect(() => SettingsSchema.parse({ env: 42 })).toThrow();
  });
});

describe('parseSettings', () => {
  it('returns parsed object for valid JSON', () => {
    const json = '{"env":{"ANTHROPIC_BASE_URL":"https://x"}}';
    const result = parseSettings(json);
    expect(result.env?.ANTHROPIC_BASE_URL).toBe('https://x');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseSettings('not json')).toThrow();
  });
});

describe('schemas module surface', () => {
  it('does not export parseSettingsSafe (dead code)', () => {
    expect('parseSettingsSafe' in schemas).toBe(false);
  });

  it('exposes parseSettings and SettingsSchema only', () => {
    expect(Object.keys(schemas).sort()).toEqual(['SettingsSchema', 'parseSettings']);
  });
});
