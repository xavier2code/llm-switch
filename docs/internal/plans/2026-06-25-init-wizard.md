# Interactive `init` Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive `init` wizard that detects installed CLI tools (Claude Code, OpenCode), lets the user multi-select which to manage, warns about missing active configs, and creates the `llm-switch/` directory layout for each — available both as an `llm-switch init` command and as an automatic one-time trigger on first run (TTY only).

**Architecture:** A new `detector.ts` checks PATH for each tool's binary. A new `commands/init.ts` holds the wizard (`runInitWizard`) and the TTY-gated auto-trigger (`maybeRunInitWizard`). The wizard reuses the existing `ensureMigrated` to create directories and migrate legacy files. `cli.ts` gains an `init` subcommand and inserts `maybeRunInitWizard(target)` before `ensureMigrated(target)` in the six existing actions.

**Tech Stack:** TypeScript (ESM), `commander`, `@inquirer/prompts` (`checkbox`), `node:child_process.execFileSync`, vitest.

**Spec:** `docs/internal/specs/2026-06-25-init-wizard-design.md`

**Note on spec deviation:** the spec wrote the detection functions as `Promise<...>`; this plan implements them **synchronously** (`execFileSync` is inherently sync, detection runs once for two tools). The injected `detectFn` is therefore `() => Record<TargetId, boolean>`.

---

## File Structure

**Create:**
- `packages/cli/src/detector.ts` — PATH-based tool detection.
- `packages/cli/src/commands/init.ts` — wizard + auto-trigger gate.
- `packages/cli/test/detector.test.ts`
- `packages/cli/test/commands/init.test.ts`

**Modify:**
- `packages/cli/src/config.ts` — add `binaryName` to `TargetConfig` + both registry entries.
- `packages/cli/test/helpers.ts` — add `binaryName` to the two mock targets (keeps them assignable to `TargetConfig`).
- `packages/cli/src/cli.ts` — add `init` command; insert `await maybeRunInitWizard(target)` in the six actions.
- `packages/cli/test/cli.test.ts` — add `init` e2e cases.
- `packages/cli/package.json`, `packages/claude-code-plugin/package.json`, `packages/claude-code-plugin/.claude-plugin/plugin.json` — bump to `0.7.0`.
- `CHANGELOG.md` — add `[0.7.0]` section.
- `README.md` — document `init`.

---

## Task 1: Add `binaryName` to `TargetConfig`

**Files:**
- Modify: `packages/cli/src/config.ts` (interface + both `TARGETS` entries)
- Modify: `packages/cli/test/helpers.ts` (both mock targets)

- [ ] **Step 1: Update `config.ts`**

Add the `binaryName` field to the interface and both registry entries.

In `packages/cli/src/config.ts`, change the interface:

```ts
export interface TargetConfig {
  readonly id: TargetId;
  readonly displayName: string;
  readonly envConfigDir: string;
  readonly defaultConfigDir: string;
  readonly activeConfigFileName: string;
  readonly binaryName: string;
  readonly restartHint: string;
}
```

Add `binaryName` to the claude entry (right after `activeConfigFileName: 'settings.json',`):

```ts
    activeConfigFileName: 'settings.json',
    binaryName: 'claude',
    restartHint: 'Restart Claude Code to apply.',
```

And to the opencode entry (right after `activeConfigFileName: 'opencode.json',`):

```ts
    activeConfigFileName: 'opencode.json',
    binaryName: 'opencode',
    restartHint: 'Restart OpenCode to apply.',
```

- [ ] **Step 2: Update `test/helpers.ts`**

Add `binaryName` to both mock targets. In `mockClaudeTarget`, after `activeConfigFileName: 'settings.json',`:

```ts
    activeConfigFileName: 'settings.json',
    binaryName: 'claude',
    restartHint: 'Restart Claude Code to apply.',
```

In `mockOpencodeTarget`, after `activeConfigFileName: 'opencode.json',`:

```ts
    activeConfigFileName: 'opencode.json',
    binaryName: 'opencode',
    restartHint: 'Restart OpenCode to apply.',
```

- [ ] **Step 3: Verify typecheck + tests still pass**

Run: `pnpm -F llm-switch typecheck && pnpm -F llm-switch test`
Expected: typecheck clean, 200 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/config.ts packages/cli/test/helpers.ts
git commit -m "refactor(cli): add binaryName to TargetConfig for tool detection"
```

---

## Task 2: Tool detection (`detector.ts`)

**Files:**
- Create: `packages/cli/src/detector.ts`
- Test: `packages/cli/test/detector.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/test/detector.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { isToolBinaryInstalled, detectInstalledTargets } from '../src/detector.js';
import { mockClaudeTarget, mockOpencodeTarget } from './helpers.js';

const mockExec = vi.mocked(execFileSync);

describe('isToolBinaryInstalled', () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it('returns true when the binary resolves (exec does not throw)', () => {
    mockExec.mockReturnValue(Buffer.from('/usr/local/bin/claude'));
    expect(isToolBinaryInstalled(mockClaudeTarget())).toBe(true);
  });

  it('returns false when exec throws', () => {
    mockExec.mockImplementation(() => {
      throw new Error('spawn ENOENT');
    });
    expect(isToolBinaryInstalled(mockOpencodeTarget())).toBe(false);
  });

  it('queries the target binary name', () => {
    mockExec.mockReturnValue(Buffer.from(''));
    isToolBinaryInstalled(mockOpencodeTarget());
    const callArgs = mockExec.mock.calls[0]?.[1];
    expect(callArgs).toContain('opencode');
  });

  it('uses `where` and no shell on Windows', () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      mockExec.mockReturnValue(Buffer.from(''));
      isToolBinaryInstalled(mockClaudeTarget());
      expect(mockExec.mock.calls[0]?.[0]).toBe('where');
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    }
  });
});

describe('detectInstalledTargets', () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it('reports per-target presence across the registry', () => {
    mockExec.mockImplementation((_cmd, args) => {
      if ((args as string[]).includes('opencode')) return Buffer.from('');
      throw new Error('not found');
    });
    const result = detectInstalledTargets();
    expect(result.opencode).toBe(true);
    expect(result.claude).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F llm-switch test detector`
Expected: FAIL — `Cannot find module '../src/detector.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/cli/src/detector.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { TARGETS, type TargetConfig, type TargetId } from './config.js';

/**
 * Returns true if the target's binary is resolvable on PATH. Uses
 * `command -v` (unix) or `where` (Windows). Any failure is treated as
 * "not installed" rather than an error.
 */
export function isToolBinaryInstalled(target: TargetConfig): boolean {
  const isWindows = process.platform === 'win32';
  const cmd = isWindows ? 'where' : 'command';
  const args = isWindows ? [target.binaryName] : ['-v', target.binaryName];
  try {
    execFileSync(cmd, args, { shell: !isWindows, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects every target in the registry. Returns a map keyed by TargetId.
 */
export function detectInstalledTargets(): Record<TargetId, boolean> {
  const result = {} as Record<TargetId, boolean>;
  for (const target of TARGETS) {
    result[target.id] = isToolBinaryInstalled(target);
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F llm-switch test detector`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/detector.ts packages/cli/test/detector.test.ts
git commit -m "feat(cli): add PATH-based tool detection"
```

---

## Task 3: The wizard — `runInitWizard`

**Files:**
- Create: `packages/cli/src/commands/init.ts` (initial version with `runInitWizard` only)
- Test: `packages/cli/test/commands/init.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/test/commands/init.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runInitWizard } from '../../src/commands/init.js';
import { UserCancelledError } from '../../src/errors.js';
import { getActiveConfigPath, getLlmswitchDir, type TargetId } from '../../src/config.js';
import { mockClaudeTarget } from '../helpers.js';

let tmpDir: string;
let savedClaude: string | undefined;
let savedOpencode: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-init-'));
  savedClaude = process.env.CLAUDE_CONFIG_DIR;
  savedOpencode = process.env.OPENCODE_CONFIG_DIR;
  // Point both targets at the same temp dir so assertions are easy.
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  process.env.OPENCODE_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  if (savedClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedClaude;
  if (savedOpencode === undefined) delete process.env.OPENCODE_CONFIG_DIR;
  else process.env.OPENCODE_CONFIG_DIR = savedOpencode;
  vi.restoreAllMocks();
});

function mockIO() {
  const writes: string[] = [];
  return {
    writes,
    stdout: { write: (s: string) => void writes.push(s) },
    stderr: { write: (s: string) => void writes.push(s) },
  };
}

describe('runInitWizard', () => {
  it('throws UserCancelledError when not TTY', async () => {
    const io = { ...mockIO(), isTTY: false };
    await expect(runInitWizard(io)).rejects.toBeInstanceOf(UserCancelledError);
  });

  it('prints detection status for both tools', async () => {
    const detectFn = () => ({ claude: true, opencode: false } as Record<TargetId, boolean>);
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    const out = io.writes.join('');
    expect(out).toContain('Claude Code');
    expect(out).toContain('OpenCode');
  });

  it('warns when no tool is installed', async () => {
    const detectFn = () => ({ claude: false, opencode: false } as Record<TargetId, boolean>);
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    expect(io.writes.join('')).toMatch(/no supported CLI tool detected/i);
  });

  it('creates llm-switch dirs for the selected target', async () => {
    const detectFn = () => ({ claude: true, opencode: true } as Record<TargetId, boolean>);
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    const stat = await fs.stat(path.join(tmpDir, 'llm-switch', 'profiles'));
    expect(stat.isDirectory()).toBe(true);
    expect((await fs.stat(path.join(tmpDir, 'llm-switch', 'backups'))).isDirectory()).toBe(true);
  });

  it('warns when an active config is missing but still initializes', async () => {
    const detectFn = () => ({ claude: true, opencode: true } as Record<TargetId, boolean>);
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    // No settings.json written -> missing.
    await runInitWizard(io);
    expect(io.writes.join('')).toMatch(/active config not found/i);
    expect((await fs.stat(path.join(tmpDir, 'llm-switch', 'profiles'))).isDirectory()).toBe(true);
  });

  it('does not warn when the active config exists', async () => {
    await fs.writeFile(getActiveConfigPath(mockClaudeTarget()), '{}');
    const detectFn = () => ({ claude: true, opencode: true } as Record<TargetId, boolean>);
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    expect(io.writes.join('')).not.toMatch(/active config not found/i);
  });

  it('throws UserCancelledError when no tool is selected', async () => {
    const detectFn = () => ({ claude: true, opencode: true } as Record<TargetId, boolean>);
    const checkboxFn = vi.fn().mockResolvedValue([] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await expect(runInitWizard(io)).rejects.toBeInstanceOf(UserCancelledError);
  });

  it('labels not-installed choices and leaves them unchecked', async () => {
    const detectFn = () => ({ claude: false, opencode: true } as Record<TargetId, boolean>);
    const checkboxFn = vi.fn().mockResolvedValue(['opencode'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    const arg = checkboxFn.mock.calls[0]?.[0] as {
      choices: Array<{ name: string; checked: boolean }>;
    };
    const claudeChoice = arg.choices.find((c) => c.name.startsWith('Claude'));
    expect(claudeChoice?.name).toMatch(/not installed/i);
    expect(claudeChoice?.checked).toBe(false);
  });

  it('prints a completion summary', async () => {
    await fs.writeFile(getActiveConfigPath(mockClaudeTarget()), '{}');
    const detectFn = () => ({ claude: true, opencode: true } as Record<TargetId, boolean>);
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);
    expect(io.writes.join('')).toMatch(/Initialized llm-switch/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F llm-switch test commands/init`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `packages/cli/src/commands/init.ts`:

```ts
import type { Writable } from 'node:stream';
import { checkbox } from '@inquirer/prompts';
import {
  TARGETS,
  ensureMigrated,
  getActiveConfigPath,
  getLlmswitchDir,
  getTarget,
  type TargetId,
} from '../config.js';
import { detectInstalledTargets } from '../detector.js';
import { exists } from '../fs-utils.js';
import { UserCancelledError } from '../errors.js';
import { INTERACTIVE_TTY_REQUIRED } from '../messages.js';

export interface InitIO {
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  checkboxFn?: typeof checkbox;
  detectFn?: () => Record<TargetId, boolean>;
}

export async function runInitWizard(io: InitIO): Promise<void> {
  if (!io.isTTY) {
    throw new UserCancelledError(INTERACTIVE_TTY_REQUIRED);
  }

  const detect = io.detectFn ?? detectInstalledTargets;
  const installed = detect();

  // 1. Detection status table.
  io.stdout.write('Detected CLI tools:\n');
  for (const target of TARGETS) {
    const status = installed[target.id] ? 'installed' : 'not installed';
    io.stdout.write(
      `  ${target.displayName.padEnd(12)} ${status.padEnd(14)} ${getActiveConfigPath(target)}\n`,
    );
  }
  io.stdout.write('\n');

  // 2. Warn if nothing is installed (still continue).
  if (!TARGETS.some((t) => installed[t.id])) {
    io.stderr.write(
      'Warning: no supported CLI tool detected on PATH. Install Claude Code or OpenCode first.\n\n',
    );
  }

  // 3. Multi-select which tools to manage.
  const checkboxFn = io.checkboxFn ?? checkbox;
  const choice = (await checkboxFn({
    message: 'Which tools should llm-switch manage? (Space to toggle)',
    choices: TARGETS.map((t) => ({
      name: installed[t.id] ? t.displayName : `${t.displayName} (not installed)`,
      value: t.id,
      checked: installed[t.id],
    })),
  })) as TargetId[];

  if (choice.length === 0) {
    throw new UserCancelledError('No tools selected.');
  }

  // 4. Per selected tool: warn if active config missing, then init dirs.
  const selected = choice.map((id) => getTarget(id));
  for (const target of selected) {
    const active = getActiveConfigPath(target);
    if (!(await exists(active))) {
      io.stderr.write(
        `Warning: ${target.displayName} active config not found at ${active}. Run ${target.displayName} once to create it.\n`,
      );
    }
    await ensureMigrated(target);
  }

  // 5. Completion summary.
  io.stdout.write('\nInitialized llm-switch for:\n');
  for (const target of selected) {
    const found = await exists(getActiveConfigPath(target));
    io.stdout.write(
      `  ${target.displayName}: ${getLlmswitchDir(target)} (active config ${found ? 'found' : 'missing'})\n`,
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -F llm-switch test commands/init`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/init.ts packages/cli/test/commands/init.test.ts
git commit -m "feat(cli): add interactive init wizard"
```

---

## Task 4: The auto-trigger gate — `maybeRunInitWizard`

**Files:**
- Modify: `packages/cli/src/commands/init.ts` (add `maybeRunInitWizard`)
- Test: `packages/cli/test/commands/init.test.ts` (append)

- [ ] **Step 1: Append failing tests**

Append to `packages/cli/test/commands/init.test.ts` (after the existing import block, add `maybeRunInitWizard` to the import and `mockClaudeTarget` is already imported):

Update the import line:

```ts
import { runInitWizard, maybeRunInitWizard } from '../../src/commands/init.js';
```

Append a new describe block at the end of the file:

```ts
describe('maybeRunInitWizard', () => {
  it('is a no-op in a non-TTY (test) environment', async () => {
    // process.stdout.isTTY is undefined under vitest -> early return.
    await expect(maybeRunInitWizard(mockClaudeTarget())).resolves.toBeUndefined();
  });

  it('is a no-op when the target is already initialized', async () => {
    await fs.mkdir(getLlmswitchDir(mockClaudeTarget()), { recursive: true });
    const original = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    try {
      // Would hang on the real checkbox if it ran; the existing dir must short-circuit.
      await expect(maybeRunInitWizard(mockClaudeTarget())).resolves.toBeUndefined();
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: original, configurable: true });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F llm-switch test commands/init`
Expected: FAIL — `maybeRunInitWizard` is not exported.

- [ ] **Step 3: Add the implementation**

Append to `packages/cli/src/commands/init.ts` (add the `isInquirerCancelError` import to the existing `ui.js`-free imports — add a new import line, and the function):

Add this import near the top of `init.ts`:

```ts
import { isInquirerCancelError } from '../ui.js';
```

Append at the end of the file:

```ts
/**
 * Auto-trigger gate. Runs the wizard once per target on first TTY use, then
 * stays silent (the wizard / subsequent ensureMigrated creates the dir). Never
 * runs outside a TTY, so CI/scripts are unaffected. Cancellation is swallowed
 * so the originating command proceeds.
 */
export async function maybeRunInitWizard(target: TargetConfig): Promise<void> {
  if (!process.stdout.isTTY) return;
  if (await exists(getLlmswitchDir(target))) return;
  try {
    await runInitWizard({
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: true,
    });
  } catch (err) {
    if (err instanceof UserCancelledError) return;
    if (isInquirerCancelError(err)) return;
    throw err;
  }
}
```

Also add `TargetConfig` to the existing config import in `init.ts`. Change:

```ts
import {
  TARGETS,
  ensureMigrated,
  getActiveConfigPath,
  getLlmswitchDir,
  getTarget,
  type TargetId,
} from '../config.js';
```

to:

```ts
import {
  TARGETS,
  ensureMigrated,
  getActiveConfigPath,
  getLlmswitchDir,
  getTarget,
  type TargetConfig,
  type TargetId,
} from '../config.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -F llm-switch test commands/init`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/init.ts packages/cli/test/commands/init.test.ts
git commit -m "feat(cli): add TTY-gated first-run init trigger"
```

---

## Task 5: Wire `init` into the CLI

**Files:**
- Modify: `packages/cli/src/cli.ts` (new `init` command + insert gate in 6 actions)
- Test: `packages/cli/test/cli.test.ts`

- [ ] **Step 1: Write the failing e2e tests**

In `packages/cli/test/cli.test.ts`, inside the `describe('cli e2e', ...)` block (e.g. after the `create exits 0 when no TTY` test), add:

```ts
  it('init --help mentions init', async () => {
    const r = await run(['init', '--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('init');
  });

  it('init exits 0 when no TTY (user cancel)', async () => {
    const r = await run(['init'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(0);
  });
```

And inside `describe('cli help output', ...)`, add to the `for (const cmd of [...])` array so `init --help` is checked for an Examples section:

Change:

```ts
  for (const cmd of ['list', 'switch', 'restore', 'save', 'create', 'current']) {
```

to:

```ts
  for (const cmd of ['list', 'switch', 'restore', 'save', 'create', 'current', 'init']) {
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F llm-switch build && pnpm -F llm-switch test cli`
Expected: FAIL — `init --help` reports unknown command (the e2e runs the built `dist`, so rebuild first).

- [ ] **Step 3: Add the `init` import in `cli.ts`**

In `packages/cli/src/cli.ts`, add to the command imports (after the `currentCmd` import):

```ts
import * as initCmd from './commands/init.js';
```

And add the gate import — change the existing config import usage. The file imports from `./config.js`; add `maybeRunInitWizard` is in `./commands/init.js`, already covered by `initCmd`. No new config import needed.

- [ ] **Step 4: Register the `init` command**

In `packages/cli/src/cli.ts`, add this command block (e.g. after the `current` command block, before `async function main()`):

```ts
program
  .command('init')
  .description('Detect installed CLI tools and initialize the llm-switch directory layout (interactive)')
  .addHelpText(
    'after',
    `
Interactive wizard: detects Claude Code / OpenCode on PATH, lets you multi-select
which tools llm-switch should manage, warns about missing active configs, and
creates the llm-switch/ directory layout (profiles + backups) for each.

Also runs automatically once per target on first run in a TTY.

Requires a TTY. In non-interactive contexts it exits 0 with no effect.

Examples:
  $ llm-switch init

Exit codes: 0 on success or clean cancellation.
`,
  )
  .action(async () => {
    await initCmd.runInitWizard({
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: Boolean(process.stdout.isTTY),
    });
  });
```

- [ ] **Step 5: Insert the auto-trigger gate in the six actions**

In `packages/cli/src/cli.ts`, each of the six actions (`list`, `switch`, `restore`, `save`, `create`, `current`) currently begins with:

```ts
    const target = resolveTarget(program.opts().target as string | undefined);
    await ensureMigrated(target);
```

Insert one line so each becomes:

```ts
    const target = resolveTarget(program.opts().target as string | undefined);
    await initCmd.maybeRunInitWizard(target);
    await ensureMigrated(target);
```

Apply this to all six actions. (The `init` command itself does not get the gate — it runs the wizard directly.)

- [ ] **Step 6: Rebuild and run the e2e tests**

Run: `pnpm -F llm-switch build && pnpm -F llm-switch test cli`
Expected: PASS — `init --help`, `init exits 0 when no TTY`, and the Examples-section check all pass; all prior e2e tests still pass (the gate is a no-op in the non-TTY e2e spawns).

- [ ] **Step 7: Run the full suite + lint + format + typecheck**

Run: `pnpm -F llm-switch test && pnpm -F llm-switch lint && pnpm -F llm-switch format && pnpm -F llm-switch typecheck`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/cli.ts packages/cli/test/cli.test.ts
git commit -m "feat(cli): add init command and first-run auto-trigger"
```

---

## Task 6: Version bump, CHANGELOG, README

**Files:**
- Modify: `packages/cli/package.json`, `packages/claude-code-plugin/package.json`, `packages/claude-code-plugin/.claude-plugin/plugin.json`
- Modify: `CHANGELOG.md`, `README.md`

- [ ] **Step 1: Bump versions to 0.7.0**

In `packages/cli/package.json`, change `"version": "0.6.0"` to `"version": "0.7.0"`.
In `packages/claude-code-plugin/package.json`, change `"version": "0.6.0"` to `"version": "0.7.0"`.
In `packages/claude-code-plugin/.claude-plugin/plugin.json`, change `"version": "0.6.0"` to `"version": "0.7.0"`.

- [ ] **Step 2: Add the CHANGELOG section**

In `CHANGELOG.md`, insert above `## [0.6.0]`:

```markdown
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
```

- [ ] **Step 3: Update README**

In `README.md`, add `init` to the usage block. After the `create` line:

```bash
llm-switch init                     # interactive wizard: detect tools and initialize directories
```

And add a short subsection after the "Migration from 0.5.x" subsection:

```markdown
### First-run setup

The first time you run any `llm-switch` command in a terminal, an interactive
wizard detects which CLI tools (Claude Code, OpenCode) are installed, lets you
choose which ones to manage, and creates the `llm-switch/` directory layout for
each. You can also run it any time with `llm-switch init`. The wizard only ever
creates `llm-switch/` directories — it never creates or edits a tool's own
config file.
```

- [ ] **Step 4: Verify build + version-reported test**

Run: `pnpm -F llm-switch build && node packages/cli/bin/llm-switch.js --version`
Expected: prints `0.7.0`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(release): bump to 0.7.0 with init wizard"
```

---

## Task 7: Final verification, push, PR

- [ ] **Step 1: Full local gate**

Run: `pnpm -F llm-switch test:coverage && pnpm -F llm-switch lint && pnpm -F llm-switch format:check && pnpm -F llm-switch typecheck && pnpm -F llm-switch build`
Expected: tests pass (existing 200 + new detector/init/cli tests), coverage above thresholds (80% lines/functions/statements, 75% branches), lint/format/typecheck/build all clean.

- [ ] **Step 2: Manual E2E sanity check**

Run (in a real terminal, TTY):

```bash
TMP=$(mktemp -d)
CLAUDE_CONFIG_DIR="$TMP" OPENCODE_CONFIG_DIR="$TMP" node packages/cli/bin/llm-switch.js init
find "$TMP" -type d | sort
rm -rf "$TMP"
```

Expected: the wizard shows detection status, accepts a multi-select, and creates `llm-switch/profiles` + `llm-switch/backups` for the selected tool(s).

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/init-wizard
gh pr create --base main --head feat/init-wizard \
  --title "feat(cli): interactive init wizard (0.7.0)" \
  --body "Implements the design in docs/internal/specs/2026-06-25-init-wizard-design.md."
```

---

## Self-Review Notes

- **Spec coverage:** detection (Task 2), status table + none-installed warning (Task 3), multi-select with not-installed labeling (Task 3), per-tool config check + warn (Task 3), `ensureMigrated` dir creation (Task 3), completion summary (Task 3), auto-trigger gate (Task 4), `init` command (Task 5), non-TTY safety (Tasks 3–5), version 0.7.0 (Task 6). All spec sections mapped.
- **Type consistency:** `InitIO` (Task 3) used by `runInitWizard`; `detectFn: () => Record<TargetId, boolean>` and `checkboxFn?: typeof checkbox` consistent across tests and impl; `maybeRunInitWizard(target: TargetConfig)` (Task 4) matches the call site `initCmd.maybeRunInitWizard(target)` (Task 5); `binaryName` (Task 1) consumed by `detector.ts` (Task 2).
- **No placeholders:** every code step contains complete code; exit codes verified against `exit.ts` (`UserCancelledError` → 0).
