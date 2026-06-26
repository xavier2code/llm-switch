import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { log } from './logger.js';
import { toExitCode } from './exit.js';
import { AppError } from './errors.js';
import { isInquirerCancelError } from './ui.js';
import { ensureMigrated, TARGETS, type TargetConfig } from './config.js';
import { ensureMigratedToCentralStore } from './migrate.js';
import { defaultProfileStore, type ProfileStore } from './store/profile-store.js';
import { selectTargets } from './target-selector.js';
import { StateManager } from './state/state-manager.js';
import * as listCmd from './commands/list.js';
import * as switchCmd from './commands/switch.js';
import * as restoreCmd from './commands/restore.js';
import * as saveCmd from './commands/save.js';
import * as createCmd from './commands/create.js';
import * as currentCmd from './commands/current.js';
import * as initCmd from './commands/init.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as {
  version: string;
};

/**
 * The --target value only when it was actually passed on the CLI. Commander
 * fills in 'claude' as the default, so we can't trust the value alone — we
 * check the option's source. Returns undefined when --target wasn't passed,
 * which lets the TargetSelector fall back to interactive selection, the
 * remembered state, or the LLM_SWITCH_TARGET default.
 */
function targetFlagFromCli(): string | undefined {
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
async function resolveTargets(): Promise<{ targets: TargetConfig[]; store: ProfileStore }> {
  const store = defaultProfileStore();
  const stateManager = new StateManager(store.baseDir);
  const { targets } = await selectTargets({
    flag: targetFlagFromCli(),
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
  ~/.config/llm-switch/profiles/<target-id>/<alias>.[json|toml]   saved profiles
  ~/.config/llm-switch/state.json                                 last-selected targets
  <config-dir>/llm-switch/backups/<active>.bak                    backup before a switch

Built-in providers for \`create\`:
${providerRows}

Claude Code and OpenCode use Anthropic-compatible env vars
(ANTHROPIC_BASE_URL, ANTHROPIC_MODEL, ANTHROPIC_AUTH_TOKEN). Codex uses a TOML
config (model, base_url, api_key).
`,
  );

program
  .command('list')
  .description('List available profiles (active first, others alphabetical)')
  .addHelpText(
    'after',
    `
Examples:
  $ sw list
  $ sw --target opencode list
  $ CLAUDE_CONFIG_DIR=/tmp/sw-test sw list

Profiles are grouped by target. Within each group the active profile is listed
first (●), the rest alphabetically (○), each with its store path.
`,
  )
  .action(async () => {
    const { targets, store } = await resolveTargets();
    await listCmd.run({ targets, stdout: process.stdout, store });
  });

program
  .command('switch [alias]')
  .description('Switch to a profile (interactive if no alias is given)')
  .addHelpText(
    'after',
    `
Arguments:
  [alias]   Profile name to switch to. Must match ^[a-z0-9][a-z0-9._-]{0,63}$ and not end in '.bak'.
            If omitted, an interactive picker is shown (requires a TTY).

The previous active config is backed up before the swap, so \`sw restore\`
can undo the change. Switching across multiple selected targets activates the
same alias on each; a missing profile is auto-created from a same-family target
or the current active config when possible.

Examples:
  $ sw switch            # interactive picker
  $ sw switch glm        # switch directly to the 'glm' profile
  $ sw --target opencode switch glm

Exit codes: 0 on success, 2 if the named profile does not exist, 0 (no error)
if cancelled via Ctrl-C.
`,
  )
  .action(async (alias?: string) => {
    const { targets, store } = await resolveTargets();
    await switchCmd.run({
      targets,
      alias,
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: Boolean(process.stdout.isTTY),
      store,
    });
  });

program
  .command('restore')
  .description('Restore the active config from the most recent backup')
  .addHelpText(
    'after',
    `
Restores the active config from the most recent backup (\`llm-switch/backups/<active>.bak\`,
the file written by the most recent successful \`switch\` or \`save\`). The backup
is removed after restore.

If the current active config and the backup are byte-identical, the command
prints 'already at backup state' and exits 0 without touching anything.

Examples:
  $ sw restore
  $ sw--target opencode restore

Exit codes: 1 if no backup exists, 0 otherwise.
`,
  )
  .action(async () => {
    const { targets, store } = await resolveTargets();
    await restoreCmd.run({ targets, stdout: process.stdout, store });
  });

program
  .command('save [alias]')
  .description('Save the current active config as a named profile')
  .option('-f, --force', 'overwrite an existing profile without confirmation')
  .addHelpText(
    'after',
    `
Arguments:
  [alias]   Profile name to save under. Must match ^[a-z0-9][a-z0-9._-]{0,63}$ and not end in '.bak'.
            If omitted, an interactive picker is shown (requires a TTY).

Options:
  -f, --force   Overwrite an existing profile without prompting. By default,
                \`save\` asks for confirmation before overwriting (mirrors the
                \`create\` wizard). \`--force\` is for scripts and non-TTY
                contexts where you already know you want to overwrite.

If the target profile already exists and \`--force\` is not passed, \`save\`
prompts \`Overwrite? [y/N]\` (requires a TTY). In non-TTY contexts it exits 0
with a clear error instead of silently overwriting.

Examples:
  $ sw save glm           # save active config as 'glm'
  $ sw save -f glm        # overwrite existing 'glm' without prompt
  $ sw save               # interactive picker
  $ sw--target opencode save glm

Exit codes: 1 if no active config exists, 0 otherwise. Cancellation
(via prompt decline or Ctrl-C) exits 0.
`,
  )
  .action(async (alias?: string, opts?: { force?: boolean }) => {
    const { targets, store } = await resolveTargets();
    await saveCmd.run({
      targets,
      alias,
      force: opts?.force,
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: Boolean(process.stdout.isTTY),
      store,
    });
  });

program
  .command('create')
  .description('Create a new profile from a built-in provider (interactive wizard)')
  .addHelpText(
    'after',
    `
Interactive wizard: select provider → confirm alias → confirm/override the
default BASE_URL and model → enter an API key (masked) → real API validation
against the chosen provider's endpoint → write the profile → atomically activate
it as the current config.

Provider and validation are routed per target family: Anthropic-family targets
(Claude Code, OpenCode) use Anthropic-compatible endpoints; Codex uses the
OpenAI Chat Completions endpoint and a TOML config. A single run creates and
activates the profile on every selected target.

Requires a TTY. In non-interactive contexts (CI, piped input) the command
exits 0 with no effect.

The validator rejects non-HTTPS BASE_URLs; http:// is allowed only for
localhost/127.0.0.1/::1 (so local proxies like LiteLLM still work).

Examples:
  $ sw create             # run the wizard
  $ sw--target codex create

Exit codes: 0 if created (or cleanly cancelled), non-zero on validation
failure that isn't recovered via the failure submenu.
`,
  )
  .action(async () => {
    const { targets, store } = await resolveTargets();
    await createCmd.run({
      targets,
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: Boolean(process.stdout.isTTY),
      store,
    });
  });

program
  .command('current')
  .description('Show the current active profile')
  .addHelpText(
    'after',
    `
Prints a summary of the active config per selected target: which profile it
matches (by SHA256 of contents), or 'default' if no profile file matches. Also
prints the BASE_URL, model, and whether any MCP servers are configured.

Examples:
  $ sw current
  $ sw--target opencode current

Exit codes: 0 on success, 1 if the config directory is not found.
`,
  )
  .action(async () => {
    const { targets, store } = await resolveTargets();
    await currentCmd.run({ targets, stdout: process.stdout, store });
  });

program
  .command('init')
  .description(
    'Detect installed CLI tools and initialize the llm-switch directory layout (interactive)',
  )
  .addHelpText(
    'after',
    `
Interactive wizard: detects Claude Code / OpenCode / Codex on PATH, lets you
multi-select which tools llm-switch should manage, warns about missing active
configs, and creates the centralized profile-store layout for each.

Other commands also create the layout on demand, so \`init\` is optional — run it
once after installing a new CLI tool if you want the detection report and the
warnings about missing active configs.

Requires a TTY. In non-interactive contexts it exits 0 with no effect.
The --target flag has no effect here; \`init\` manages all detected targets.

Examples:
  $ sw init

Exit codes: 0 on success or clean cancellation.
`,
  )
  .action(async () => {
    await initCmd.runInitWizard({
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: Boolean(process.stdout.isTTY),
    });
  });

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
