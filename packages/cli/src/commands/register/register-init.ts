import type { Command } from 'commander';
import type { CliContext } from '../../cli.js';
import * as initCmd from '../init.js';

export function registerInit(program: Command, _ctx: CliContext): void {
  program
    .command('init')
    .description(
      'Detect installed CLI tools and initialize the llm-switch directory layout (interactive)',
    )
    .option('--yes', 'skip prompts and select all detected tools (non-interactive)')
    .addHelpText(
      'after',
      `
Interactive wizard: detects Claude Code / OpenCode / Codex on PATH, lets you
multi-select which tools llm-switch should manage, warns about missing active
configs, and creates the centralized profile-store layout for each.

Other commands also create the layout on demand, so \`init\` is optional — run it
once after installing a new CLI tool if you want the detection report and the
warnings about missing active configs.

Use \`--yes\` to skip the prompt and select every tool detected on PATH. This is
useful for automated setup; tools that are not detected are still skipped.

The --target flag has no effect here; \`init\` manages all detected targets.

Examples:
  $ sw init
  $ sw init --yes

Exit codes: 0 on success or clean cancellation.
`,
    )
    .action(async (opts: { yes?: boolean }) => {
      await initCmd.runInitWizard({
        stdout: process.stdout,
        stderr: process.stderr,
        isTTY: Boolean(process.stdout.isTTY),
        selectAllDetected: opts.yes,
      });
    });
}
