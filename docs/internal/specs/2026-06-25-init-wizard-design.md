# Interactive `init` Wizard — Design

**Date:** 2026-06-25
**Status:** Approved (brainstorming)
**Targets version:** 0.7.0

## Context

`llm-switch` 0.6.0 introduced multi-target support (Claude Code + OpenCode) and
a per-tool `llm-switch/` subdirectory layout. Today a new user has no guided
onboarding: they must already know which tools are installed, where their configs
live, and that `llm-switch` only manages a subdirectory (never the tool's own
config). This design adds an interactive **init wizard** that detects installed
tools, lets the user choose which to manage, checks their configs, and creates
the `llm-switch/` directory structure for each.

## Goals

- Detect whether Claude Code and OpenCode are installed on the host.
- Let the user multi-select which tools `llm-switch` should manage (installed or not).
- For each selected tool, warn if its active config is missing, then create the
  `llm-switch/` directory structure (profiles + backups), migrating any legacy
  flat-layout files in the process.
- Offer the wizard both as an explicit `llm-switch init` command and as an
  automatic one-time trigger on first run (TTY only).

## Non-goals

- Creating or modifying the tool's own active config (`settings.json`,
  `opencode.json`). That is the tool's responsibility.
- Persisting a default-target preference. Runtime targeting stays `--target` /
  `LLM_SWITCH_TARGET` (default `claude`); the wizard only initializes directories.
- A global onboarding marker file. The gate reuses each target's `llm-switch/`
  directory existence (see Approach).
- Database-backed state.

## Approach: reuse `ensureMigrated` as the gate

Each command action currently does `resolveTarget(...)` → `ensureMigrated(target)`
→ `cmd.run(...)`. The wizard slots in between resolveTarget and ensureMigrated:

```
const target = resolveTarget(...);
await maybeRunInitWizard(target);   // NEW: interactive, TTY-gated
await ensureMigrated(target);        // silent fallback / legacy migration
await cmd.run(...);
```

`maybeRunInitWizard(target)`:
- Returns immediately when `!process.stdout.isTTY` (CI/scripts unaffected —
  `ensureMigrated` then silently creates the dir, exactly as today).
- Returns immediately when `exists(getLswitchDir(target))` (already
  initialized for this target).
- Otherwise runs the wizard. Whether the user completes or cancels, the
  subsequent `ensureMigrated(target)` creates the resolved target's dir, so the
  wizard does not re-fire for that target on the next run.

Consequence: the wizard fires once per target on first TTY use. If a user
completes the wizard selecting only OpenCode, a later Claude-targeted command
will fire the wizard once more for Claude — acceptable and semantically correct
(first-time Claude setup).

## Components

### `detector.ts` (new)

- `detectTool(id: TargetId): Promise<boolean>` — checks PATH for the tool's
  binary via `command -v <name>` (unix) / `where <name>` (Windows), using
  `node:child_process.execFileSync` with `shell: true` on unix. Any throw →
  `false` (treated as not installed).
- `detectInstalledTargets(): Promise<Record<TargetId, boolean>>` — maps over
  `TARGETS`.
- Binary names: `claude` for the `claude` target, `opencode` for the `opencode`
  target. Stored as a new `binaryName` field on `TargetConfig` (added to the
  registry in `config.ts`).

### `commands/init.ts` (new)

- `runInitWizard(io)` — the interactive flow (see Flow below).
- `maybeRunInitWizard(target)` — exported gate used by `cli.ts`.
- IO injection mirrors `create.ts`: `checkboxFn`, `detectFn`, `stdout`, `stderr`,
  `isTTY`. Default `detectFn` = `detectInstalledTargets`; default `checkboxFn` =
  `@inquirer/prompts` `checkbox`.

### `cli.ts` (modified)

- New `init` subcommand (description, help text, examples, exit codes) whose
  action resolves the target, calls `runInitWizard`, then runs `ensureMigrated`
  for completeness.
- Insert `await maybeRunInitWizard(target)` after `resolveTarget` and before
  `ensureMigrated` in the six existing actions (`list`, `switch`, `restore`,
  `save`, `create`, `current`).

### Reused (no change)

- `config.ts`: `ensureMigrated`, `getActiveConfigPath`, `getLswitchDir`,
  `exists`, `TARGETS`.
- `ui.ts`: `isCancel`, `isInquirerCancelError`.
- `messages.ts`: `INTERACTIVE_TTY_REQUIRED`.

## Flow (the wizard)

1. **Detect.** `detectInstalledTargets()` → `{ claude: bool, opencode: bool }`.
2. **Print status table** — one line per target: name, installed / not installed,
   default config path.
3. **If neither installed**, print a warning recommending the user install at
   least one, but continue (do not abort).
4. **Multi-select** via `checkbox` — "Which tools should llm-switch manage?".
   Choices include both targets; the installed ones are checked by default.
   Not-installed choices are labeled `"<name> (not installed)"` and remain
   selectable. Empty selection or cancel → `UserCancelledError`.
5. **Per selected tool:**
   - If `exists(getActiveConfigPath(target))` is false, write a warning to
     stderr: the tool's active config is missing; run the tool first so it can
     create it. Do **not** create the config.
   - Call `ensureMigrated(target)` — creates `llm-switch/profiles/` +
     `llm-switch/backups/` and migrates any legacy flat-layout files.
6. **Print completion summary** — per selected tool: the `llm-switch/` path and
   whether its active config was found.

## Error handling

- Detection failure (exec throws) → the tool is recorded as not installed; the
  wizard continues.
- Empty multi-select / cancel → `UserCancelledError`. In `cli.ts`'s `main()` the
  existing handler maps cancellation to exit 0 with no message (same as `create`/
  `switch`). In the auto-trigger path (`maybeRunInitWizard`), cancellation is
  swallowed so the originating command proceeds.
- `init` in a non-TTY → throws `UserCancelledError(INTERACTIVE_TTY_REQUIRED)` →
  exit 0 (consistent with `create`).
- The auto-trigger never runs outside a TTY, so it cannot disrupt CI/scripts.

## Directory initialization semantics

- Only `llm-switch/profiles/` and `llm-switch/backups/` are created, via
  `ensureMigrated` (which also performs legacy migration).
- The tool's active config is never created or modified by `llm-switch`.

## Testing

- `test/detector.test.ts` — mock `execFileSync`; assert installed / not
  installed, unix/Windows branches, exception → false.
- `test/commands/init.test.ts` — inject `checkboxFn` + `detectFn`; cover: both
  installed; one installed; neither installed (continues with warning); cancel;
  empty selection; active config missing → warning emitted and `ensureMigrated`
  still called; `ensureMigrated` invoked once per selected target; non-TTY →
  `UserCancelledError`.
- `test/cli.test.ts` (e2e) — `init --help` exists; `init` with no TTY exits 0;
  existing e2e commands under piped (non-TTY) input are unaffected by the new
  gate (no wizard, behavior unchanged).

## Versioning

New subcommand → minor bump per `CLAUDE.md`: **0.6.0 → 0.7.0**, applied in
lockstep to the CLI and `claude-code-plugin`. Not a breaking change (non-TTY/CI
behavior is preserved; the auto-trigger is TTY-gated and one-time per target).

## Risks

- **Auto-trigger in scripted contexts** — mitigated by the `isTTY` gate and the
  `init` command's own TTY requirement.
- **Wizard re-fires once per target** when a user selects a subset of tools —
  acceptable; documented above.
- **`command -v` shell dependency** — standard on macOS/Linux; Windows uses
  `where` as a fallback in `detector.ts`.
