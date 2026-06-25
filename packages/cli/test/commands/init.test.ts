import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runInitWizard } from '../../src/commands/init.js';
import { UserCancelledError } from '../../src/errors.js';
import { getActiveConfigPath, type TargetId } from '../../src/config.js';
import { mockClaudeTarget } from '../helpers.js';

let tmpDir: string;
let savedClaude: string | undefined;
let savedOpencode: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-init-'));
  savedClaude = process.env.CLAUDE_CONFIG_DIR;
  savedOpencode = process.env.OPENCODE_CONFIG_DIR;
  // Point both targets at the same temp dir so assertions are easy.
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  process.env.OPENCODE_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  if (savedClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedClaude;
  if (savedOpencode === undefined) delete process.env.OPENCODE_CONFIG_DIR;
  else process.env.OPENCODE_CONFIG_DIR = savedOpencode;
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

  it('prints detection status for both tools', async () => {
    const detectFn = () => ({ claude: true, opencode: false }) as Record<TargetId, boolean>;
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    const out = io.writes.join('');
    expect(out).toContain('Claude Code');
    expect(out).toContain('OpenCode');
  });

  it('warns when no tool is installed', async () => {
    const detectFn = () => ({ claude: false, opencode: false }) as Record<TargetId, boolean>;
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    expect(io.writes.join('')).toMatch(/no supported CLI tool detected/i);
  });

  it('creates llm-switch dirs for the selected target', async () => {
    const detectFn = () => ({ claude: true, opencode: true }) as Record<TargetId, boolean>;
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    const stat = await fs.stat(path.join(tmpDir, 'llm-switch', 'profiles'));
    expect(stat.isDirectory()).toBe(true);
    expect((await fs.stat(path.join(tmpDir, 'llm-switch', 'backups'))).isDirectory()).toBe(true);
  });

  it('warns when an active config is missing but still initializes', async () => {
    const detectFn = () => ({ claude: true, opencode: true }) as Record<TargetId, boolean>;
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    // No settings.json written -> missing.
    await runInitWizard(io);
    expect(io.writes.join('')).toMatch(/active config not found/i);
    expect((await fs.stat(path.join(tmpDir, 'llm-switch', 'profiles'))).isDirectory()).toBe(true);
  });

  it('does not warn when the active config exists', async () => {
    await fs.writeFile(getActiveConfigPath(mockClaudeTarget()), '{}');
    const detectFn = () => ({ claude: true, opencode: true }) as Record<TargetId, boolean>;
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    expect(io.writes.join('')).not.toMatch(/active config not found/i);
  });

  it('throws UserCancelledError when no tool is selected', async () => {
    const detectFn = () => ({ claude: true, opencode: true }) as Record<TargetId, boolean>;
    const checkboxFn = vi.fn().mockResolvedValue([] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await expect(runInitWizard(io)).rejects.toBeInstanceOf(UserCancelledError);
  });

  it('labels not-installed choices and leaves them unchecked', async () => {
    const detectFn = () => ({ claude: false, opencode: true }) as Record<TargetId, boolean>;
    const checkboxFn = vi.fn().mockResolvedValue(['opencode'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    const arg = checkboxFn.mock.calls[0]?.[0] as {
      choices: Array<{ name: string; checked: boolean }>;
    };
    const claudeChoice = arg.choices.find((c) => c.name.startsWith('Claude'));
    expect(claudeChoice?.name).toMatch(/not installed/i);
    expect(claudeChoice?.checked).toBe(false);
  });

  it('prints a completion summary', async () => {
    await fs.writeFile(getActiveConfigPath(mockClaudeTarget()), '{}');
    const detectFn = () => ({ claude: true, opencode: true }) as Record<TargetId, boolean>;
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    expect(io.writes.join('')).toMatch(/Initialized llm-switch/);
  });
});
