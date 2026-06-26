import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { summarize } from '../src/display.js';
import { ProfileStore } from '../src/store/profile-store.js';
import { ConfigDirNotFoundError } from '../src/errors.js';
import { mockClaudeTarget } from './helpers.js';

let tmpDir: string;
let savedEnv: string | undefined;
let store: ProfileStore;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-display-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, 'llm-switch'));
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('summarize', () => {
  it('returns source=default when no active config exists', async () => {
    const s = await summarize(target, store);
    expect(s.source).toBe('default');
    expect(s.hasMcp).toBe(false);
    expect(s.baseUrl).toBeUndefined();
    expect(s.model).toBeUndefined();
  });

  it('detects the matching profile by content', async () => {
    await store.writeProfile(target, 'glm', {
      baseUrl: 'https://x',
      model: 'glm-4.5',
      apiKey: 'k',
      extra: {},
    });
    await store.activateProfile(target, 'glm');

    const s = await summarize(target, store);
    expect(s.source).toBe('glm');
    expect(s.baseUrl).toBe('https://x');
    expect(s.model).toBe('glm-4.5');
  });

  it('returns default when active config matches no profile', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.example.com',
          ANTHROPIC_MODEL: 'claude-sonnet-4',
        },
        mcpServers: { foo: { command: 'npx' } },
      }),
    );

    const s = await summarize(target, store);
    expect(s.source).toBe('default');
    expect(s.baseUrl).toBe('https://api.example.com');
    expect(s.model).toBe('claude-sonnet-4');
    expect(s.hasMcp).toBe(true);
  });

  it('throws ConfigDirNotFoundError when the config dir is missing', async () => {
    process.env.CLAUDE_CONFIG_DIR = '/nonexistent/path/12345';
    await expect(summarize(target, store)).rejects.toBeInstanceOf(ConfigDirNotFoundError);
  });
});
