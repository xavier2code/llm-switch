# `sw` Short Bin Alias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `sw` short CLI bin alias alongside the existing `llm-switch` bin, with the old bin emitting a stderr deprecation warning, so daily CLI invocation becomes 4 characters instead of 10.

**Architecture:** Add a second Node shim file (`bin/sw.js`) that imports the same compiled entry as `bin/llm-switch.js`. Update commander `.name()` and all user-facing command-invocation strings to `sw`. The on-disk `llm-switch/` profile directory and project name stay unchanged.

**Tech Stack:** Node 20+, TypeScript, commander 12, tsup, vitest.

**Reference spec:** `docs/superpowers/specs/2026-06-25-sw-short-bin-design.md`

---

## File map (what changes, what doesn't)

| File | Action | Why |
|------|--------|-----|
| `packages/cli/bin/sw.js` | Create | New short bin shim |
| `packages/cli/bin/llm-switch.js` | Modify | Print stderr deprecation before import |
| `packages/cli/package.json` | Modify | Add `sw` to `bin` map |
| `packages/cli/src/cli.ts` | Modify | `.name('sw')`; help text `$ llm-switch ...` → `$ sw ...` |
| `packages/cli/src/messages.ts` | Modify | Command-suggestion strings → `sw` |
| `packages/cli/src/commands/list.ts` | Modify | 2 command-suggestion strings → `sw` |
| `packages/cli/src/commands/switch.ts` | Modify | 1 command-suggestion string → `sw` |
| `packages/cli/src/commands/init.ts` | **Do NOT modify** | See spec deviation below |
| `packages/cli/src/config.ts` | **Do NOT modify** | On-disk `llm-switch/` path is data |
| `packages/cli/src/ui.ts` | **Do NOT modify** | Internal `Symbol.for('llm-switch:create-new')` marker |
| `packages/cli/test/cli.test.ts` | Modify | Parameterize `run()` to accept binPath; add `sw` tests |
| `packages/cli/test/commands/list.test.ts` | Modify | Assert error message suggests `sw` |
| `packages/cli/test/commands/switch.test.ts` | Modify | Assert error message suggests `sw` |
| `README.md` | Modify | Lead with `sw`; add migration note |
| `CHANGELOG.md` | Modify | `[Unreleased]` Added + Deprecated entries |

### Spec deviation note

The spec listed `packages/cli/src/commands/init.ts` lines 54 (`'Which tools should llm-switch manage?'`) and 79 (`'Initialized llm-switch for:'`) as user-facing strings to change. After analysis during planning, **these stay as `llm-switch`** because they reference the project / on-disk layout, not the command name. Concretely:

- `"Initialized llm-switch for: claude, opencode"` reads naturally — it tells the user that the `llm-switch/` profile layout was initialized for those targets.
- `"Initialized sw for: claude, opencode"` reads awkwardly — `sw` is a verb-like command name, not a noun describing what was set up.

If the maintainer disagrees, the change is a 2-line edit in `init.ts` plus updating the two assertions in `test/commands/init.test.ts` lines 88 and 136.

---

## Task 1: Wire up the `sw` bin (TDD)

**Files:**
- Modify: `packages/cli/test/cli.test.ts:7-31` (parameterize `run()`)
- Create: `packages/cli/bin/sw.js`
- Modify: `packages/cli/package.json:6-8`
- Modify: `packages/cli/src/cli.ts:57` (commander `.name()`)

- [ ] **Step 1: Parameterize the `run()` helper in `test/cli.test.ts`**

Replace the top of `test/cli.test.ts` so `run()` takes an explicit `binPath` and a `SW_BIN` constant is exported. The existing callers (inside `describe('cli e2e', ...)` and `describe('cli help output', ...)`) must be updated to pass `LLMSW_BIN` as the first argument.

New top of file:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const LLMSW_BIN = path.resolve(__dirname, '../bin/llm-switch.js');
const SW_BIN = path.resolve(__dirname, '../bin/sw.js');

interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function run(
  binPath: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [binPath, ...args], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env, NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('exit', (code) => resolve({ stdout, stderr, code }));
  });
}
```

Update every existing call from `run([...])` to `run(LLMSW_BIN, [...])`. There are 17 such call sites in the file; each becomes `run(LLMSW_BIN, [...], {...})` (preserving the existing third-argument options object where present).

- [ ] **Step 2: Add a failing test for the `sw` bin**

Inside the existing `describe('cli e2e', ...)` block (after the `'LLM_SWITCH_TARGET env var selects opencode'` test), add:

```ts
  it('sw bin shows "Usage: sw" in --help', async () => {
    const r = await run(SW_BIN, ['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Usage: sw');
  });
```

- [ ] **Step 3: Run the test, expect FAIL**

```bash
pnpm --filter llm-switch test -- cli.test.ts
```

Expected: FAIL — `bin/sw.js` does not exist yet, so spawn ENOENTs and `r.code` is non-null but not 0 (or the test times out). Look for a line like `FAIL packages/cli/test/cli.test.ts > cli e2e > sw bin shows "Usage: sw" in --help`.

- [ ] **Step 4: Create `packages/cli/bin/sw.js`**

```js
#!/usr/bin/env node
import('../dist/cli.js');
```

- [ ] **Step 5: Register `sw` in `packages/cli/package.json`**

Replace the existing `bin` object:

```json
  "bin": {
    "llm-switch": "bin/llm-switch.js",
    "sw": "bin/sw.js"
  },
```

- [ ] **Step 6: Change commander program name in `packages/cli/src/cli.ts`**

In the file at line 57, change:

```diff
-  .name('llm-switch')
+  .name('sw')
```

- [ ] **Step 7: Rebuild and re-run the test, expect PASS**

```bash
pnpm --filter llm-switch build
pnpm --filter llm-switch test -- cli.test.ts
```

Expected: the new test passes. All pre-existing tests in `cli.test.ts` should still pass — they use `LLMSW_BIN` and assert user-facing output that doesn't depend on the commander program name (except line 57's `'llm-switch'` assertion, which we address in Task 3).

- [ ] **Step 8: Commit**

```bash
git add packages/cli/bin/sw.js packages/cli/package.json packages/cli/src/cli.ts packages/cli/test/cli.test.ts
git commit -m "feat(cli): add sw short bin alias"
```

---

## Task 2: Add deprecation warning to the `llm-switch` bin

**Files:**
- Modify: `packages/cli/bin/llm-switch.js`
- Modify: `packages/cli/test/cli.test.ts`

- [ ] **Step 1: Add a failing test that asserts the deprecation warning**

In `test/cli.test.ts`, inside the `describe('cli e2e', ...)` block (right after the test added in Task 1), add:

```ts
  it('llm-switch bin prints deprecation warning to stderr', async () => {
    const r = await run(LLMSW_BIN, ['--help']);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("[llm-switch]");
    expect(r.stderr).toContain("'sw'");
  });

  it('sw bin does NOT print the deprecation warning', async () => {
    const r = await run(SW_BIN, ['--help']);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toContain("[llm-switch]");
    expect(r.stderr).not.toContain("deprecated");
  });
```

- [ ] **Step 2: Run, expect FAIL on the first new test**

```bash
pnpm --filter llm-switch test -- cli.test.ts
```

Expected: the `llm-switch bin prints deprecation warning` test FAILS because `bin/llm-switch.js` does not yet write to stderr. The `sw bin does NOT print` test passes (nothing currently prints).

- [ ] **Step 3: Update `packages/cli/bin/llm-switch.js`**

Replace the file contents with:

```js
#!/usr/bin/env node
process.stderr.write(
  "[llm-switch] The 'llm-switch' command is deprecated and will be removed in a future release. Use 'sw' instead.\n",
);
import('../dist/cli.js');
```

- [ ] **Step 4: Re-run, expect PASS**

```bash
pnpm --filter llm-switch test -- cli.test.ts
```

Expected: both new tests pass; no existing tests regress.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/bin/llm-switch.js packages/cli/test/cli.test.ts
git commit -m "feat(cli): deprecate llm-switch bin with stderr warning"
```

---

## Task 3: Update help text examples (`$ llm-switch ...` → `$ sw ...`)

**Files:**
- Modify: `packages/cli/src/cli.ts` (multiple addHelpText blocks)
- Modify: `packages/cli/test/cli.test.ts` (tighten help-text assertion)

The following `$ llm-switch ...` lines in `src/cli.ts` need to become `$ sw ...`. Each is inside a backtick-quoted addHelpText block, so the prefix character is `$` (space) and the change is mechanical.

- Line 89: `$ llm-switch list` → `$ sw list`
- Line 90: `$ llm-switch --target opencode list` → `$ sw --target opencode list`
- Line 91: `$ CLAUDE_CONFIG_DIR=/tmp/llm-switch-test llm-switch list` → `$ CLAUDE_CONFIG_DIR=/tmp/lsw-test lsw list` (note: `llm-switch-test` here is an arbitrary directory name in an example, not the tool — renaming keeps the example consistent with the new command)
- Line 113: `` `llm-switch restore` `` → `` `sw restore` ``
- Line 117: `$ llm-switch switch` → `$ sw switch`
- Line 118: `$ llm-switch switch glm` → `$ sw switch glm`
- Line 119: `$ llm-switch --target opencode switch glm` → `$ sw --target opencode switch glm`
- Line 144: `` `llm-switch/backups/<active>.bak` `` → **DO NOT CHANGE** (this is the on-disk directory; data path stays `llm-switch/`)
- Line 152: `$ llm-switch restore` → `$ sw restore`
- Line 153: `$ llm-switch --target opencode restore` → `$ sw --target opencode restore`
- Line 187: `$ llm-switch save glm` → `$ sw save glm`
- Line 188: `$ llm-switch save -f glm` → `$ sw save -f glm`
- Line 189: `$ llm-switch save` → `$ sw save`
- Line 190: `$ llm-switch --target opencode save glm` → `$ sw --target opencode save glm`
- Line 228: `$ llm-switch create` → `$ sw create`
- Line 229: `$ llm-switch --target opencode create` → `$ sw --target opencode create`
- Line 258: `$ llm-switch current` → `$ sw current`
- Line 259: `$ llm-switch --target opencode current` → `$ sw --target opencode current`
- Line 274 (description text): `'Detect installed CLI tools and initialize the llm-switch directory layout (interactive)'` → **DO NOT CHANGE** (refers to on-disk layout)
- Line 280 (help text): `which tools llm-switch should manage` → **DO NOT CHANGE** (conceptual project reference)
- Line 281: `creates the llm-switch/ directory layout` → **DO NOT CHANGE** (on-disk directory)
- Line 289: `$ llm-switch init` → `$ sw init`

- [ ] **Step 1: Add a failing test that asserts the new examples are present**

In `test/cli.test.ts`, inside `describe('cli help output', ...)`, add:

```ts
  it('list --help shows $ sw examples (not $ llm-switch)', async () => {
    const out = await helpFor(['list', '--help']);
    expect(out).toContain('$ sw list');
    expect(out).not.toContain('$ llm-switch list');
  });

  it('switch --help shows $ sw examples (not $ llm-switch)', async () => {
    const out = await helpFor(['switch', '--help']);
    expect(out).toContain('$ sw switch');
    expect(out).not.toContain('$ llm-switch switch');
  });
```

- [ ] **Step 2: Run, expect FAIL**

```bash
pnpm --filter llm-switch test -- cli.test.ts
```

Expected: the two new tests FAIL — the help text still says `$ llm-switch ...`.

- [ ] **Step 3: Apply the replacements in `src/cli.ts`**

Using a single search-and-replace pass over `packages/cli/src/cli.ts`, apply the changes listed above. Do NOT touch lines 144, 274, 280, or 281 (those are data-path / conceptual references).

- [ ] **Step 4: Tighten the existing `prints help with --help` assertion**

In `test/cli.test.ts`, find this test (lines 54–60):

```ts
  it('prints help with --help', async () => {
    const r = await run(LLMSW_BIN, ['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('llm-switch');
    expect(r.stdout).toContain('switch');
    expect(r.stdout).toContain('list');
  });
```

Replace `expect(r.stdout).toContain('llm-switch');` with two assertions: one for the command name and one for the on-disk layout path. Result:

```ts
  it('prints help with --help', async () => {
    const r = await run(LLMSW_BIN, ['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Usage: sw');
    expect(r.stdout).toContain('llm-switch/profiles');
    expect(r.stdout).toContain('switch');
    expect(r.stdout).toContain('list');
  });
```

- [ ] **Step 5: Rebuild and re-run, expect PASS**

```bash
pnpm --filter llm-switch build
pnpm --filter llm-switch test -- cli.test.ts
```

Expected: all tests in `cli.test.ts` pass.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/cli.ts packages/cli/test/cli.test.ts
git commit -m "docs(cli): switch help-text examples to sw"
```

---

## Task 4: Update user-facing command-suggestion strings

**Files:**
- Modify: `packages/cli/src/messages.ts:23`
- Modify: `packages/cli/src/commands/list.ts:14, 33`
- Modify: `packages/cli/src/commands/switch.ts:28`
- Modify: `packages/cli/test/commands/list.test.ts` (assert new error message)
- Modify: `packages/cli/test/commands/switch.test.ts` (assert new error message)
- Modify: `packages/cli/test/cli.test.ts` (assert `sw save` in `list` exit-1 stderr)

- [ ] **Step 1: Add failing tests for the new error-message strings**

In `test/commands/list.test.ts`, inside `describe('list command', ...)`, add:

```ts
  it('NoProfilesError message suggests sw save', async () => {
    await setupProfilesDir();
    try {
      await run({ target, stdout: { write: () => {} } });
      expect.fail('Expected NoProfilesError');
    } catch (err) {
      expect(err).toBeInstanceOf(NoProfilesError);
      const msg = (err as Error).message;
      expect(msg).toContain('sw save');
      expect(msg).not.toContain('llm-switch save');
    }
  });
```

In `test/commands/switch.test.ts`, inside `describe('switch command', ...)`, add:

```ts
  it('ProfileNotFoundError message suggests sw list', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');
    const io = mockIO();
    try {
      await run({ target, io });
      expect.fail('Expected ProfileNotFoundError');
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileNotFoundError);
      const msg = (err as Error).message;
      expect(msg).toContain('sw list');
      expect(msg).not.toContain('llm-switch list');
    }
  });
```

In `test/cli.test.ts`, find the existing test `'list exits 1 when no profiles'` and add one assertion:

```ts
  it('list exits 1 when no profiles', async () => {
    const r = await run(LLMSW_BIN, ['list'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('No profiles found');
    expect(r.stderr).toContain('sw save');
  });
```

- [ ] **Step 2: Run, expect FAIL on the new assertions**

```bash
pnpm --filter llm-switch test -- list.test.ts switch.test.ts cli.test.ts
```

Expected: the three new assertions FAIL because the source still says `llm-switch`.

- [ ] **Step 3: Update `packages/cli/src/messages.ts`**

In the file, the relevant line is inside `interactiveTTYRequired(command)`:

```ts
  return `${INTERACTIVE_TTY_REQUIRED} Use: sw ${command} <alias>`;
```

If the line currently says `llm-switch ${command}`, replace `llm-switch` with `sw`.

- [ ] **Step 4: Update `packages/cli/src/commands/list.ts`**

Line 14:

```diff
-    throw new NoProfilesError('No profiles found. Create one with: llm-switch save <alias>');
+    throw new NoProfilesError('No profiles found. Create one with: sw save <alias>');
```

Line 33:

```diff
-    lines.push('Use `llm-switch switch` to change active profile.');
+    lines.push('Use `sw switch` to change active profile.');
```

- [ ] **Step 5: Update `packages/cli/src/commands/switch.ts`**

Line 28:

```diff
-        `Profile '${io.alias}' not found. Run 'llm-switch list' to see available profiles.`,
+        `Profile '${io.alias}' not found. Run 'sw list' to see available profiles.`,
```

- [ ] **Step 6: Re-run, expect PASS**

```bash
pnpm --filter llm-switch test -- list.test.ts switch.test.ts cli.test.ts
```

Expected: the new tests pass; no existing tests regress.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/messages.ts packages/cli/src/commands/list.ts packages/cli/src/commands/switch.ts packages/cli/test/commands/list.test.ts packages/cli/test/commands/switch.test.ts packages/cli/test/cli.test.ts
git commit -m "refactor(cli): point error-message suggestions at sw"
```

---

## Task 5: Verify `init.ts` is unchanged and `init` tests still pass

**Files:** None modified in this task — verification only.

- [ ] **Step 1: Confirm `init.ts` was not modified**

```bash
git diff --stat HEAD~4 -- packages/cli/src/commands/init.ts
```

Expected: empty output (no changes to init.ts across the four commits above).

- [ ] **Step 2: Run the init tests**

```bash
pnpm --filter llm-switch test -- init.test.ts
```

Expected: all `init.test.ts` tests pass. Specifically, line 88's assertion `expect(out).toMatch(/Initialized llm-switch/)` and line 136's assertion `expect(io.writes.join('')).toMatch(/Initialized llm-switch/)` continue to pass because the source message in `init.ts` line 79 is unchanged.

- [ ] **Step 3: No commit**

Nothing to commit in this task. If `git status` is not clean after this step, investigate.

---

## Task 6: Update `README.md`

**Files:**
- Modify: `README.md` (Usage section + new migration note)

- [ ] **Step 1: Replace `llm-switch` with `sw` in the Usage examples**

In `README.md`, every example of the form `` `llm-switch <subcommand> ...` `` in the Usage section (starting around line 65) becomes `` `sw <subcommand> ...` ``. Read the file first, then apply mechanical replacements. Do **not** touch:

- The `# llm-switch` heading on line 1 (project title)
- The package install line `npm i -g llm-switch` on line 60 (npm package name, not command)
- References to the on-disk `llm-switch/` directory in any directory-layout diagrams
- The "Security note" section (does not contain command invocations)

- [ ] **Step 2: Add a short migration subsection**

Immediately after the Usage section (before the "Security note" section), add a subsection titled `### Migrating from \`llm-switch\``. Suggested text:

```markdown
### Migrating from `llm-switch`

Both `llm-switch` and `sw` work today. `sw` is the preferred
invocation going forward. The `llm-switch` command still runs but prints
a deprecation warning to stderr; it will be removed in a future release.

No action is required — your existing scripts keep working. To migrate
manually, replace `llm-switch` with `sw` in any aliases, shell history,
or scripts.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): lead with sw, add migration note"
```

---

## Task 7: Update `CHANGELOG.md`

**Files:**
- Modify: `CHANGELOG.md` (the `[Unreleased]` section at the top)

- [ ] **Step 1: Add `### Added` and `### Deprecated` blocks to `[Unreleased]`**

Find the `## [Unreleased]` section (currently empty per the spec, line 8 of `CHANGELOG.md`) and replace it with:

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

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): note sw alias and llm-switch deprecation"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run the full test suite**

```bash
pnpm --filter llm-switch test
```

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter llm-switch typecheck
```

Expected: no errors.

- [ ] **Step 3: Run lint**

```bash
pnpm --filter llm-switch lint
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

```bash
node packages/cli/bin/sw.js --help | head -5
node packages/cli/bin/llm-switch.js --help 2>&1 | head -5
```

Expected:
- `sw --help` prints `Usage: sw ...` and no deprecation warning.
- `llm-switch --help` prints `Usage: sw ...` AND a stderr line starting with `[llm-switch]`.

- [ ] **Step 5: Inspect git log**

```bash
git log --oneline HEAD~7..HEAD
```

Expected: 7 commits, in order:

1. `feat(cli): add sw short bin alias`
2. `feat(cli): deprecate llm-switch bin with stderr warning`
3. `docs(cli): switch help-text examples to sw`
4. `refactor(cli): point error-message suggestions at sw`
5. `docs(readme): lead with sw, add migration note`
6. `docs(changelog): note sw alias and llm-switch deprecation`

(Task 5 produces no commit; total is 6 commits plus the spec commit.)

- [ ] **Step 6: Hand off to release flow**

This change adds a new user-facing CLI alias. Per `CLAUDE.md`, this is a **minor** version bump (new subcommand-style feature). The release checklist in `CLAUDE.md` should be followed for the next release (`0.8.0`):

- Bump `packages/cli/package.json` version to `0.8.0`
- Bump `packages/claude-code-plugin/package.json` and `packages/claude-code-plugin/.claude-plugin/plugin.json` to `0.8.0`
- Move the `[Unreleased]` block in `CHANGELOG.md` to a dated `## [0.8.0]` block
- Tag, push, publish

(The release checklist itself is out of scope for this plan; flag it to the maintainer.)

---

## Self-review

### Spec coverage

| Spec requirement | Task |
|------------------|------|
| New `bin/sw.js` shim | Task 1 |
| Old `bin/llm-switch.js` prints stderr deprecation warning | Task 2 |
| `package.json` registers both bins | Task 1 |
| `commander .name('sw')` | Task 1 |
| `$ llm-switch ...` examples in help text → `$ sw ...` | Task 3 |
| `messages.ts` command suggestion → `sw` | Task 4 |
| `commands/list.ts` 2 strings → `sw` | Task 4 |
| `commands/switch.ts` 1 string → `sw` | Task 4 |
| `commands/init.ts` lines 54, 79 (spec says change; deviation keeps `llm-switch`) | Task 5 (verifies deviation holds) |
| README leads with `sw` + migration note | Task 6 |
| CHANGELOG `[Unreleased]` Added + Deprecated blocks | Task 7 |
| E2E test that `sw --help` shows `Usage: sw` | Task 1 |
| E2E test that `llm-switch` prints deprecation | Task 2 |
| E2E test that `sw` does NOT print deprecation | Task 2 |
| Help-text example assertions | Task 3 |
| Error-message assertions | Task 4 |
| Final lint + typecheck + test pass | Task 8 |

### Placeholder scan

- No "TBD", "TODO", "fill in details" markers.
- Every code change shows the exact code.
- Every command shows the exact command and expected output.
- The spec deviation (`init.ts` not modified) is called out explicitly in both the file map and Task 5.

### Type / name consistency

- Bin path constants: `LLMSW_BIN` (existing path, deprecated bin) and `SW_BIN` (new path) — introduced in Task 1 Step 1 and used consistently throughout.
- Deprecation warning string: shown verbatim in Task 2 Step 3, referenced in tests in Task 2 Step 1.
- All `it(...)` test descriptions match across steps.