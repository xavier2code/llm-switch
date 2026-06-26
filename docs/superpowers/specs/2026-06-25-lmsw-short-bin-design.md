# Spec: Add `sw` Short CLI Bin Alias

**Date:** 2026-06-25
**Status:** Draft, awaiting review
**Scope:** `packages/cli/`

## Problem

The `llm-switch` CLI is invoked many times per day by users who switch between
LLM profiles frequently. The full command name is 10 characters plus a hyphen
(`llm-switch switch glm`), which is verbose for a high-frequency command and
inconsistent with the modern short-CLI convention (`gh`, `rg`, `fd`, `jq`, `bat`,
`fzf`).

Renaming the project (npm package, GitHub repo) is not viable:

- The npm name `llm-switch` has established search presence and CHANGELOG
  history that would need to be reset.
- The on-disk profile directory (`~/.claude/llm-switch/`, etc.) is **user data**
  and cannot be renamed without a migration that risks breaking upgrades.
- A clean short name is hard to find on npm (`flip`, `swap`, `cast`, `morph`,
  `pivot`, `mask`, `cue`, `hop`, `swing`, `snap`, `zap`, `flick`, `toggle`,
  `llms`, `lsm`, `lsx`, `lls`, `lms` are all taken; `lms` in particular belongs
  to LM Studio's CLI and would silently collide in `PATH`).

## Solution

Keep the package name `llm-switch` and the on-disk `llm-switch/` directory
unchanged. Add a second `bin` entry `sw` alongside the existing `llm-switch`
bin. The new `sw` bin becomes the primary documented command; the old
`llm-switch` bin keeps working but prints a one-line deprecation warning to
stderr.

## Design

### Bin layout

`packages/cli/bin/` will hold two shim files. Both import the same compiled
entry (`../dist/cli.js`); only the deprecated shim prints a warning first.

```
packages/cli/bin/
  llm-switch.js    # existing shim, plus stderr deprecation warning
  sw.js          # NEW shim, just imports dist/cli.js
```

`packages/cli/package.json`:

```json
"bin": {
  "llm-switch": "bin/llm-switch.js",
  "sw": "bin/sw.js"
}
```

The new `sw.js` shim:

```js
#!/usr/bin/env node
import('../dist/cli.js');
```

The updated `llm-switch.js` shim:

```js
#!/usr/bin/env node
process.stderr.write(
  "[llm-switch] The 'llm-switch' command is deprecated and will be removed in a future release. Use 'sw' instead.\n"
);
import('../dist/cli.js');
```

### Commander program name

`packages/cli/src/cli.ts` line 57 changes:

```diff
-  .name('llm-switch')
+  .name('sw')
```

This affects:
- The `Usage:` line printed in `--help`.
- The command name used in commander's own error messages.

All `$ llm-switch ...` examples in `addHelpText(...)` blocks (lines 89–91,
117–119, 152–153, 187–190, 228–229, 258–259, 289) change to `$ sw ...`.

### User-facing error messages

The following strings reference the command name in suggestions and prompts.
They change from `llm-switch` to `sw`:

- `packages/cli/src/messages.ts` line 23: `Use: llm-switch ${command} <alias>`
- `packages/cli/src/commands/list.ts` line 14: `Create one with: llm-switch save <alias>`
- `packages/cli/src/commands/list.ts` line 33: ``Use `llm-switch switch` to change active profile.``
- `packages/cli/src/commands/switch.ts` line 28: ``Run 'llm-switch list' to see available profiles.``
- `packages/cli/src/commands/init.ts` line 54: `'Which tools should llm-switch manage? (Space to toggle)'`
- `packages/cli/src/commands/init.ts` line 79: `'Initialized llm-switch for:\n'`

### Things that DO NOT change (explicit non-goals)

- **On-disk directory `~/.claude/llm-switch/`** — user data; renaming would
  break upgrades.
- **`src/config.ts`** `getConfigDir` and related paths that produce the literal
  `llm-switch/` segment — same reason.
- **npm package name `llm-switch`** — keep for search presence and continuity.
- **GitHub repo URL** — unchanged.
- **Help text on lines 70–71 of `cli.ts`** — these describe the on-disk file
  layout, which still uses `llm-switch/profiles/...` and
  `llm-switch/backups/...`. They are correct as-is and stay literal.
- **`packages/claude-code-plugin/`** — the plugin's package.json and
  `.claude-plugin/plugin.json` are version-synced to the CLI per CLAUDE.md
  Option A, but they don't reference the bin name, so no string changes here.
- **`src/ui.ts`** Symbol.for('llm-switch:create-new') — internal marker, not
  user-facing.
- **Internal `tmpdir()` test prefixes** (`llm-switch-test-`, etc.) — these are
  test fixtures, not user-facing.

### Deprecation warning behavior

- Printed once to **stderr** before the command runs.
- Written directly via `process.stderr.write(...)` so it appears immediately,
  before commander parses argv.
- Suppressible via `NO_COLOR`-style env vars? **No** — keep simple. Users who
  hate it can grep/sed it out; the warning is short and rare.
- The warning is NOT printed when invoked via `sw` (only via `llm-switch`).

### Removal timeline

- **0.8.0** (next minor): introduce `sw`; `llm-switch` prints deprecation
  warning. Documented in CHANGELOG under `### Deprecated`.
- **A future minor (TBD, likely 0.10.0 or 0.11.0)**: remove the `llm-switch`
  bin entirely. The exact version is a maintainer decision at the time;
  CHANGELOG should note the version when it ships.

## Files changed

| Path | Change |
|------|--------|
| `packages/cli/bin/llm-switch.js` | Add stderr deprecation line |
| `packages/cli/bin/sw.js` | **New file**, 2-line shim |
| `packages/cli/package.json` | Add `sw` to `bin` map |
| `packages/cli/src/cli.ts` | `.name('sw')`; update `$ llm-switch ...` → `$ sw ...` in help text |
| `packages/cli/src/messages.ts` | `Use: llm-switch ...` → `Use: sw ...` |
| `packages/cli/src/commands/list.ts` | 2 user-facing strings |
| `packages/cli/src/commands/switch.ts` | 1 user-facing string |
| `packages/cli/src/commands/init.ts` | 2 user-facing strings |
| `README.md` | Lead with `sw` in usage section; add migration note |
| `CHANGELOG.md` | `[Unreleased]` → `### Added` (`sw` bin) and `### Deprecated` (`llm-switch` bin) |
| `test/cli.test.ts` | Add `sw` E2E + deprecation-warning assertions |

## Test plan

### New tests in `test/cli.test.ts`

1. **E2E via `sw`**: invoke `node bin/sw.js list` (with a temp profile
   directory). Assert exit code 0, stdout contains expected list output,
   stderr does **not** contain the deprecation string.
2. **E2E via `llm-switch`**: invoke `node bin/llm-switch.js list` under the
   same conditions. Assert exit code 0, command runs successfully, stderr
   contains the exact deprecation string.
3. **Help text**: invoke `node bin/sw.js --help`. Assert stdout contains
   `Usage: sw` and does **not** start a usage line with `llm-switch`.

### Unit tests for renamed strings

Update existing assertions in `test/commands/list.test.ts`,
`test/commands/switch.test.ts`, `test/commands/init.test.ts` that check for
the old `llm-switch` strings — they should now assert `sw`.

### Manual smoke

- `pnpm install`, `pnpm build`.
- `node packages/cli/bin/sw.js --help` → shows `Usage: sw ...`.
- `node packages/cli/bin/llm-switch.js --help` → shows `Usage: sw ...`
  (commander name is `sw` regardless of bin) AND stderr prints the
  deprecation warning.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` all green.

## Documentation

### CHANGELOG `[Unreleased]` section

```markdown
## [Unreleased]

### Added
- `sw` short CLI bin alias. `npm i -g llm-switch` now installs both
  `llm-switch` and `sw`; `sw` is the recommended command name in
  documentation going forward.

### Deprecated
- The `llm-switch` bin now prints a one-line stderr warning pointing to
  `sw`. It will be removed in a future minor release.
```

### README

- The "Usage" section at the top of README.md uses `sw` in all examples.
- A new short subsection "Migration from `llm-switch`" notes:
  - Both commands work today.
  - `sw` is preferred; `llm-switch` will be removed.
  - No action needed for existing scripts; replace at your leisure.

## Risk assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing scripts using `llm-switch` break on upgrade | None in 0.8.0 | Old bin kept; warning is non-fatal |
| `sw` collides with another user's tool in `PATH` | Low | `sw` is available on npm as a name; only conflicts at install if another package registers the same bin (none known) |
| On-disk `llm-switch/` directory confused with command name in docs | Medium | Explicitly listed under "Things that DO NOT change" in this spec and in code comments where the literal appears in help text |
| Commander `.name('sw')` causes commander error messages to look like a different tool | Low | Desired — `sw` IS the tool |

## Out of scope

- Removing the on-disk `llm-switch/` directory or migrating to a new path.
- Renaming the npm package or GitHub repo.
- Changing internal `Symbol.for('llm-switch:create-new')` markers.
- Plugin changes (no bin references in the plugin).