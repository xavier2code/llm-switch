import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { log } from './logger.js';
import { toExitCode } from './exit.js';
import { AppError } from '@llm-switch/core';
import { isInquirerCancelError } from './ui.js';
import { ensureMigrated, type TargetConfig } from '@llm-switch/core/config.js';
import { ensureMigratedToCentralStore } from '@llm-switch/core/migrate.js';
import { defaultProfileStore, type ProfileStore } from '@llm-switch/core/store/index.js';
import { selectTargets } from './target-selector.js';
import { StateManager } from '@llm-switch/core/state/index.js';
import { runTui } from '@llm-switch/tui';
import { registerList } from './commands/register/register-list.js';
import { registerSwitch } from './commands/register/register-switch.js';
import { registerSave } from './commands/register/register-save.js';
import { registerCreate } from './commands/register/register-create.js';
import { registerRestore } from './commands/register/register-restore.js';
import { registerCurrent } from './commands/register/register-current.js';
import { registerInit } from './commands/register/register-init.js';
import { buildAfterHelp, targetNames } from './help-text.js';
import { prepareTui } from './tui-bootstrap.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as {
  version: string;
};

export interface CliContext {
  program: Command;
  resolveTargets: () => Promise<{ targets: TargetConfig[]; store: ProfileStore }>;
  targetFlagFromCli: (program: Command) => string | undefined;
}

/**
 * The --target value only when it was actually passed on the CLI. Commander
 * fills in 'claude' as the default, so we can't trust the value alone — we
 * check the option's source. Returns undefined when --target wasn't passed,
 * which lets the TargetSelector fall back to interactive selection, the
 * remembered state, or the LLM_SWITCH_TARGET default.
 */
function targetFlagFromCli(program: Command): string | undefined {
  if (program.getOptionValueSource('target') !== 'cli') return undefined;
  const value = (program.opts().target as string | undefined)?.trim();
  return value || undefined;
}

/**
 * Resolve the targets for this invocation and run the per-target layout
 * migrations. Centralizes the shared preamble used by every command except
 * `init`: build the store + state manager, let the TargetSelector pick the
 * targets (--target exact override → interactive multi-select → remembered
 * state → LLM_SWITCH_TARGET/claude default), migrate each resolved target's
 * legacy flat layout, then seed the centralized profile store.
 */
async function resolveTargets(
  program: Command,
): Promise<{ targets: TargetConfig[]; store: ProfileStore }> {
  const store = defaultProfileStore();
  const stateManager = new StateManager(store.baseDir);
  const { targets } = await selectTargets({
    flag: targetFlagFromCli(program),
    isTTY: Boolean(process.stdout.isTTY),
    stateManager,
  });
  for (const target of targets) {
    await ensureMigrated(target);
  }
  await ensureMigratedToCentralStore(store.baseDir, targets);
  return { targets, store };
}

const program = new Command();
program
  .name('sw')
  .description('Switch LLM profiles for Claude Code, OpenCode, Codex, and other CLI tools')
  .version(pkg.version)
  .option(
    `-t, --target <${targetNames}>`,
    'Act on a single tool and skip the target prompt (claude, opencode, or codex)',
    'claude',
  )
  .addHelpText('after', buildAfterHelp());

const ctx: CliContext = {
  program,
  resolveTargets: () => resolveTargets(program),
  targetFlagFromCli,
};

registerList(program, ctx);
registerSwitch(program, ctx);
registerSave(program, ctx);
registerCreate(program, ctx);
registerRestore(program, ctx);
registerCurrent(program, ctx);
registerInit(program, ctx);

async function main(): Promise<void> {
  try {
    const args = process.argv.slice(2);
    const hasSubcommand = args.length > 0 && !args[0]?.startsWith('-');
    const wantsHelp = args.includes('--help') || args.includes('-h');
    const wantsVersion = args.includes('--version') || args.includes('-V');

    if (!hasSubcommand && !wantsHelp && !wantsVersion && process.stdout.isTTY) {
      const { targets, store } = await prepareTui();
      await runTui(store, targets);
      return;
    }

    await program.parseAsync(process.argv);
  } catch (err: unknown) {
    if (isInquirerCancelError(err)) {
      // User pressed Ctrl-C / Esc / abort during an interactive prompt.
      // Treat as a clean cancellation: no error message, exit code 0.
      process.exit(0);
    }
    if (err instanceof AppError) {
      log.error(`Error: ${err.message}`);
    } else if (err instanceof Error) {
      log.error(`Unexpected error: ${err.message}`);
    } else {
      log.error('Unexpected error');
    }
    process.exit(toExitCode(err));
  }
}

main();
