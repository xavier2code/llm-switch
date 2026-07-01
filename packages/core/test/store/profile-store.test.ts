import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ProfileStore } from '@xavier2code/llm-switch-core/store/profile-store.js';
import { getTarget } from '@xavier2code/llm-switch-core/config.js';

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

  it('clears active record when deleting the active profile', async () => {
    const target = getTarget('claude');
    await store.writeProfile(target, 'glm', content);
    await store.activateProfile(target, 'glm');
    expect(await store.readActiveRecord(target)).not.toBeNull();

    await store.deleteProfile(target, 'glm');
    expect(await store.readActiveRecord(target)).toBeNull();
  });

  it('detects drift when active config is modified externally', async () => {
    const target = getTarget('claude');
    await store.writeProfile(target, 'glm', content);
    await store.activateProfile(target, 'glm');

    const adapter = store.adapter(target);
    const activePath = adapter.activePath();
    const raw = await fs.readFile(activePath, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.env.ANTHROPIC_MODEL = 'drifted-model';
    await fs.writeFile(activePath, JSON.stringify(parsed, null, 2));

    const profiles = await store.listProfiles(target);
    const glm = profiles.find((p) => p.alias === 'glm');
    expect(glm?.active).toBe(true);
    expect(glm?.drifted).toBe(true);
  });
});
