# llm-switch

Switch LLM profiles for Claude Code, OpenCode, and other CLI tools from the command line.

## What it does

`llm-switch` manages multiple named profiles for the AI CLI tools you use and
swaps the active config with one atomic command. Each target tool keeps its
profiles and backups under its own `llm-switch/` subdirectory, so your tool's
config folder stays tidy:

```
~/.claude/
  settings.json                       ← active config (read by Claude Code)
  llm-switch/
    profiles/<alias>.json             ← each saved profile
    backups/settings.json.bak         ← previous active config
```

Backups are automatic, so every switch can be undone with `llm-switch restore`.

## Supported targets

| Target    | Active config                                   | Config dir env var     |
| --------- | ----------------------------------------------- | ---------------------- |
| `claude`  | `~/.claude/settings.json`                       | `CLAUDE_CONFIG_DIR`    |
| `opencode`| `~/.config/opencode/opencode.json`              | `OPENCODE_CONFIG_DIR`  |

Select a target with the global `--target` / `-t` flag, or set the
`LLM_SWITCH_TARGET` environment variable. The default is `claude`.

## Built-in providers

`llm-switch create` ships with built-in defaults for five Anthropic-compatible
providers:

| Provider      | Default BASE URL                                           | Default model       |
| ------------- | ---------------------------------------------------------- | ------------------- |
| GLM (智谱)    | `https://open.bigmodel.cn/api/anthropic`                   | `glm-4.5`           |
| DeepSeek      | `https://api.deepseek.com/anthropic`                       | `deepseek-chat`     |
| Kimi (Moonshot)| `https://api.kimi.com/coding/`                            | `kimi-for-coding`   |
| MiniMax       | `https://api.minimaxi.com/anthropic`                       | `MiniMax-Text-01`   |
| Qwen (DashScope)| `https://dashscope.aliyuncs.com/compatible-mode/anthropic`| `qwen-plus`       |

You can override the BASE URL and model during the wizard. The default alias for
each provider is its short id (e.g., `glm`, `kimi`). Profiles use
Anthropic-compatible env vars (`ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`,
`ANTHROPIC_AUTH_TOKEN`), which work for both Claude Code and OpenCode.

## Security note

API keys entered into `create` (and copied by `save`) are stored in plaintext in
the active config and profile files. The tool automatically applies `0600`
permissions to every file it writes, so the API key is only readable by your
user account on Unix systems.

## Install

```bash
npm i -g llm-switch
```

## Usage

```bash
llm-switch list                       # show available profiles (active first)
llm-switch switch                     # interactive menu
llm-switch switch glm                 # switch directly
llm-switch save glm-v2                # save current config as a new profile
llm-switch save -f glm                # overwrite an existing profile (skip confirm)
llm-switch restore                    # restore previous backup
llm-switch current                    # show active profile
llm-switch create                     # interactive wizard to create a new profile

llm-switch --target opencode list     # operate on OpenCode instead of Claude Code
llm-switch -t opencode switch glm

llm-switch --help                     # full help, including env vars
llm-switch <cmd> --help               # per-command help with examples + exit codes
```

Set the config-dir env var to override a target's default location
(`CLAUDE_CONFIG_DIR` or `OPENCODE_CONFIG_DIR`).

### Migration from 0.5.x

If you are upgrading from 0.5.x or earlier, your profiles and backups live as
flat files (`settings.json.<alias>`, `settings.json.bak`) directly in
`~/.claude/`. On first run, `llm-switch` automatically moves them into the new
`llm-switch/` subdirectory layout. No manual intervention is required.

### `save` overwrite behavior

`save <alias>` asks before overwriting an existing profile (mirrors the `create`
wizard). Pass `-f` / `--force` to skip the prompt, or run in a TTY to get the
interactive `Overwrite? [y/N]` prompt. In non-TTY contexts without `--force`,
`save` exits 0 with a clear error instead of silently destroying the profile.

## Claude Code plugin

The `packages/claude-code-plugin/` directory is a Claude Code plugin. Symlink or
copy it into `~/.claude/plugins/llm-switch/` to use `/switch-config` inside
Claude Code. The plugin version tracks the CLI version.

## Development

```bash
pnpm install
pnpm test                               # tests across the CLI package
pnpm -F llm-switch test:coverage        # coverage report
pnpm build
pnpm -F llm-switch lint
pnpm -F llm-switch format
```

`pnpm install` also enables a pre-commit hook that runs `lint` and
`format:check` on every commit. CI runs the same checks plus a `pnpm audit` job
for dependency vulnerabilities. See [CONTRIBUTING.md](./CONTRIBUTING.md) for
commit conventions and the PR process, and [SECURITY.md](./SECURITY.md) for how
to report a vulnerability.

## License

MIT
