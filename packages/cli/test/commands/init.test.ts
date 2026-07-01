import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runInitWizard, maybeRunInitWizard } from '../../src/commands/init.js';
import { UserCancelledError } from '@llm-switch/core';
import { getActiveConfigPath, getTarget, type TargetId } from '@llm-switch/core/config.js';
import { StateManager } from '@llm-switch/core/state/index.js';
import { defaultBaseDir } from '@llm-switch/core/store/profile-store.js';

let tmpDir: string;
let savedClaude: string | undefined;
let savedOpencode: string | undefined;
let savedCodex: string | undefined;
let savedHome: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-init-'));
  savedClaude = process.env.CLAUDE_CONFIG_DIR;
  savedOpencode = process.env.OPENCODE_CONFIG_DIR;
  savedCodex = process.env.CODEX_HOME;
  savedHome = process.env.HOME;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  process.env.OPENCODE_CONFIG_DIR = tmpDir;
  process.env.CODEX_HOME = tmpDir;
  process.env.HOME = tmpDir;
});

afterEach(async () => {
  if (savedClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedClaude;
  if (savedOpencode === undefined) delete process.env.OPENCODE_CONFIG_DIR;
  else process.env.OPENCODE_CONFIG_DIR = savedOpencode;
  if (savedCodex === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = savedCodex;
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function mockIO() {
  const writes: string[] = [];
  return {
    writes,
    stdout: { write: (s: string) => void writes.push(s) },
    stderr: { write: (s: string) => void writes.push(s) },
  };
}

describe('runInitWizard', () => {
  it('throws UserCancelledError when not TTY', async () => {
    const io = { ...mockIO(), isTTY: false };
    await expect(runInitWizard(io)).rejects.toBeInstanceOf(UserCancelledError);
  });

  it('prints detection status for the tools', async () => {
    const detectFn = async () =>
      ({ claude: true, opencode: false, codex: false }) as Record<TargetId, boolean>;
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    const out = io.writes.join('');
    expect(out).toContain('Claude Code');
  });

  it('creates centralized profile dirs and writes state', async () => {
    const detectFn = async () =>
      ({ claude: true, opencode: false, codex: false }) as Record<TargetId, boolean>;
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);

    const baseDir = defaultBaseDir();
    const stat = await fs.stat(path.join(baseDir, 'profiles', 'claude'));
    expect(stat.isDirectory()).toBe(true);

    const state = await new StateManager(baseDir).read();
    expect(state.lastSelectedTargets).toEqual(['claude']);
  });

  it('warns when no tool is installed', async () => {
    const detectFn = async () =>
      ({ claude: false, opencode: false, codex: false }) as Record<TargetId, boolean>;
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    expect(io.writes.join('')).toMatch(/no supported CLI tool detected/i);
  });

  it('throws UserCancelledError when no tool is selected', async () => {
    const detectFn = async () =>
      ({ claude: true, opencode: true, codex: true }) as Record<TargetId, boolean>;
    const checkboxFn = vi.fn().mockResolvedValue([] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await expect(runInitWizard(io)).rejects.toBeInstanceOf(UserCancelledError);
  });

  it('warns when an active config is missing but still initializes', async () => {
    const detectFn = async () =>
      ({ claude: true, opencode: true, codex: true }) as Record<TargetId, boolean>;
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    expect(io.writes.join('')).toMatch(/active config not found/i);
  });

  it('does not warn when the active config exists', async () => {
    await fs.writeFile(getActiveConfigPath(getTarget('claude')), '{}');
    const detectFn = async () =>
      ({ claude: true, opencode: true, codex: true }) as Record<TargetId, boolean>;
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    expect(io.writes.join('')).not.toMatch(/active config not found/i);
  });

  it('initializes directories for every selected tool (multi-select)', async () => {
    const detectFn = async () =>
      ({ claude: true, opencode: true, codex: true }) as Record<TargetId, boolean>;
    const checkboxFn = vi.fn().mockResolvedValue(['claude', 'codex'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    const baseDir = defaultBaseDir();
    expect((await fs.stat(path.join(baseDir, 'profiles', 'claude'))).isDirectory()).toBe(true);
    expect((await fs.stat(path.join(baseDir, 'profiles', 'codex'))).isDirectory()).toBe(true);
    const state = await new StateManager(baseDir).read();
    expect(state.lastSelectedTargets).toEqual(['claude', 'codex']);
  });
});

describe('maybeRunInitWizard', () => {
  it('is a no-op in a non-TTY (test) environment', async () => {
    // process.stdout.isTTY is undefined under vitest -> early return.
    await expect(maybeRunInitWizard(getTarget('claude'))).resolves.toBeUndefined();
  });

  it('is a no-op when the centralized store is already initialized', async () => {
    await fs.mkdir(defaultBaseDir(), { recursive: true });
    const original = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    try {
      // Would hang on the real checkbox if it ran; the existing dir must short-circuit.
      await expect(maybeRunInitWizard(getTarget('claude'))).resolves.toBeUndefined();
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: original, configurable: true });
    }
  });
});
