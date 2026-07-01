import type { Command } from 'commander';
import type { CliContext } from '../../cli.js';
import * as saveCmd from '../save.js';

export function registerSave(program: Command, ctx: CliContext): void {
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
  $ sw --target opencode save glm

Exit codes: 1 if no active config exists, 0 otherwise. Cancellation
(via prompt decline or Ctrl-C) exits 0.
`,
    )
    .action(async (alias: string, opts: { force?: boolean }) => {
      const { targets, store } = await ctx.resolveTargets();
      await saveCmd.run({
        targets,
        alias,
        force: opts.force,
        stdout: process.stdout,
        stderr: process.stderr,
        isTTY: Boolean(process.stdout.isTTY),
        store,
      });
    });
}
