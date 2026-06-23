# llm-switch

Switch Claude Code `settings.json` profiles from the command line.

## What it does

If you maintain multiple `settings.json.<alias>` files (e.g. `settings.json.glm`, `settings.json.kimi`) in `~/.claude/`, `llm-switch` lets you switch the active `settings.json` with one command. Backups are automatic.

## Built-in providers

`llm-switch create` ships with built-in defaults for five Anthropic-compatible providers:

| Provider      | Default BASE URL                                           | Default model       |
| ------------- | ---------------------------------------------------------- | ------------------- |
| GLM (智谱)    | `https://open.bigmodel.cn/api/anthropic`                   | `glm-4.5`           |
| DeepSeek      | `https://api.deepseek.com/anthropic`                       | `deepseek-chat`     |
| Kimi (Moonshot)| `https://api.moonshot.cn/anthropic`                       | `moonshot-v1-8k`    |
| MiniMax       | `https://api.minimaxi.com/anthropic`                       | `MiniMax-Text-01`   |
| Qwen (DashScope)| `https://dashscope.aliyuncs.com/compatible-mode/anthropic`| `qwen-plus`         |

You can override the BASE URL and model during the wizard. The default alias for each provider is its short id (e.g., `glm`, `kimi`).

## Security note

API keys entered into `create` are stored in plaintext in `~/.claude/settings.json` (and `settings.json.<alias>`). This matches how `save` works. Use file permissions (`chmod 600`) to protect the file if your machine is shared.

## Install

```bash
npm i -g llm-switch
```

## Usage

```bash
llm-switch list                 # show available profiles
llm-switch switch               # interactive menu
llm-switch switch glm           # switch directly
llm-switch save glm-v2          # save current settings as new profile
llm-switch restore              # restore previous backup
llm-switch current              # show active profile
llm-switch create               # interactive wizard to create a new profile
```

Set `CLAUDE_CONFIG_DIR` to override the default `~/.claude`.

## Claude Code plugin

The `packages/claude-code-plugin/` directory is a Claude Code plugin. Symlink or copy it into `~/.claude/plugins/llm-switch/` to use `/switch-config` inside Claude Code.

## Development

```bash
pnpm install
pnpm test
pnpm build
```

## License

MIT
