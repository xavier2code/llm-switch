import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { StateManager } from '@llm-switch/core/state/index.js';

let tmpDir: string;
let manager: StateManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-state-'));
  manager = new StateManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('StateManager', () => {
  it('returns default state when file missing', async () => {
    const state = await manager.read();
    expect(state.version).toBe(1);
    expect(state.lastSelectedTargets).toEqual(['claude']);
  });

  it('writes and reads state', async () => {
    await manager.write({ version: 1, lastSelectedTargets: ['claude', 'codex'] });
    const state = await manager.read();
    expect(state.lastSelectedTargets).toEqual(['claude', 'codex']);
  });

  it('reads default state when file contains invalid JSON', async () => {
    await fs.writeFile(path.join(tmpDir, 'state.json'), '{not json');
    await expect(manager.read()).rejects.toThrow();
  });

  it('filters invalid target ids from persisted state', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'state.json'),
      JSON.stringify({ version: 1, lastSelectedTargets: ['claude', 'not-a-target', 'codex'] }),
    );
    const state = await manager.read();
    expect(state.lastSelectedTargets).toEqual(['claude', 'codex']);
  });

  it('falls back to default when file contains non-object JSON', async () => {
    await fs.writeFile(path.join(tmpDir, 'state.json'), '"string"');
    const state = await manager.read();
    expect(state).toEqual({ version: 1, lastSelectedTargets: ['claude'] });
  });

  it('falls back to default when file contains null JSON', async () => {
    await fs.writeFile(path.join(tmpDir, 'state.json'), 'null');
    const state = await manager.read();
    expect(state).toEqual({ version: 1, lastSelectedTargets: ['claude'] });
  });
});
