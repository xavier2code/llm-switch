import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exists } from '../fs-utils.js';
import type { TargetId } from '../config.js';

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
    await fs.mkdir(this.dir, { recursive: true });
    const p = this.filePath();
    await fs.writeFile(p, JSON.stringify(state, null, 2));
    await fs.chmod(p, 0o600);
  }
}

export function defaultStateDir(): string {
  return path.join(process.env.HOME ?? os.homedir(), '.config', 'llm-switch');
}

export function migrateState(raw: unknown): State {
  const state = raw as Partial<State>;
  return {
    version: state.version ?? DEFAULT_STATE.version,
    lastSelectedTargets: Array.isArray(state.lastSelectedTargets)
      ? (state.lastSelectedTargets as TargetId[])
      : [...DEFAULT_STATE.lastSelectedTargets],
  };
}
