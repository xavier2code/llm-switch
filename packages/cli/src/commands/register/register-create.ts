import type { Command } from 'commander';
import type { CliContext } from '../../cli.js';
import * as createCmd from '../create.js';

export function registerCreate(program: Command, ctx: CliContext): void {
  program
    .command('create')
    .description('Create a new profile from a built-in provider (interactive wizard)')
    .option('--provider <id>', 'provider id (glm, deepseek, kimi, minimax, qwen, openai)')
    .option('--alias <name>', 'profile alias')
    .option('--base-url <url>', 'override provider BASE_URL')
    .option('--model <model>', 'override provider model')
    .option('--api-key <key>', 'API key (use LLM_SWITCH_API_KEY env var to avoid shell history)')
    .option('--skip-validation', 'skip the live API validation (useful in CI/scripts)')
    .addHelpText(
      'after',
      `
Interactive wizard: select provider → confirm alias → confirm/override the
default BASE_URL and model → enter an API key (masked) → real API validation
against the chosen provider's endpoint → write the profile → atomically activate
it as the current config.

All prompts can be skipped by passing the corresponding flags. When every
required value is provided via flags, the command runs without a TTY and is
suitable for CI/scripts. If any required value is missing and stdin is not a
TTY, the command exits 0 with no effect.

Provider and validation are routed per target family: Anthropic-family targets
(Claude Code, OpenCode) use Anthropic-compatible endpoints; Codex uses the
OpenAI Chat Completions endpoint and a TOML config. A single run creates and
activates the profile on every selected target.

The validator rejects non-HTTPS BASE_URLs; http:// is allowed only for
localhost/127.0.0.1/::1 (so local proxies like LiteLLM still work).

Examples:
  $ sw create             # run the wizard
  $ sw --target codex create
  $ sw create --provider glm --alias glm --api-key $API_KEY

Exit codes: 0 if created (or cleanly cancelled), non-zero on validation
failure that isn't recovered via the failure submenu.
`,
    )
    .action(
      async (opts: {
        provider?: string;
        alias?: string;
        baseUrl?: string;
        model?: string;
        apiKey?: string;
        skipValidation?: boolean;
      }) => {
        const { targets, store } = await ctx.resolveTargets();
        await createCmd.run({
          targets,
          stdout: process.stdout,
          stderr: process.stderr,
          isTTY: Boolean(process.stdout.isTTY),
          store,
          providerId: opts.provider,
          alias: opts.alias,
          baseUrl: opts.baseUrl,
          model: opts.model,
          apiKey: opts.apiKey ?? process.env.LLM_SWITCH_API_KEY,
          skipValidation: opts.skipValidation,
        });
      },
    );
}
