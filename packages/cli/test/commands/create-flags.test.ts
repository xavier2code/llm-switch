import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/create.js';
import { ProfileStore } from '@llm-switch/core/store/profile-store.js';
import { UserCancelledError } from '@llm-switch/core';
import { mockClaudeTarget } from '../helpers.js';

let tmpDir: string;
let savedEnv: string | undefined;
let store: ProfileStore;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-create-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, 'llm-switch'));
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function io() {
  const writes: string[] = [];
  return {
    writes,
    stdout: { write: (s: string) => writes.push(s) },
    stderr: { write: (s: string) => writes.push(s) },
    isTTY: false,
  };
}

describe('create command non-interactive flags', () => {
  it('creates profile with all required flags', async () => {
    const writes = io();
    await run({
      targets: [target],
      store,
      ...writes,
      providerId: 'glm',
      alias: 'glm',
      apiKey: 'sk-test',
      skipValidation: true,
    });
    const profile = await store.readProfile(target, 'glm');
    expect(profile).not.toBeNull();
    expect(profile?.baseUrl).toBe('https://open.bigmodel.cn/api/anthropic');
    expect(profile?.model).toBe('glm-4.5');
  });

  it('reads API key from --api-key-env', async () => {
    process.env.MY_SECRET_KEY = 'sk-from-env';
    const writes = io();
    await run({
      targets: [target],
      store,
      ...writes,
      providerId: 'glm',
      alias: 'glm',
      apiKeyEnv: 'MY_SECRET_KEY',
      skipValidation: true,
    });
    const profile = await store.readProfile(target, 'glm');
    expect(profile?.apiKey).toBe('sk-from-env');
    delete process.env.MY_SECRET_KEY;
  });

  it('throws when --api-key-env variable is missing', async () => {
    const writes = io();
    await expect(
      run({
        targets: [target],
        store,
        ...writes,
        providerId: 'glm',
        alias: 'glm',
        apiKeyEnv: 'MISSING_KEY_VAR',
        skipValidation: true,
      }),
    ).rejects.toBeInstanceOf(UserCancelledError);
  });
});
