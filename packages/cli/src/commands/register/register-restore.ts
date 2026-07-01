import type { Command } from 'commander';
import type { CliContext } from '../../cli.js';
import * as restoreCmd from '../restore.js';

export function registerRestore(program: Command, ctx: CliContext): void {
  program
    .command('restore')
    .description('Restore the active config from the most recent backup')
    .addHelpText(
      'after',
      `
Restores the active config from the most recent backup (\`<config-dir>/<active>.bak\`,
the file written by the most recent successful \`switch\` or \`save\`). The backup
is removed after restore.

If the current active config and the backup are byte-identical, the command
prints 'already at backup state' and exits 0 without touching anything.

Examples:
  $ sw restore
  $ sw --target opencode restore

Exit codes: 1 if no backup exists, 0 otherwise.
`,
    )
    .action(async () => {
      const { targets, store } = await ctx.resolveTargets();
      await restoreCmd.run({ targets, stdout: process.stdout, store });
    });
}
