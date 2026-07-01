import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/save.js';
import { ProfileStore } from '@llm-switch/core/store/profile-store.js';
import { NoCurrentSettingsError, InvalidAliasError, UserCancelledError } from '../../src/errors.js';
import { mockClaudeTarget } from '../helpers.js';

let tmpDir: string;
let savedEnv: string | undefined;
let store: ProfileStore;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-save-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, 'llm-switch'));
  await fs.writeFile(
    path.join(tmpDir, 'settings.json'),
    JSON.stringify({
      env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_MODEL: 'm', ANTHROPIC_AUTH_TOKEN: 'k' },
    }),
  );
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function io(isTTY = true) {
  const writes: string[] = [];
  return {
    writes,
    stdout: { write: (s: string) => writes.push(s) },
    stderr: { write: (s: string) => writes.push(s) },
    isTTY,
  };
}

describe('save command', () => {
  it('throws NoCurrentSettingsError when active config missing', async () => {
    await fs.rm(path.join(tmpDir, 'settings.json'));
    await expect(run({ targets: [target], alias: 'glm', store, ...io() })).rejects.toBeInstanceOf(
      NoCurrentSettingsError,
    );
  });

  it('throws InvalidAliasError for bad alias', async () => {
    await expect(run({ targets: [target], alias: 'BAD!', store, ...io() })).rejects.toBeInstanceOf(
      InvalidAliasError,
    );
  });

  it('saves active config as a profile', async () => {
    await run({ targets: [target], alias: 'glm', store, ...io() });
    const saved = await store.readProfile(target, 'glm');
    expect(saved).not.toBeNull();
    expect(saved?.baseUrl).toBe('https://x');
  });

  it('overwrites existing profile with --force (no prompt)', async () => {
    await store.writeProfile(target, 'glm', {
      baseUrl: 'https://old',
      model: 'm',
      apiKey: 'k',
      extra: {},
    });
    const confirmFn = vi.fn();
    await run({ targets: [target], alias: 'glm', force: true, store, ...io(true), confirmFn });
    expect(confirmFn).not.toHaveBeenCalled();
    const saved = await store.readProfile(target, 'glm');
    expect(saved?.baseUrl).toBe('https://x');
  });

  it('prompts when overwriting an existing profile (confirm -> overwrite)', async () => {
    await store.writeProfile(target, 'glm', {
      baseUrl: 'https://old',
      model: 'm',
      apiKey: 'k',
      extra: {},
    });
    const confirmFn = vi.fn().mockResolvedValueOnce(true);
    await run({ targets: [target], alias: 'glm', store, ...io(true), confirmFn });
    const saved = await store.readProfile(target, 'glm');
    expect(saved?.baseUrl).toBe('https://x');
  });

  it('decline overwrite -> UserCancelledError, profile unchanged', async () => {
    await store.writeProfile(target, 'glm', {
      baseUrl: 'https://old',
      model: 'm',
      apiKey: 'k',
      extra: {},
    });
    const confirmFn = vi.fn().mockResolvedValueOnce(false);
    await expect(
      run({ targets: [target], alias: 'glm', store, ...io(true), confirmFn }),
    ).rejects.toBeInstanceOf(UserCancelledError);
    const saved = await store.readProfile(target, 'glm');
    expect(saved?.baseUrl).toBe('https://old');
  });

  it('does not prompt when saving a brand-new profile', async () => {
    const confirmFn = vi.fn();
    await run({ targets: [target], alias: 'glm', store, ...io(true), confirmFn });
    expect(confirmFn).not.toHaveBeenCalled();
  });

  it('throws UserCancelledError in non-TTY when profile exists without --force', async () => {
    await store.writeProfile(target, 'glm', {
      baseUrl: 'https://old',
      model: 'm',
      apiKey: 'k',
      extra: {},
    });
    await expect(
      run({ targets: [target], alias: 'glm', store, ...io(false) }),
    ).rejects.toBeInstanceOf(UserCancelledError);
    const saved = await store.readProfile(target, 'glm');
    expect(saved?.baseUrl).toBe('https://old');
  });

  it('lists all affected tools in a single overwrite prompt', async () => {
    const opencode = {
      ...target,
      id: 'opencode',
      displayName: 'OpenCode',
      activeConfigFileName: 'opencode.json',
    } as const;
    // Create a minimal active config for the second target
    await fs.writeFile(
      path.join(tmpDir, 'opencode.json'),
      JSON.stringify({
        env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_MODEL: 'm', ANTHROPIC_AUTH_TOKEN: 'k' },
      }),
    );
    await store.writeProfile(target, 'glm', {
      baseUrl: 'https://old',
      model: 'm',
      apiKey: 'k',
      extra: {},
    });
    await store.writeProfile(opencode, 'glm', {
      baseUrl: 'https://old',
      model: 'm',
      apiKey: 'k',
      extra: {},
    });

    const confirmFn = vi.fn().mockResolvedValueOnce(true);
    await run({ targets: [target, opencode], alias: 'glm', store, ...io(true), confirmFn });
    expect(confirmFn).toHaveBeenCalledTimes(1);
    const callArg = confirmFn.mock.calls[0]?.[0] as { message?: string } | undefined;
    expect(callArg?.message).toContain('Claude Code');
    expect(callArg?.message).toContain('OpenCode');
  });
});
