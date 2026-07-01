import type { Command } from 'commander';
import type { CliContext } from '../../cli.js';
import * as currentCmd from '../current.js';

export function registerCurrent(program: Command, ctx: CliContext): void {
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
  $ sw --target opencode current

Exit codes: 0 on success, 1 if the config directory is not found.
`,
    )
    .action(async () => {
      const { targets, store } = await ctx.resolveTargets();
      await currentCmd.run({ targets, stdout: process.stdout, store });
    });
}
