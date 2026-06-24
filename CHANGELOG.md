# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- All profile files (`settings.json`, `settings.json.<alias>`, `settings.json.bak`) are now written with mode `0600` automatically. Previously these files inherited the default umask (typically `0644`), allowing other local users to read API keys. The tool no longer requires a manual `chmod 600` after use.
- The `validate` step now rejects non-HTTPS `BASE_URL` values to prevent accidentally sending the API key in plaintext over HTTP. `https://` is required; `http://` is only allowed for `localhost`, `127.0.0.1`, and `::1` (so local proxies like LiteLLM still work). Malformed URLs are also rejected. On rejection the existing failure submenu in `create` prompts the user to edit the URL or model.

### Changed
- Removed unused `log.info`, `log.success`, `log.warn`, `log.dim`, `log.bold`, `log.cyan` methods (only `log.error` was actually used by the CLI) and the dead `parseSettingsSafe` export from `schemas.ts`. Bundle is ~0.5 KB smaller as a result.

## [0.4.1] - 2026-06-23

### Fixed
- `--version` / `-V` now reports the actual version from `package.json` instead of the hardcoded `0.1.0` from the initial scaffold. Published 0.4.0 was affected by this.

## [0.4.0] - 2026-06-23

### Fixed
- `@inquirer/prompts@7` cancellation (Ctrl-C / Esc) now exits cleanly with code 0 instead of surfacing as `Unexpected error: User force closed the prompt with 0 null`. Affects the new `create` command and the pre-existing `save` and `switch` commands.

### Documentation
- `CLAUDE.md` with versioning policy for the pre-1.0 `0.x.y` range: bump rules, criteria for graduating to `1.0.0`, and a release checklist.

## [0.3.0] - 2026-06-23

### Added
- `create` subcommand: interactive wizard for creating profiles from 5 built-in providers (GLM, DeepSeek, Kimi, MiniMax, Qwen)
- Steps: select provider → confirm alias → confirm/override default BASE_URL & model → enter API key (masked) → real API validation → write `settings.json.<alias>` → activate as current
- Failure submenu on validation error: Retry / Enter different key / Edit URL or model / Cancel
- `providers.ts` registry with `getProvider(id)` lookup
- `validator.ts` Anthropic Messages protocol ping (`POST /v1/messages`, `max_tokens: 1`, 10s timeout)
- `ValidationError` class for API validation failures
- API key written in plaintext to settings.json (same as `save`)

### Security
- API keys stored in plaintext in `settings.json.<alias>` and `~/.claude/settings.json` — file permissions are the only protection. Same risk surface as existing `save` command.

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