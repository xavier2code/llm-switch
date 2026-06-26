import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { selectTargets } from '../src/target-selector.js';
import { StateManager } from '../src/state/state-manager.js';
import { type TargetId } from '../src/config.js';

let tmpDir: string;
let stateManager: StateManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-selector-'));
  stateManager = new StateManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('selectTargets', () => {
  it('uses --target flag exactly', async () => {
    const result = await selectTargets({
      flag: 'codex',
      isTTY: false,
      stateManager,
    });
    expect(result.targets.map((t) => t.id)).toEqual(['codex']);
    expect(result.source).toBe('flag');
  });

  it('throws on unknown flag target', async () => {
    await expect(selectTargets({ flag: 'unknown', isTTY: false, stateManager })).rejects.toThrow(
      /Unknown target/,
    );
  });

  it('uses state in non-TTY', async () => {
    await stateManager.write({ version: 1, lastSelectedTargets: ['opencode'] });
    const result = await selectTargets({ flag: undefined, isTTY: false, stateManager });
    expect(result.targets.map((t) => t.id)).toEqual(['opencode']);
    expect(result.source).toBe('state');
  });

  it('falls back to default when state missing and non-TTY', async () => {
    const result = await selectTargets({ flag: undefined, isTTY: false, stateManager });
    expect(result.targets.map((t) => t.id)).toEqual(['claude']);
    expect(result.source).toBe('default');
  });

  it('default fallback honors LLM_SWITCH_TARGET', async () => {
    const saved = process.env.LLM_SWITCH_TARGET;
    process.env.LLM_SWITCH_TARGET = 'opencode';
    try {
      const result = await selectTargets({ flag: undefined, isTTY: false, stateManager });
      expect(result.targets.map((t) => t.id)).toEqual(['opencode']);
      expect(result.source).toBe('default');
    } finally {
      if (saved === undefined) delete process.env.LLM_SWITCH_TARGET;
      else process.env.LLM_SWITCH_TARGET = saved;
    }
  });

  it('returns interactive selection in TTY', async () => {
    const checkboxFn = vi.fn().mockResolvedValue(['claude', 'codex'] as TargetId[]);
    const result = await selectTargets({
      flag: undefined,
      isTTY: true,
      stateManager,
      checkboxFn,
      detectFn: () => ({ claude: true, opencode: false, codex: true }) as Record<TargetId, boolean>,
    });
    expect(result.targets.map((t) => t.id)).toEqual(['claude', 'codex']);
    expect(result.source).toBe('interactive');
  });

  it('persists interactive selection to state', async () => {
    const checkboxFn = vi.fn().mockResolvedValue(['codex'] as TargetId[]);
    await selectTargets({
      flag: undefined,
      isTTY: true,
      stateManager,
      checkboxFn,
      detectFn: () => ({ claude: true, opencode: false, codex: true }) as Record<TargetId, boolean>,
    });
    const state = await stateManager.read();
    expect(state.lastSelectedTargets).toEqual(['codex']);
  });

  it('throws when interactive selection is empty', async () => {
    const checkboxFn = vi.fn().mockResolvedValue([] as TargetId[]);
    await expect(
      selectTargets({
        flag: undefined,
        isTTY: true,
        stateManager,
        checkboxFn,
        detectFn: () =>
          ({ claude: true, opencode: false, codex: true }) as Record<TargetId, boolean>,
      }),
    ).rejects.toThrow(/No targets selected/);
  });
});
