import type { Command } from 'commander';
import type { CliContext } from '../../cli.js';
import * as listCmd from '../list.js';

export function registerList(program: Command, ctx: CliContext): void {
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
      const { targets, store } = await ctx.resolveTargets();
      await listCmd.run({ targets, stdout: process.stdout, store });
    });
}
