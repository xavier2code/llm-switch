# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.1] - 2026-07-01

### Added

- Active profile tracking via an explicit `~/.llm-switch/active/<target-id>.json`
  record (`{ alias, switchedAt }`). `sw list` and `sw current` now show the
  recorded active profile instead of inferring it from `baseUrl` matches.
- Drift detection. When the active config file no longer matches the recorded
  active profile (e.g. edited by hand, or by the tool itself), `sw list` marks
  the entry with `◐` / `(active, drifted)` and `sw current` prints
  `Warning: active config has drifted from profile '<alias>'`.
- TUI confirmation dialog before activating a profile, and an inline
  confirmation bar in the profile panel for activate/delete/restore actions.
- TUI shows the `(active)` / `(active, drifted)` label inline next to the
  profile alias and in the detail panel.

### Changed

- TUI layout: profile panel split into fixed header / list / footer with a
  stable 5-item height; profile and detail panels now have fixed widths so the
  target panel is no longer squeezed on narrow terminals. Layout centers
  vertically and the profile page size adapts to the terminal height.
- TUI detail panel simplified to Base URL, API Key, and Path (provider/model
  line removed from list items to reduce noise).
- TUI keybindings bar moved to the bottom of the screen, below all panels.
- Selection borders replaced with arrow indicators to avoid layout shift, and
  arrows only appear on the focused panel for clarity.
- `deleteProfile` now also clears the active record when the deleted profile
  was the active one. `restore` clears the active record to reflect the
  restored state.
- README and CHANGELOG now consistently reference the centralized profile
  store path as `~/.llm-switch/` (the actual location since 0.9.0).
- README provider table now includes the OpenAI provider used for Codex.
- CLI `--help` provider list now includes OpenAI alongside the
  Anthropic-compatible providers.

### Fixed

- Active profile detection no longer relies on a fragile `baseUrl` string
  match against the active config file. It now uses the explicit record and
  content comparison, which correctly handles whitespace edits, model
  changes, and other legitimate config edits.

### Internal

- Removed 17 thin re-export shims in `packages/cli/src/` (the remaining 14 in
  this release plus the 3 removed in commit `148d685`). All callers import
  directly from `@llm-switch/core/*`.
- Split `tui/src/app.tsx` (855 → 296 lines) into a `useTui` hook plus focused
  panel / status / header components. Split `create-wizard.tsx` into a
  `useCreateWizard` hook plus step components. Extracted `cli/src/help-text.ts`
  and `cli/src/tui-bootstrap.ts` from `cli.ts`. Refactored the `create`
  command into focused step helpers and deduplicated the per-target output
  block across `create` / `switch` / `restore`.
- Aligned TypeScript to 5.9.3 across packages.

## [0.9.0] - 2026-06-26

### Added

- Interactive multi-target selection. In a TTY, every command now prompts you to
  multi-select which CLI tools (Claude Code, OpenCode, Codex) to act on, remembers
  your choice in `~/.llm-switch/state.json`, and reuses it next time.
  `--target <id>` skips the prompt and acts on exactly one tool. In non-interactive
  contexts the remembered set is reused, falling back to `--target`, then
  `LLM_SWITCH_TARGET`, then `claude`.
- Codex as a first-class target. Codex profiles are written as TOML
  (`~/.codex/config.toml`, overridable via `CODEX_HOME`). `create` routes provider
  selection and validation per target family — Anthropic-family targets use the
  Anthropic-compatible endpoint, Codex uses the OpenAI Chat Completions endpoint.
  A single `create` run builds and activates the profile on every selected target.
- `TargetAdapter` abstraction (`AnthropicJsonAdapter`, `OpenAiTomlAdapter`) that
  isolates per-format (JSON vs TOML) serialization, plus a `createAdapter` factory.
- Centralized profile store: profiles now live in
  `~/.llm-switch/profiles/<target-id>/<alias>.[json|toml]`, shared across
  tools instead of duplicated under each config directory.
- OpenAI provider and `validateOpenAi` validator for Codex `create`.
- Supporting modules: `ProfileStore`, `StateManager`, `TargetSelector`
  (`selectTargets`), and a one-time central-store migration
  (`ensureMigratedToCentralStore`) with per-target markers.

### Changed

- **Breaking**: profiles moved to the centralized store
  (`~/.llm-switch/profiles/<target-id>/...`). Existing per-tool
  `llm-switch/profiles/` profiles are copied into the central store automatically
  on first run (the originals are left in place); a per-target marker prevents
  re-copying.
- **Breaking**: all command `run()` functions now take a `targets` array (and a
  `store`) instead of a single `target`. `list` and `current` group output by
  target; `switch`, `save`, `restore`, and `create` loop over the selected targets.
- `switch` auto-creates a missing profile for a target from a same-family target's
  copy or the current active config when possible, so switching one alias across
  several tools works even before each tool has that profile saved.
- The first-run auto-trigger of the `init` wizard was removed — the per-command
  target selector now handles first run, and other commands create the layout on
  demand. `llm-switch init` remains for explicit detection + setup.
- Updated top-level and per-command help text to document interactive target
  selection, `CODEX_HOME`, and the centralized store path.
- Bumped `claude-code-plugin` to track the CLI at 0.9.0.

## [0.8.0] - 2026-06-26

### Added

- `sw` short CLI bin alias. `npm i -g llm-switch` now installs both
  `llm-switch` and `sw`; `sw` is the recommended command name in
  documentation going forward.

### Deprecated

- The `llm-switch` bin now prints a one-line stderr warning pointing to
  `sw`. It will be removed in a future minor release.

## [0.7.0] - 2026-06-25

### Added

- `init` subcommand: an interactive wizard that detects Claude Code and OpenCode
  on PATH, lets you multi-select which tools `llm-switch` should manage, warns
  about missing active configs, and creates the `llm-switch/` directory layout
  (profiles + backups) for each. Not-installed tools remain selectable with a
  warning.
- First-run auto-trigger: on first use of any command in a TTY, the wizard runs
  once per target (when that target's `llm-switch/` directory does not yet
  exist), then stays silent. Non-TTY / CI contexts are unaffected.
- `src/detector.ts` with `isToolBinaryInstalled` / `detectInstalledTargets`
  (PATH lookup via `command -v` / `where`).
- `TargetConfig.binaryName` field (`claude`, `opencode`).

### Changed

- The wizard never creates or modifies a tool's own active config
  (`settings.json` / `opencode.json`) — only the `llm-switch/` subdirectory.
- Bumped `claude-code-plugin` to track the CLI at 0.7.0.

## [0.6.0] - 2026-06-25

### Added

- Multi-target support. `llm-switch` now manages profiles for multiple CLI tools,
  not just Claude Code. The built-in targets are `claude` (default) and `opencode`.
  Select one with the global `--target` / `-t` flag or the `LLM_SWITCH_TARGET`
  environment variable. OpenCode uses `~/.config/opencode/opencode.json` by
  default, overridable via `OPENCODE_CONFIG_DIR`.
- New `Target` abstraction in `config.ts` (`TargetId`, `TargetConfig`, `TARGETS`,
  `getTarget`, `isTargetId`, `getDefaultTarget`) that centralizes per-tool config
  directory, active config file name, and restart hint.
- `ensureMigrated()` in `config.ts`: automatic one-way migration from the
  pre-0.6.0 flat layout to the new `llm-switch/` subdirectory layout, run on every
  command. Rolls back already-moved files if a rename fails midway.

### Changed

- **Breaking**: profiles and backups now live under each tool's `llm-switch/`
  subdirectory instead of scattered in the config directory root. For Claude Code:
  `llm-switch/profiles/<alias>.json` and `llm-switch/backups/settings.json.bak`.
  The profile file naming changed from `settings.json.<alias>` to
  `profiles/<alias>.json`. Existing files are migrated automatically on first run.
- **Breaking**: `scanner.ts` `listProfiles()` and `display.ts` `summarize()` now
  take a `TargetConfig` instead of a `ConfigDir`. All command `run()` functions
  accept a `target` field in their IO object.
- `config.ts` `getConfigDir()` is now target-aware; `getSettingsPath()` is
  replaced by `getActiveConfigPath(target)`. New `getLlmswitchDir`,
  `getProfilesDir`, `getBackupsDir` helpers.
- `messages.ts` `RESTART_HINT` is now `restartHint(target)` so the restart prompt
  names the correct tool (Claude Code vs OpenCode).
- `backup.ts` `backupCurrent()` now ensures the backup directory exists before
  writing, so a switch can never silently lose a backup if the directory is absent.
- Updated top-level and per-command help text to document both targets, the new
  env vars (`OPENCODE_CONFIG_DIR`, `LLM_SWITCH_TARGET`), and the new file layout.
- Bumped `claude-code-plugin` to track the CLI at 0.6.0.

## [0.5.2] - 2026-06-24

### Fixed

- npm package `bin` entry: use `bin/llm-switch.js` instead of `./bin/llm-switch.js` so the `llm-switch` command is correctly linked after install.

## [0.5.1] - 2026-06-24

### Removed

- Dropped the `zod` runtime dependency and deleted the orphan `src/schemas.ts` module. `zod` was only referenced by `test/schemas.test.ts` — no production code used `SettingsSchema` or `parseSettings` (the live parser in `display.ts` has its own `safeParse`). One fewer shipped dependency, smaller install footprint, no behavior change.
- Removed the dead `ReadlineIO` interface and the unused `_io` parameter from `pickProfile`, `promptAlias`, and `promptNewAlias` in `ui.ts`. These were dependency-injection hooks that were never wired up — the functions read `process.stdout.isTTY` directly and ignored the passed-in streams.
- Removed dead `stdin: Readable` fields from `CreateIO`, `SaveIO`, and `SwitchIO` interfaces, and the matching `stdin: process.stdin` arguments passed from `cli.ts`. After the `_io` parameters were removed, these fields were never read.

### Changed

- Extracted `parseProfileAliases()` in `scanner.ts`, now shared by `scanner.ts` and `display.ts`. The `settings.json.<alias>` prefix-parsing filter chain was duplicated verbatim in both files.
- Centralized repeated user-facing strings in a new `src/messages.ts` (`RESTART_HINT`, plus the `interactiveTtyRequiredHint()` / `INTERACTIVE_TTY_REQUIRED` helpers) so wording can be reworded in one place.
- `create.ts` now reuses `exists()` from `fs-utils.ts` instead of a local `fileExists()` copy that was identical to it.
- Moved `parseProfileAliases()` from `scanner.ts` to `config.ts` so the filename-convention parser lives with the other path helpers. `display.ts` no longer imports `scanner.ts`, removing the cross-layer dependency.
- `display.ts` `summarize()` now hashes profile files in parallel with `Promise.all`, matching `scanner.ts` `listProfiles()`.
- `messages.ts` `interactiveTtyRequiredHint()` now requires a `command` argument; the unused bare `llm-switch <alias>` branch is gone.
- `scanner.ts` `parseProfileAliases()` now uses a single combined filter instead of two chained `.filter()` calls.

### Fixed

- `current --help` now documents the correct exit code: the config-directory-not-found case exits `1` (matching `exit.ts` and `exit.test.ts`), not `2` as previously written.
- Non-TTY error hints now name the actual subcommand: `switch` suggests `llm-switch switch <alias>` and `save` suggests `llm-switch save <alias>`. `create` and the shared `ui.ts` guard use a plain "Interactive mode requires a TTY." with no `Use:` suffix, since neither has a non-interactive equivalent (the previous `llm-switch <alias>` suggestion was misleading for both).
- Aliases ending in `.bak` are now rejected by `save`/`switch`/`create` validation because they conflict with the backup file naming convention. Previously `save foo.bak` would silently write a file that `list`/`current`/`switch` filtered out as the backup.
- `switch --help` and `save --help` now document the `.bak` alias restriction.

## [0.5.0] - 2026-06-24

### Added

- Test coverage reporting via `@vitest/coverage-v8`. Coverage runs in CI on every PR + push to main with thresholds (80% lines/functions/statements, 75% branches). The HTML + lcov report is uploaded as an artifact from the Node 22 matrix run. Currently 96.35% lines, 92.54% functions, 100% branches across `src/`. New `pnpm -F llm-switch test:coverage` script for local runs.
- The internal planning documents under `docs/superpowers/` have been renamed to `docs/internal/` and now have a top-level `README.md` explaining their purpose (AI-assistant TDD plans and design specs, kept for archaeology, **not** user-facing). The previous name "superpowers" was an internal codename that meant nothing to public readers.
- `save` now supports a `--force` / `-f` flag. By default, `save` prompts for confirmation before overwriting an existing profile (mirroring the `create` wizard). `--force` skips the prompt. In non-TTY contexts with an existing profile and no `--force`, `save` exits 0 with a clear error instead of silently overwriting — preventing accidental loss of API keys.

## [0.4.3] - 2026-06-24

### Added

- CI now runs `pnpm audit --prod --audit-level=high` on every PR + push to main. Fails the build on `high` or `critical` vulnerabilities in production dependencies. Also added a `.github/dependabot.yml` that opens weekly PRs for `minor` and `patch` dependency updates (major bumps are ignored — they need manual review).
- `list` now sorts the active profile to the top of the output. The previously-alphabetical order is preserved for the inactive profiles; only the active one is hoisted. Easier to spot the current profile at a glance, especially with many aliases.
- `CONTRIBUTING.md` with dev setup, command reference, commit conventions, PR process, code layout, testing approach, and code of conduct.
- `SECURITY.md` with supported-versions policy, vulnerability disclosure instructions, intentional-security behaviors, and a list of historical fixes.
- Each subcommand's `--help` now includes usage examples, argument format hints (for `[alias]`), behavior notes, and exit codes. The top-level `--help` documents `CLAUDE_CONFIG_DIR` and lists the 5 built-in providers.
- `list` now hashes profile files in parallel using `Promise.all` instead of serially awaiting each one. With N profiles, the read+hash phase goes from O(N × t_per_file) to roughly O(t_slowest). The result order is unchanged (still alphabetical after the active-first sort applied in `list`).

### Changed

- Bumped the `claude-code-plugin` package version from `0.1.0` (frozen since initial release) to track the CLI per the release checklist in `CLAUDE.md`. This release moves it to `0.4.3`. Issue #14.
- Added `isProviderId()` type guard in `providers.ts`. `create.ts` now uses it to validate the return value of `@inquirer/prompts select()` before passing it to `getProvider()`, replacing an unsafe `as ProviderId` cast. If a non-string or non-ProviderId value ever slips through, the wizard now aborts with a clear error instead of crashing deep inside `getProvider()`.

## [0.4.2] - 2026-06-24

### Security

- All profile files (`settings.json`, `settings.json.<alias>`, `settings.json.bak`) are now written with mode `0600` automatically. Previously these files inherited the default umask (typically `0644`), allowing other local users to read API keys. The tool no longer requires a manual `chmod 600` after use.
- The `validate` step now rejects non-HTTPS `BASE_URL` values to prevent accidentally sending the API key in plaintext over HTTP. `https://` is required; `http://` is only allowed for `localhost`, `127.0.0.1`, and `::1` (so local proxies like LiteLLM still work). Malformed URLs are also rejected. On rejection the existing failure submenu in `create` prompts the user to edit the URL or model.

### Added

- ESLint flat config (TypeScript-aware via `@typescript-eslint`), Prettier, `.editorconfig`, and a pre-commit hook that runs `lint` + `format:check` on every commit. CI now has explicit `Lint` and `Format check` jobs. `pnpm -F llm-switch lint` and `pnpm -F llm-switch format` are the new developer commands.

### Changed

- Removed unused `log.info`, `log.success`, `log.warn`, `log.dim`, `log.bold`, `log.cyan` methods (only `log.error` was actually used by the CLI) and the dead `parseSettingsSafe` export from `schemas.ts`. Bundle is ~0.5 KB smaller as a result.
- Extracted duplicated helpers to `src/fs-utils.ts`: `sha256()` (was defined in both `scanner.ts` and `display.ts`, with `scanner.ts` using a dynamic `await import('node:crypto')` per call) and `exists()` (was defined identically in `save.ts` and `restore.ts`). The local `isCancel` in `create.ts` is replaced by the export from `ui.ts`, which is the canonical version (the only one that correctly handles the `NEW_SENTINEL` symbol). Bundle is ~0.4 KB smaller as a result.
- Removed dead `needsNewKey = false` assignment in `create.ts:120` (the catch block always reassigns it). Removed unused `ConfigDirNotFoundError` and `ConfigDir` imports from `test/commands/list.test.ts`. Re-formatted the whole tree with Prettier.

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
