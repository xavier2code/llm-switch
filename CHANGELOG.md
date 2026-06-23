# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-06-22

### Changed
- Interactive menus (`switch`, `save`) now use arrow-key navigation via `@inquirer/prompts` instead of numbered typing
- `switch` menu pre-selects the currently active profile
- `save` menu shows existing aliases + "+ Create new" option
- `list` output reformatted with bullet markers (`●` / `○`) and column padding

### Added
- `promptNewAlias` exported from `ui.ts` for chained calls from `promptAlias`

### Dependencies
- Added `@inquirer/prompts` ^7.0.0

## [0.1.0] - 2026-06-22

### Added
- Initial release of `llm-switch` CLI for switching Claude Code `settings.json` profiles
- Five subcommands: `list`, `switch`, `restore`, `save`, `current`
- Interactive numbered menu for profile selection
- Atomic file replacement via `fs.rename` (no half-written configs)
- Automatic backup of current `settings.json` to `settings.json.bak` before each switch (keeps most recent only)
- SHA256-based active-profile detection
- Support for `CLAUDE_CONFIG_DIR` environment variable to override default `~/.claude`
- Alias validation regex `^[a-z0-9][a-z0-9._-]{0,63}$`
- Zod schema validation for `settings.json` structure
- Custom error classes with mapped exit codes (0/1/2/3)
- TTY detection with friendly errors in non-interactive contexts
- Claude Code plugin wrapper for `/switch-config` slash command
- 85 unit + end-to-end tests (vitest)
- TypeScript strict mode with tsup single-file ESM bundle
- GitHub Actions CI for tests and typecheck on every PR

### Security
- Backups survive partial switch failures (atomicity guarantees `settings.json` is never half-written)