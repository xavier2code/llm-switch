import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteJson, exists } from '../fs-utils.js';
import { homeDir, isTargetId, type TargetId } from '@llm-switch/core/config.js';

export interface State {
  version: number;
  lastSelectedTargets: TargetId[];
}

export const DEFAULT_STATE: State = {
  version: 1,
  lastSelectedTargets: ['claude'],
};

export class StateManager {
  readonly dir: string;

  constructor(dir: string = defaultStateDir()) {
    this.dir = dir;
  }

  private filePath(): string {
    return path.join(this.dir, 'state.json');
  }

  async exists(): Promise<boolean> {
    return exists(this.filePath());
  }

  async read(): Promise<State> {
    const p = this.filePath();
    if (!(await exists(p))) return { ...DEFAULT_STATE };
    const raw = await fs.readFile(p, 'utf8');
    return migrateState(JSON.parse(raw));
  }

  async write(state: State): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    const p = this.filePath();
    await atomicWriteJson(p, state, { mode: 0o600, tmpPrefix: '.state.' });
  }
}

export function defaultStateDir(): string {
  return path.join(homeDir(), '.llm-switch');
}

export function migrateState(raw: unknown): State {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATE };
  const state = raw as Partial<State>;
  const targets = Array.isArray(state.lastSelectedTargets) ? state.lastSelectedTargets : [];
  const validTargets = targets.filter((id): id is TargetId => isTargetId(id));
  return {
    version: state.version ?? DEFAULT_STATE.version,
    lastSelectedTargets:
      validTargets.length > 0 ? validTargets : [...DEFAULT_STATE.lastSelectedTargets],
  };
}
