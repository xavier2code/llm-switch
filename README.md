# llm-switch

Switch Claude Code `settings.json` profiles from the command line.

## What it does

If you maintain multiple `settings.json.<alias>` files (e.g. `settings.json.glm`, `settings.json.kimi`) in `~/.claude/`, `llm-switch` lets you switch the active `settings.json` with one command. Backups are automatic.

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
