# llm-switch

[![npm version](https://img.shields.io/npm/v/@xavier2code/llm-switch?style=flat-square)](https://www.npmjs.com/package/@xavier2code/llm-switch)
[![npm downloads](https://img.shields.io/npm/dm/@xavier2code/llm-switch?style=flat-square)](https://www.npmjs.com/package/@xavier2code/llm-switch)
[![CI](https://img.shields.io/github/actions/workflow/status/xavier2code/llm-switch/ci.yml?branch=main&style=flat-square)](https://github.com/xavier2code/llm-switch/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg?style=flat-square)](https://nodejs.org/)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://prettier.io/)

Switch LLM profiles for Claude Code, OpenCode, Codex, and other AI CLI tools.
The recommended command name is `sw`; `llm-switch` is installed as a legacy alias.

> **Note:** The unscoped `llm-switch` package is deprecated. Install
> `@xavier2code/llm-switch` for the latest releases.

## Install

```bash
npm i -g @xavier2code/llm-switch
```

## Quick start

```bash
sw create                     # create and activate a new profile
sw switch glm                 # switch active config to the "glm" profile
sw restore                    # undo the last switch from the automatic backup
sw list                       # list profiles and show the active one
sw                            # launch the interactive TUI (TTY only)
```

Every command prompts for targets (Claude Code, OpenCode, Codex) and remembers
the choice. Use `--target <id>` or `LLM_SWITCH_TARGET` to skip the prompt.

## Supported targets

| Target     | Active config                      | Config dir env var     | Format |
| ---------- | ---------------------------------- | ---------------------- | ------ |
| `claude`   | `~/.claude/settings.json`          | `CLAUDE_CONFIG_DIR`    | JSON   |
| `opencode` | `~/.config/opencode/opencode.json` | `OPENCODE_CONFIG_DIR`  | JSON   |
| `codex`    | `~/.codex/config.toml`             | `CODEX_HOME`           | TOML   |

Anthropic-family targets use `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, and
`ANTHROPIC_AUTH_TOKEN`. Codex uses `model`, `base_url`, and `api_key` in TOML.

## Layout

```
~/.llm-switch/
  profiles/<target-id>/<alias>.[json|toml]   saved profiles (central store)
  state.json                                 last-selected targets
~/.claude/
  settings.json                              active config
  settings.json.bak                          previous active config
```

Profiles are stored centrally; each tool's active config and backup stay in its
own config directory.

## Built-in providers

| Provider       | Default BASE URL                                        | Default model     |
| -------------- | ------------------------------------------------------- | ----------------- |
| GLM (智谱)     | `https://open.bigmodel.cn/api/anthropic`                | `glm-4.5`         |
| DeepSeek       | `https://api.deepseek.com/anthropic`                    | `deepseek-chat`   |
| Kimi (Moonshot)| `https://api.kimi.com/coding/`                          | `kimi-for-coding` |
| MiniMax        | `https://api.minimaxi.com/anthropic`                    | `MiniMax-Text-01` |
| Qwen (DashScope)| `https://dashscope.aliyuncs.com/compatible-mode/anthropic` | `qwen-plus`    |
| OpenAI         | `https://api.openai.com/v1`                             | `gpt-4.1`         |

The `create` wizard validates Anthropic-family endpoints and writes TOML for
Codex. A single run can create and activate a profile across every selected
target.

## Security

API keys are stored in plaintext in active config and profile files. All files
created by `sw` are set to `0600` so they are readable only by your Unix user.

## Usage examples

```bash
sw --target opencode list           # operate on a single target
sw -t codex create                  # create a Codex TOML profile
sw save -f glm                      # overwrite an existing profile
LLM_SWITCH_TARGET=opencode sw current   # default target for scripts

sw --help                           # full help and env vars
sw <cmd> --help                     # per-command help and exit codes
```

## Migration

`sw` automatically migrates profiles from earlier layouts on first run:

- `0.5.x` and earlier (legacy `llm-switch` package): flat
  `settings.json.<alias>` files are moved into the central store.
- `0.7.x` (legacy `llm-switch` package): per-tool `llm-switch/profiles/`
  directories are copied into the central store; originals are left in place.

Run `sw init` to review detected tools and directory status.

## Development

```bash
pnpm install
pnpm -r test          # run all tests
pnpm -r lint
pnpm -r format:check
pnpm -r build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md).

## License

MIT
