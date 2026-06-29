import { checkbox } from '@inquirer/prompts';
import {
  TARGETS,
  getDefaultTarget,
  getTarget,
  isTargetId,
  type TargetConfig,
  type TargetId,
} from '@llm-switch/core/config.js';
import { AppError, UserCancelledError } from './errors.js';
import { isCancel } from './ui.js';
import type { StateManager } from './state/state-manager.js';
import { detectInstalledTargets } from '@llm-switch/core/detector.js';

export interface TargetSelectionResult {
  targets: TargetConfig[];
  source: 'flag' | 'interactive' | 'state' | 'default';
}

export interface TargetSelectorOptions {
  flag?: string;
  isTTY: boolean;
  stateManager: StateManager;
  detectFn?: () => Promise<Record<TargetId, boolean>>;
  checkboxFn?: typeof checkbox;
}

export async function selectTargets(
  options: TargetSelectorOptions,
): Promise<TargetSelectionResult> {
  const { flag, isTTY, stateManager, detectFn, checkboxFn } = options;

  if (flag) {
    const id = flag.trim();
    if (!isTargetId(id)) {
      throw new AppError(
        `Unknown target '${id}'. Must be one of: ${TARGETS.map((t) => t.id).join(', ')}`,
        'UNKNOWN_TARGET',
      );
    }
    return { targets: [getTarget(id)], source: 'flag' };
  }

  if (isTTY) {
    const state = await stateManager.read();
    const installed = await (detectFn ? detectFn() : detectInstalledTargets());
    const selectFn = checkboxFn ?? checkbox;
    const result = (await selectFn({
      message: 'Select targets:',
      choices: TARGETS.map((t) => ({
        name: installed[t.id] ? t.displayName : `${t.displayName} (not installed)`,
        value: t.id,
        checked: state.lastSelectedTargets.includes(t.id),
      })),
    })) as unknown[] | undefined;

    if (isCancel(result)) {
      throw new UserCancelledError('Cancelled.');
    }
    const ids = (result ?? []).filter(isTargetId);
    if (ids.length === 0) {
      throw new UserCancelledError('No targets selected.');
    }
    await stateManager.write({ ...state, lastSelectedTargets: ids });
    return { targets: ids.map(getTarget), source: 'interactive' };
  }

  const hasState = await stateManager.exists();
  const state = await stateManager.read();
  if (hasState && state.lastSelectedTargets.length > 0) {
    return { targets: state.lastSelectedTargets.map(getTarget), source: 'state' };
  }

  // No flag, no TTY, no remembered selection: fall back to the default target,
  // which honors LLM_SWITCH_TARGET (set it to opencode/codex to change the
  // default tool in scripts and CI).
  return { targets: [getDefaultTarget()], source: 'default' };
}
