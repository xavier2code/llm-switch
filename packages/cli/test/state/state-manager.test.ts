import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { StateManager } from '../../src/state/state-manager.js';

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
});
