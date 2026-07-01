import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/list.js';
import { ProfileStore } from '@xavier2code/llm-switch-core/store/profile-store.js';
import { mockClaudeTarget } from '../helpers.js';

let tmpDir: string;
let savedEnv: string | undefined;
let store: ProfileStore;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-list-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, 'llm-switch'));
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('list command', () => {
  it('throws when no profiles', async () => {
    await expect(run({ targets: [target], stdout: { write: () => {} }, store })).rejects.toThrow();
  });

  it('lists profiles grouped by target', async () => {
    await store.writeProfile(target, 'glm', {
      baseUrl: 'https://x',
      model: 'm',
      apiKey: 'k',
      extra: {},
    });
    const writes: string[] = [];
    await run({ targets: [target], stdout: { write: (s: string) => writes.push(s) }, store });
    const out = writes.join('');
    expect(out).toContain('Claude Code');
    expect(out).toContain('glm');
  });

  it('sorts active profile first within a target', async () => {
    await store.writeProfile(target, 'alpha', {
      baseUrl: 'https://x',
      model: 'm',
      apiKey: 'k',
      extra: {},
    });
    await store.writeProfile(target, 'work', {
      baseUrl: 'https://x',
      model: 'm',
      apiKey: 'k2',
      extra: {},
    });
    await store.activateProfile(target, 'work');
    const writes: string[] = [];
    await run({ targets: [target], stdout: { write: (s: string) => writes.push(s) }, store });
    const out = writes.join('');
    const workIdx = out.indexOf('work');
    const alphaIdx = out.indexOf('alpha');
    expect(workIdx).toBeGreaterThan(-1);
    expect(alphaIdx).toBeGreaterThan(-1);
    expect(workIdx).toBeLessThan(alphaIdx);
  });
});
