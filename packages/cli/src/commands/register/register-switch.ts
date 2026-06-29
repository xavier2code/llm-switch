import type { Command } from 'commander';
import type { CliContext } from '../../cli.js';
import * as switchCmd from '../switch.js';

export function registerSwitch(program: Command, ctx: CliContext): void {
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
      const { targets, store } = await ctx.resolveTargets();
      await switchCmd.run({
        targets,
        alias,
        stdout: process.stdout,
        stderr: process.stderr,
        isTTY: Boolean(process.stdout.isTTY),
        store,
      });
    });
}
