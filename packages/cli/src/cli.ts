import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { log } from './logger.js';
import { toExitCode } from './exit.js';
import { AppError } from './errors.js';
import { isInquirerCancelError } from './ui.js';
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

const program = new Command();
program
  .name('llm-switch')
  .description('Switch Claude Code settings.json profiles from the command line')
  .version(pkg.version)
  .addHelpText(
    'after',
    `
Environment:
  CLAUDE_CONFIG_DIR   Config directory (default: ~/.claude). Holds settings.json,
                      settings.json.<alias> profile files, and settings.json.bak.

Built-in providers for \`create\`:
  GLM (智谱)        https://open.bigmodel.cn/api/anthropic          glm-4.5
  DeepSeek           https://api.deepseek.com/anthropic              deepseek-chat
  Kimi (Moonshot)    https://api.moonshot.cn/anthropic               moonshot-v1-8k
  MiniMax            https://api.minimaxi.com/anthropic               MiniMax-Text-01
  Qwen (DashScope)   https://dashscope.aliyuncs.com/compatible-mode/  qwen-plus

Profile file convention:
  settings.json              the currently active profile (atomic-renamed on switch)
  settings.json.<alias>      each saved profile
  settings.json.bak          backup of the previous active profile
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
  $ CLAUDE_CONFIG_DIR=/tmp/llm-switch-test llm-switch list

Output columns: ●/○ marker, alias, full path. Active profile is always listed first.
`,
  )
  .action(async () => {
    await listCmd.run({ stdout: process.stdout });
  });

program
  .command('switch [alias]')
  .description('Switch to a profile (interactive if no alias is given)')
  .addHelpText(
    'after',
    `
Arguments:
  [alias]   Profile name to switch to. Must match ^[a-z0-9][a-z0-9._-]{0,63}$.
            If omitted, an interactive picker is shown (requires a TTY).

The previous settings.json is moved to settings.json.bak before the swap, so
\`llm-switch restore\` can undo the change.

Examples:
  $ llm-switch switch            # interactive picker
  $ llm-switch switch glm        # switch directly to the 'glm' profile

Exit codes: 0 on success, 2 if the named profile does not exist, 0 (no error)
if cancelled via Ctrl-C.
`,
  )
  .action(async (alias?: string) => {
    await switchCmd.run({
      alias,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: Boolean(process.stdout.isTTY),
    });
  });

program
  .command('restore')
  .description('Restore settings.json from the most recent backup')
  .addHelpText(
    'after',
    `
Restores settings.json from settings.json.bak (the file written by the most
recent successful \`switch\` or \`save\`). The backup is removed after restore.

If the current settings.json and the backup are byte-identical, the command
prints 'Already at backup state' and exits 0 without touching anything.

Examples:
  $ llm-switch restore

Exit codes: 1 if no settings.json.bak exists, 0 otherwise.
`,
  )
  .action(async () => {
    await restoreCmd.run({ stdout: process.stdout });
  });

program
  .command('save [alias]')
  .description('Save the current settings.json as a named profile')
  .option('-f, --force', 'overwrite an existing profile without confirmation')
  .addHelpText(
    'after',
    `
Arguments:
  [alias]   Profile name to save under. Must match ^[a-z0-9][a-z0-9._-]{0,63}$.
            If omitted, an interactive picker is shown (requires a TTY).

Options:
  -f, --force   Overwrite an existing profile without prompting. By default,
                \`save\` asks for confirmation before overwriting (mirrors the
                \`create\` wizard). \`--force\` is for scripts and non-TTY
                contexts where you already know you want to overwrite.

If the target settings.json.<alias> already exists and \`--force\` is not
passed, \`save\` prompts \`Overwrite? [y/N]\` (requires a TTY). In non-TTY
contexts it exits 0 with a clear error instead of silently overwriting.

Examples:
  $ llm-switch save glm           # save settings.json as 'glm'
  $ llm-switch save -f glm        # overwrite existing 'glm' without prompt
  $ llm-switch save               # interactive picker

Exit codes: 1 if no settings.json exists, 0 otherwise. Cancellation
(via prompt decline or Ctrl-C) exits 0.
`,
  )
  .action(async (alias?: string, opts?: { force?: boolean }) => {
    await saveCmd.run({
      alias,
      force: opts?.force,
      stdin: process.stdin,
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
against the chosen provider's /v1/messages endpoint → write
settings.json.<alias> → atomically activate as the current profile.

Requires a TTY. In non-interactive contexts (CI, piped input) the command
exits 0 with no effect.

The validator rejects non-HTTPS BASE_URLs; http:// is allowed only for
localhost/127.0.0.1/::1 (so local proxies like LiteLLM still work).

Examples:
  $ llm-switch create             # run the wizard

Exit codes: 0 if created (or cleanly cancelled), non-zero on validation
failure that isn't recovered via the failure submenu.
`,
  )
  .action(async () => {
    await createCmd.run({
      stdin: process.stdin,
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
Prints a summary of settings.json: which profile it matches (by SHA256 of
contents), or 'default' if no profile file matches. Also prints the
BASE_URL, model, and whether any MCP servers are configured.

Examples:
  $ llm-switch current

Exit codes: 0 on success, 2 if the config directory is not found.
`,
  )
  .action(async () => {
    await currentCmd.run({ stdout: process.stdout });
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
