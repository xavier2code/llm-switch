import type { Writable } from 'node:stream';
import fs from 'node:fs/promises';
import { checkbox } from '@inquirer/prompts';
import {
  TARGETS,
  getActiveConfigPath,
  getTarget,
  type TargetConfig,
  type TargetId,
} from '@llm-switch/core/config.js';
import { detectInstalledTargets } from '@llm-switch/core/detector.js';
import { exists } from '../fs-utils.js';
import { UserCancelledError } from '../errors.js';
import { INTERACTIVE_TTY_REQUIRED } from '../messages.js';
import { isInquirerCancelError } from '../ui.js';
import { StateManager } from '../state/state-manager.js';
import { ProfileStore, defaultBaseDir } from '../store/profile-store.js';
import { ensureMigratedToCentralStore } from '@llm-switch/core/migrate.js';

export interface InitIO {
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  checkboxFn?: typeof checkbox;
  detectFn?: () => Promise<Record<TargetId, boolean>>;
  selectAllDetected?: boolean;
}

export async function runInitWizard(io: InitIO): Promise<void> {
  const baseDir = defaultBaseDir();
  const store = new ProfileStore(baseDir);
  const stateManager = new StateManager(baseDir);

  const detect = io.detectFn ?? detectInstalledTargets;
  const installed = await detect();

  io.stdout.write('Detected CLI tools:\n');
  for (const target of TARGETS) {
    const status = installed[target.id] ? 'installed' : 'not installed';
    io.stdout.write(
      `  ${target.displayName.padEnd(12)} ${status.padEnd(14)} ${getActiveConfigPath(target)}\n`,
    );
  }
  io.stdout.write('\n');

  if (!TARGETS.some((t) => installed[t.id])) {
    io.stderr.write(
      'Warning: no supported CLI tool detected on PATH. Install Claude Code, OpenCode, or Codex first.\n\n',
    );
  }

  let choice: TargetId[];
  if (io.selectAllDetected) {
    choice = TARGETS.filter((t) => installed[t.id]).map((t) => t.id);
  } else {
    if (!io.isTTY) {
      throw new UserCancelledError(INTERACTIVE_TTY_REQUIRED);
    }
    const checkboxFn = io.checkboxFn ?? checkbox;
    const result = (await checkboxFn({
      message: 'Which tools should llm-switch manage? (Space to toggle)',
      choices: TARGETS.map((t) => ({
        name: installed[t.id] ? t.displayName : `${t.displayName} (not installed)`,
        value: t.id,
        checked: installed[t.id],
      })),
    })) as TargetId[];
    choice = result;
  }

  if (choice.length === 0) {
    throw new UserCancelledError('No tools selected.');
  }

  await ensureMigratedToCentralStore(baseDir, TARGETS);

  const selected = choice.map((id) => getTarget(id));
  for (const target of selected) {
    await fs.mkdir(store.profileDir(target), { recursive: true });
    const active = getActiveConfigPath(target);
    if (!(await exists(active))) {
      io.stderr.write(
        `Warning: ${target.displayName} active config not found at ${active}. Run ${target.displayName} once to create it. Run \`sw create\` to set one up.\n`,
      );
    }
  }

  await stateManager.write({ version: 1, lastSelectedTargets: choice });

  io.stdout.write('\nInitialized llm-switch for:\n');
  for (const target of selected) {
    const found = await exists(getActiveConfigPath(target));
    io.stdout.write(
      `  ${target.displayName}: ${store.profileDir(target)} (active config ${found ? 'found' : 'missing'})\n`,
    );
  }
}

/**
 * Auto-trigger gate. Runs the wizard once on first TTY use when the
 * centralized store does not yet exist, then stays silent. Never runs outside
 * a TTY, so CI/scripts are unaffected.
 */
export async function maybeRunInitWizard(_target: TargetConfig): Promise<void> {
  if (!process.stdout.isTTY) return;
  const baseDir = defaultBaseDir();
  if (await exists(baseDir)) return;
  try {
    await runInitWizard({
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: true,
    });
  } catch (err) {
    if (err instanceof UserCancelledError) return;
    if (isInquirerCancelError(err)) return;
    throw err;
  }
}
