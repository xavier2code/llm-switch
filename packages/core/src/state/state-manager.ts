import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteJson, cleanupStaleTmp, exists } from '../fs-utils.js';
import { homeDir, isTargetId, type TargetId } from '../config.js';

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
    if (!(await exists(p))) return cloneState(DEFAULT_STATE);
    const raw = await fs.readFile(p, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Corrupt state file at ${p}: invalid JSON`);
    }
    return migrateState(parsed);
  }

  async write(state: State): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    await fs.chmod(this.dir, 0o700).catch(() => {
      // Ignore if the directory does not exist or permissions cannot be changed.
    });
    const p = this.filePath();
    await atomicWriteJson(p, state, { mode: 0o600, tmpPrefix: '.state.', fsync: true });
    await cleanupStaleTmp(this.dir, '.state.');
  }
}

export function defaultStateDir(): string {
  return path.join(homeDir(), '.llm-switch');
}

export function migrateState(raw: unknown): State {
  if (!raw || typeof raw !== 'object') return cloneState(DEFAULT_STATE);
  const state = raw as Partial<State>;
  const targets = Array.isArray(state.lastSelectedTargets) ? state.lastSelectedTargets : [];
  const validTargets = targets.filter((id): id is TargetId => isTargetId(id));
  return {
    version: state.version ?? DEFAULT_STATE.version,
    lastSelectedTargets:
      validTargets.length > 0 ? validTargets : [...DEFAULT_STATE.lastSelectedTargets],
  };
}

function cloneState(state: State): State {
  return { ...state, lastSelectedTargets: [...state.lastSelectedTargets] };
}
