# llm-switch

Switch LLM profiles for Claude Code, OpenCode, Codex, and other AI CLI tools from
the command line. The recommended command name is `sw`; `llm-switch` is still
installed but deprecated and will be removed in a future release.

## What it does

`llm-switch` manages multiple named profiles for the AI CLI tools you use and
swaps each tool's active config with one atomic command. Profiles live in a
single centralized store, shared across tools, while each tool's own config
folder stays tidy:

```
~/.llm-switch/
  profiles/<target-id>/<alias>.[json|toml]   ← saved profiles (central store)
  state.json                                 ← your last-selected targets
~/.claude/
  settings.json                              ← active config (read by Claude Code)
  llm-switch/backups/settings.json.bak       ← previous active config
```

Backups are automatic, so every switch can be undone with `sw restore`.

## Selecting targets

In a terminal, every command first asks which tools to act on (Claude Code,
OpenCode, Codex) and remembers your choice for next time:

```
? Select targets:  (press <space> to select, <a> to toggle all, <i> to invert)
❯◉ Claude Code
 ◉ OpenCode
 ◯ Codex (not installed)
```

Skip the prompt with the global `--target` / `-t` flag (acts on exactly one tool),
or set `LLM_SWITCH_TARGET` for the default in scripts and CI. In non-interactive
contexts the remembered set is reused, falling back to `--target`, then
`LLM_SWITCH_TARGET`, then `claude`.

## Supported targets

| Target     | Active config                      | Config dir env var     | Format |
| ---------- | ---------------------------------- | ---------------------- | ------ |
| `claude`   | `~/.claude/settings.json`          | `CLAUDE_CONFIG_DIR`    | JSON   |
| `opencode` | `~/.config/opencode/opencode.json` | `OPENCODE_CONFIG_DIR`  | JSON   |
| `codex`    | `~/.codex/config.toml`             | `CODEX_HOME`           | TOML   |

Claude Code and OpenCode use Anthropic-compatible env vars
(`ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, `ANTHROPIC_AUTH_TOKEN`); Codex uses a
TOML config (`model`, `base_url`, `api_key`).

## Built-in providers

`llm-switch create` ships with built-in defaults for six providers:

| Provider      | Default BASE URL                                           | Default model       |
| ------------- | ---------------------------------------------------------- | ------------------- |
| GLM (智谱)    | `https://open.bigmodel.cn/api/anthropic`                   | `glm-4.5`           |
| DeepSeek      | `https://api.deepseek.com/anthropic`                       | `deepseek-chat`     |
| Kimi (Moonshot)| `https://api.kimi.com/coding/`                            | `kimi-for-coding`   |
| MiniMax       | `https://api.minimaxi.com/anthropic`                       | `MiniMax-Text-01`   |
| Qwen (DashScope)| `https://dashscope.aliyuncs.com/compatible-mode/anthropic`| `qwen-plus`       |
| OpenAI        | `https://api.openai.com/v1`                                | `gpt-4.1`           |

You can override the BASE URL and model during the wizard. The default alias for
each provider is its short id (e.g., `glm`, `kimi`). When you select an
Anthropic-family target (Claude Code, OpenCode) the wizard validates against the
provider's Anthropic-compatible endpoint; when you select Codex it uses the
OpenAI Chat Completions endpoint and writes a TOML config. A single `create` run
builds and activates the profile on every selected target.

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
sw                            # launch the interactive TUI (TTY only)
sw list                       # show profiles for the selected targets
sw switch                     # interactive menu (targets, then profile)
sw switch glm                 # switch directly (prompts for targets)
sw save glm-v2                # save current config as a new profile
sw save -f glm                # overwrite an existing profile (skip confirm)
sw restore                    # restore previous backup
sw current                    # show active profile per target
sw create                     # interactive wizard to create a new profile
sw init                       # interactive wizard: detect tools and initialize

sw --target opencode list     # operate on OpenCode only (skip target prompt)
sw -t codex create            # create a Codex TOML profile
LLM_SWITCH_TARGET=opencode sw current   # default target in scripts

sw --help                     # full help, including env vars
sw <cmd> --help               # per-command help with examples + exit codes
```

When you run `sw` without arguments in a terminal, it launches a lazygit-style
TUI for browsing targets and profiles, switching active configs, and viewing
profile details. Pass a subcommand or `--help`/`--version` to stay on the CLI
path.

Set the config-dir env var to override a target's default location
(`CLAUDE_CONFIG_DIR`, `OPENCODE_CONFIG_DIR`, or `CODEX_HOME`).

### Migration from 0.7.x

In 0.9.0 profiles moved into the centralized store
(`~/.llm-switch/profiles/<target-id>/...`). On first run, `sw`
copies your existing per-tool `llm-switch/profiles/` profiles into the central
store automatically (the originals are left in place). No manual intervention is
required. Upgrading from 0.5.x or earlier is also handled: the older flat
`settings.json.<alias>` files are first moved into each tool's `llm-switch/`
subdirectory, then copied into the central store.

### First-run setup

The first time you run a `sw` command in a terminal, it asks which CLI
tools (Claude Code, OpenCode, Codex) to manage and remembers your choice. Other
commands create the directory layout on demand, so setup is automatic; run
`sw init` any time if you want the detection report and warnings about
missing active configs. The wizard only ever creates `llm-switch/` and central
store directories — it never creates or edits a tool's own config file.

### `save` overwrite behavior

`save <alias>` asks before overwriting an existing profile (mirrors the `create`
wizard). Pass `-f` / `--force` to skip the prompt, or run in a TTY to get the
interactive `Overwrite? [y/N]` prompt. In non-TTY contexts without `--force`,
`save` exits 0 with a clear error instead of silently destroying the profile.
When multiple targets are selected, the prompt lists every affected tool and
applies the answer to all of them.

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
