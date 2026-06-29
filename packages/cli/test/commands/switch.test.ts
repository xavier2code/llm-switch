import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/switch.js';
import { ProfileStore } from '@llm-switch/core/store/profile-store.js';
import { ProfileNotFoundError, UserCancelledError, InvalidAliasError } from '../../src/errors.js';
import { mockClaudeTarget, mockOpencodeTarget } from '../helpers.js';

let tmpDir: string;
let savedClaudeEnv: string | undefined;
let savedOpencodeEnv: string | undefined;
let store: ProfileStore;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-switch-'));
  savedClaudeEnv = process.env.CLAUDE_CONFIG_DIR;
  savedOpencodeEnv = process.env.OPENCODE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, 'central', 'llm-switch'));
});

afterEach(async () => {
  if (savedClaudeEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedClaudeEnv;
  if (savedOpencodeEnv === undefined) delete process.env.OPENCODE_CONFIG_DIR;
  else process.env.OPENCODE_CONFIG_DIR = savedOpencodeEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function mockIO() {
  const writes: string[] = [];
  return {
    writes,
    stdout: { write: (s: string) => writes.push(s) },
    stderr: { write: (s: string) => writes.push(s) },
  };
}

describe('switch command', () => {
  it('switches single target by alias', async () => {
    await store.writeProfile(target, 'glm', {
      baseUrl: 'https://x',
      model: 'm',
      apiKey: 'k',
      extra: {},
    });
    const io = mockIO();
    await run({ targets: [target], alias: 'glm', store, ...io, isTTY: true });
    expect(io.writes.join('')).toContain('Switched to glm');
  });

  it('throws ProfileNotFoundError when alias missing for all targets', async () => {
    const io = mockIO();
    await expect(
      run({ targets: [target], alias: 'nope', store, ...io, isTTY: true }),
    ).rejects.toBeInstanceOf(ProfileNotFoundError);
  });

  it('throws InvalidAliasError for bad alias', async () => {
    const io = mockIO();
    await expect(
      run({ targets: [target], alias: 'BAD!', store, ...io, isTTY: true }),
    ).rejects.toBeInstanceOf(InvalidAliasError);
  });

  it('throws UserCancelledError when interactive and no TTY', async () => {
    await store.writeProfile(target, 'glm', {
      baseUrl: 'https://x',
      model: 'm',
      apiKey: 'k',
      extra: {},
    });
    const io = mockIO();
    await expect(
      run({ targets: [target], alias: undefined, store, ...io, isTTY: false }),
    ).rejects.toBeInstanceOf(UserCancelledError);
  });

  it('auto-creates a missing same-family profile from another target', async () => {
    const opencode = mockOpencodeTarget();
    const opencodeConfigDir = path.join(tmpDir, 'opencode');
    process.env.OPENCODE_CONFIG_DIR = opencodeConfigDir;
    await fs.mkdir(opencodeConfigDir, { recursive: true });
    await store.writeProfile(target, 'glm', {
      baseUrl: 'https://x',
      model: 'm',
      apiKey: 'k',
      extra: {},
    });
    const io = mockIO();
    await run({
      targets: [target, opencode],
      alias: 'glm',
      store,
      ...io,
      isTTY: true,
    });
    const out = io.writes.join('');
    expect(out).toContain('Auto-created');
    // opencode profile now exists in the central store
    expect(await store.readProfile(opencode, 'glm')).not.toBeNull();
  });
});
