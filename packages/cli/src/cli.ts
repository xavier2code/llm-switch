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
  .version(pkg.version);

program
  .command('list')
  .description('List available profiles')
  .action(async () => {
    await listCmd.run({ stdout: process.stdout });
  });

program
  .command('switch [alias]')
  .description('Switch to a profile (interactive if no alias given)')
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
  .description('Restore from the most recent backup')
  .action(async () => {
    await restoreCmd.run({ stdout: process.stdout });
  });

program
  .command('save [alias]')
  .description('Save current settings.json as a named profile')
  .action(async (alias?: string) => {
    await saveCmd.run({
      alias,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: Boolean(process.stdout.isTTY),
    });
  });

program
  .command('create')
  .description('Create a new profile from a built-in provider (interactive)')
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
