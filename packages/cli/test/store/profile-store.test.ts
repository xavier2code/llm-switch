import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ProfileStore } from '../../src/store/profile-store.js';
import { getTarget } from '@llm-switch/core/config.js';

let tmpDir: string;
let store: ProfileStore;
let savedClaude: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-store-'));
  savedClaude = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, 'llm-switch'));
});

afterEach(async () => {
  if (savedClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedClaude;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const content = {
  baseUrl: 'https://example.com',
  model: 'm',
  apiKey: 'k',
  extra: {},
};

describe('ProfileStore', () => {
  it('writes and reads profiles', async () => {
    await store.writeProfile(getTarget('claude'), 'glm', content);
    const read = await store.readProfile(getTarget('claude'), 'glm');
    expect(read).toEqual(content);
  });

  it('lists profiles and marks active', async () => {
    const target = getTarget('claude');
    await store.writeProfile(target, 'glm', content);
    await store.writeProfile(target, 'kimi', { ...content, model: 'k2' });
    await store.activateProfile(target, 'glm');

    const profiles = await store.listProfiles(target);
    const glm = profiles.find((p) => p.alias === 'glm');
    const kimi = profiles.find((p) => p.alias === 'kimi');
    expect(glm?.active).toBe(true);
    expect(kimi?.active).toBe(false);
  });

  it('deletes profile', async () => {
    await store.writeProfile(getTarget('claude'), 'glm', content);
    await store.deleteProfile(getTarget('claude'), 'glm');
    const read = await store.readProfile(getTarget('claude'), 'glm');
    expect(read).toBeNull();
  });
});
