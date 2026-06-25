import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { log } from './logger.js';
import { toExitCode } from './exit.js';
import { AppError } from './errors.js';
import { isInquirerCancelError } from './ui.js';
import {
  ensureMigrated,
  getDefaultTarget,
  getTarget,
  isTargetId,
  TARGETS,
  type TargetConfig,
} from './config.js';
import * as listCmd from './commands/list.js';
import * as switchCmd from './commands/switch.js';
import * as restoreCmd from './commands/restore.js';
import * as saveCmd from './commands/save.js';
import * as createCmd from './commands/create.js';
import * as currentCmd from './commands/current.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as {
  version: string;
};

function resolveTarget(flag?: string): TargetConfig {
  const fromFlag = flag?.trim();
  if (fromFlag) {
    if (!isTargetId(fromFlag)) {
      throw new AppError(
        `Unknown target '${fromFlag}'. Must be one of: ${TARGETS.map((t) => t.id).join(', ')}`,
        'UNKNOWN_TARGET',
      );
    }
    return getTarget(fromFlag);
  }
  return getDefaultTarget();
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
  .name('llm-switch')
  .description('Switch LLM profiles for Claude Code, OpenCode, and other CLI tools')
  .version(pkg.version)
  .option(`-t, --target <${targetNames}>`, 'Target CLI tool (claude or opencode)', 'claude')
  .addHelpText(
    'after',
    `
Environment:
  CLAUDE_CONFIG_DIR   Config directory for Claude Code (default: ~/.claude).
  OPENCODE_CONFIG_DIR Config directory for OpenCode (default: ~/.config/opencode).
  LLM_SWITCH_TARGET   Default target tool; overrides the default but not --target.

Managed file layout under each config directory:
  llm-switch/profiles/<alias>.json   each saved profile
  llm-switch/backups/<active>.bak  backup of the previous active profile

Built-in providers for \`create\`:
${providerRows}

Profile files use Anthropic-compatible env vars
(ANTHROPIC_BASE_URL, ANTHROPIC_MODEL, ANTHROPIC_AUTH_TOKEN), which work for
both Claude Code and OpenCode.
`,
  );

program
  .command('list')
  .description('List available profiles (active first, others alphabetical)')
  .addHelpText(
    'after',
    `
Examples:
  $ llm-switch list
  $ llm-switch --target opencode list
  $ CLAUDE_CONFIG_DIR=/tmp/llm-switch-test llm-switch list

Output columns: ●/○ marker, alias, full path. Active profile is always listed first.
`,
  )
  .action(async () => {
    const target = resolveTarget(program.opts().target as string | undefined);
    await ensureMigrated(target);
    await listCmd.run({ target, stdout: process.stdout });
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

The previous active config is backed up before the swap, so \`llm-switch restore\`
can undo the change.

Examples:
  $ llm-switch switch            # interactive picker
  $ llm-switch switch glm        # switch directly to the 'glm' profile
  $ llm-switch --target opencode switch glm

Exit codes: 0 on success, 2 if the named profile does not exist, 0 (no error)
if cancelled via Ctrl-C.
`,
  )
  .action(async (alias?: string) => {
    const target = resolveTarget(program.opts().target as string | undefined);
    await ensureMigrated(target);
    await switchCmd.run({
      target,
      alias,
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: Boolean(process.stdout.isTTY),
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
prints 'Already at backup state' and exits 0 without touching anything.

Examples:
  $ llm-switch restore
  $ llm-switch --target opencode restore

Exit codes: 1 if no backup exists, 0 otherwise.
`,
  )
  .action(async () => {
    const target = resolveTarget(program.opts().target as string | undefined);
    await ensureMigrated(target);
    await restoreCmd.run({ target, stdout: process.stdout });
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
  $ llm-switch save glm           # save active config as 'glm'
  $ llm-switch save -f glm        # overwrite existing 'glm' without prompt
  $ llm-switch save               # interactive picker
  $ llm-switch --target opencode save glm

Exit codes: 1 if no active config exists, 0 otherwise. Cancellation
(via prompt decline or Ctrl-C) exits 0.
`,
  )
  .action(async (alias?: string, opts?: { force?: boolean }) => {
    const target = resolveTarget(program.opts().target as string | undefined);
    await ensureMigrated(target);
    await saveCmd.run({
      target,
      alias,
      force: opts?.force,
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: Boolean(process.stdout.isTTY),
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
against the chosen provider's Anthropic-compatible endpoint → write the profile
→ atomically activate it as the current config.

Requires a TTY. In non-interactive contexts (CI, piped input) the command
exits 0 with no effect.

The validator rejects non-HTTPS BASE_URLs; http:// is allowed only for
localhost/127.0.0.1/::1 (so local proxies like LiteLLM still work).

Examples:
  $ llm-switch create             # run the wizard
  $ llm-switch --target opencode create

Exit codes: 0 if created (or cleanly cancelled), non-zero on validation
failure that isn't recovered via the failure submenu.
`,
  )
  .action(async () => {
    const target = resolveTarget(program.opts().target as string | undefined);
    await ensureMigrated(target);
    await createCmd.run({
      target,
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: Boolean(process.stdout.isTTY),
    });
  });

program
  .command('current')
  .description('Show the current active profile')
  .addHelpText(
    'after',
    `
Prints a summary of the active config: which profile it matches (by SHA256 of
contents), or 'default' if no profile file matches. Also prints the BASE_URL,
model, and whether any MCP servers are configured.

Examples:
  $ llm-switch current
  $ llm-switch --target opencode current

Exit codes: 0 on success, 1 if the config directory is not found.
`,
  )
  .action(async () => {
    const target = resolveTarget(program.opts().target as string | undefined);
    await ensureMigrated(target);
    await currentCmd.run({ target, stdout: process.stdout });
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
