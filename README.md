# llm-switch

Switch LLM profiles for Claude Code, OpenCode, and other CLI tools from the command line.

Invoke it as `sw`. The `llm-switch` command also still works but is deprecated.

## What it does

`sw` manages multiple named profiles for the AI CLI tools you use and
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

Backups are automatic, so every switch can be undone with `sw restore`.

## Supported targets

| Target    | Active config                                   | Config dir env var     |
| --------- | ----------------------------------------------- | ---------------------- |
| `claude`  | `~/.claude/settings.json`                       | `CLAUDE_CONFIG_DIR`    |
| `opencode`| `~/.config/opencode/opencode.json`              | `OPENCODE_CONFIG_DIR`  |

Select a target with the global `--target` / `-t` flag, or set the
`LLM_SWITCH_TARGET` environment variable. The default is `claude`.

## Built-in providers

`sw create` ships with built-in defaults for five Anthropic-compatible
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
sw list                             # show available profiles (active first)
sw switch                           # interactive menu
sw switch glm                       # switch directly
sw save glm-v2                      # save current config as a new profile
sw save -f glm                      # overwrite an existing profile (skip confirm)
sw restore                          # restore previous backup
sw current                          # show active profile
sw create                           # interactive wizard to create a new profile
sw init                             # interactive wizard: detect tools and initialize directories

sw --target opencode list           # operate on OpenCode instead of Claude Code
sw -t opencode switch glm

sw --help                           # full help, including env vars
sw <cmd> --help                     # per-command help with examples + exit codes
```

Set the config-dir env var to override a target's default location
(`CLAUDE_CONFIG_DIR` or `OPENCODE_CONFIG_DIR`).

### Migration from 0.5.x

If you are upgrading from 0.5.x or earlier, your profiles and backups live as
flat files (`settings.json.<alias>`, `settings.json.bak`) directly in
`~/.claude/`. On first run, `llm-switch` automatically moves them into the new
`llm-switch/` subdirectory layout. No manual intervention is required.

### Migrating from `llm-switch`

Both `llm-switch` and `sw` work today. `sw` is the preferred
invocation going forward. The `llm-switch` command still runs but prints
a deprecation warning to stderr; it will be removed in a future release.

No action is required — your existing scripts keep working. To migrate
manually, replace `llm-switch` with `sw` in any aliases, shell history,
or scripts.

### First-run setup

The first time you run any `sw` command in a terminal, an interactive
wizard detects which CLI tools (Claude Code, OpenCode) are installed, lets you
choose which ones to manage, and creates the `llm-switch/` directory layout for
each. You can also run it any time with `sw init`. The wizard only ever
creates `llm-switch/` directories — it never creates or edits a tool's own
config file.

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
