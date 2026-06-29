import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { log } from './logger.js';
import { toExitCode } from './exit.js';
import { AppError } from './errors.js';
import { isInquirerCancelError } from './ui.js';
import { ensureMigrated, TARGETS, type TargetConfig } from '@llm-switch/core/config.js';
import { ensureMigratedToCentralStore } from '@llm-switch/core/migrate.js';
import { defaultProfileStore, type ProfileStore } from '@llm-switch/core/store/index.js';
import { selectTargets } from './target-selector.js';
import { StateManager } from '@llm-switch/core/state/index.js';
import { registerList } from './commands/register/register-list.js';
import { registerSwitch } from './commands/register/register-switch.js';
import { registerSave } from './commands/register/register-save.js';
import { registerCreate } from './commands/register/register-create.js';
import { registerRestore } from './commands/register/register-restore.js';
import { registerCurrent } from './commands/register/register-current.js';
import { registerInit } from './commands/register/register-init.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as {
  version: string;
};

export interface CliContext {
  program: Command;
  resolveTargets?: (
    targetFlag?: string,
  ) => Promise<{ targets: TargetConfig[]; store: ProfileStore }>;
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

const targetNames = TARGETS.map((t) => t.id).join('|');
const providerRows = [
  ['GLM (智谱)', 'https://open.bigmodel.cn/api/anthropic', 'glm-4.5'],
  ['DeepSeek', 'https://api.deepseek.com/anthropic', 'deepseek-chat'],
  ['Kimi (Moonshot)', 'https://api.kimi.com/coding/', 'kimi-for-coding'],
  ['MiniMax', 'https://api.minimaxi.com/anthropic', 'MiniMax-Text-01'],
  ['Qwen (DashScope)', 'https://dashscope.aliyuncs.com/compatible-mode/anthropic', 'qwen-plus'],
]
  .map(([name, url, model]) => `  ${name.padEnd(18)} ${url.padEnd(50)} ${model}`)
  .join('\n');

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
  .addHelpText(
    'after',
    `
Targets:
  Claude Code, OpenCode, and Codex are supported. In a TTY each command prompts
  you to multi-select which tools to act on (your last choice is remembered).
  Pass --target <id> to skip the prompt and act on exactly one tool. In
  non-interactive contexts the last-selected set is reused, falling back to
  --target, then LLM_SWITCH_TARGET, then claude.

Environment:
  CLAUDE_CONFIG_DIR   Config directory for Claude Code (default: ~/.claude).
  OPENCODE_CONFIG_DIR Config directory for OpenCode (default: ~/.config/opencode).
  CODEX_HOME          Config directory for Codex (default: ~/.codex).
  LLM_SWITCH_TARGET   Default target tool before any selection is remembered;
                      overrides the default but not --target.

Profile store (centralized):
  ~/.llm-switch/profiles/<target-id>/<alias>.[json|toml]   saved profiles
  ~/.llm-switch/state.json                                   last-selected targets
  ~/.llm-switch/backups/<target-id>/<active>.bak             backup before a switch

Built-in providers for \`create\`:
${providerRows}

Claude Code and OpenCode use Anthropic-compatible env vars
(ANTHROPIC_BASE_URL, ANTHROPIC_MODEL, ANTHROPIC_AUTH_TOKEN). Codex uses a TOML
config (model, base_url, api_key).
`,
  );

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
