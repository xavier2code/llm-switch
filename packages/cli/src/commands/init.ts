import type { Writable } from 'node:stream';
import { checkbox } from '@inquirer/prompts';
import {
  TARGETS,
  ensureMigrated,
  getActiveConfigPath,
  getLlmswitchDir,
  getTarget,
  type TargetId,
} from '../config.js';
import { detectInstalledTargets } from '../detector.js';
import { exists } from '../fs-utils.js';
import { UserCancelledError } from '../errors.js';
import { INTERACTIVE_TTY_REQUIRED } from '../messages.js';

export interface InitIO {
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  checkboxFn?: typeof checkbox;
  detectFn?: () => Record<TargetId, boolean>;
}

export async function runInitWizard(io: InitIO): Promise<void> {
  if (!io.isTTY) {
    throw new UserCancelledError(INTERACTIVE_TTY_REQUIRED);
  }

  const detect = io.detectFn ?? detectInstalledTargets;
  const installed = detect();

  // 1. Detection status table.
  io.stdout.write('Detected CLI tools:\n');
  for (const target of TARGETS) {
    const status = installed[target.id] ? 'installed' : 'not installed';
    io.stdout.write(
      `  ${target.displayName.padEnd(12)} ${status.padEnd(14)} ${getActiveConfigPath(target)}\n`,
    );
  }
  io.stdout.write('\n');

  // 2. Warn if nothing is installed (still continue).
  if (!TARGETS.some((t) => installed[t.id])) {
    io.stderr.write(
      'Warning: no supported CLI tool detected on PATH. Install Claude Code or OpenCode first.\n\n',
    );
  }

  // 3. Multi-select which tools to manage.
  const checkboxFn = io.checkboxFn ?? checkbox;
  const choice = (await checkboxFn({
    message: 'Which tools should llm-switch manage? (Space to toggle)',
    choices: TARGETS.map((t) => ({
      name: installed[t.id] ? t.displayName : `${t.displayName} (not installed)`,
      value: t.id,
      checked: installed[t.id],
    })),
  })) as TargetId[];

  if (choice.length === 0) {
    throw new UserCancelledError('No tools selected.');
  }

  // 4. Per selected tool: warn if active config missing, then init dirs.
  const selected = choice.map((id) => getTarget(id));
  for (const target of selected) {
    const active = getActiveConfigPath(target);
    if (!(await exists(active))) {
      io.stderr.write(
        `Warning: ${target.displayName} active config not found at ${active}. Run ${target.displayName} once to create it.\n`,
      );
    }
    await ensureMigrated(target);
  }

  // 5. Completion summary.
  io.stdout.write('\nInitialized llm-switch for:\n');
  for (const target of selected) {
    const found = await exists(getActiveConfigPath(target));
    io.stdout.write(
      `  ${target.displayName}: ${getLlmswitchDir(target)} (active config ${found ? 'found' : 'missing'})\n`,
    );
  }
}
