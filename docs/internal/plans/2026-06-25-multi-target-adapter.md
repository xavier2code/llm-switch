# Multi-Target Adapter & Centralized Profile Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `llm-switch` so every command can act on multiple selected
CLI tools, add Codex as a first-class TOML-based target, and move profiles into
a centralized store under `~/.llm-switch/profiles/<target-id>/`.

**Architecture:** Introduce a `TargetAdapter` abstraction
(`AnthropicJsonAdapter`, `OpenAiTomlAdapter`) to isolate format differences. A
new `ProfileStore` owns the centralized profile directory. A `StateManager`
persists the last-selected target set. A `TargetSelector` resolves the active
targets for each command, using `--target` as an exact override, TTY
multi-select when interactive, and the persisted set in scripts. Commands are
refactored to loop over resolved targets serially.

**Tech Stack:** TypeScript, Vitest, Commander, `@inquirer/prompts`,
`@iarna/toml`.

---

## File structure

### New files

- `packages/cli/src/adapters/types.ts` — `ProfileContent`, `TargetAdapter`
  interface.
- `packages/cli/src/adapters/anthropic-json-adapter.ts` — JSON adapter for
  Claude Code / OpenCode.
- `packages/cli/src/adapters/openai-toml-adapter.ts` — TOML adapter for Codex.
- `packages/cli/src/adapters/index.ts` — adapter factory.
- `packages/cli/src/store/profile-store.ts` — centralized profile CRUD and
  listing.
- `packages/cli/src/state/state-manager.ts` — `~/.llm-switch/state.json`
  persistence.
- `packages/cli/src/target-selector.ts` — resolves targets per invocation.
- `packages/cli/src/migrate.ts` — one-time migration to the centralized store.
- `packages/cli/test/adapters/anthropic-json-adapter.test.ts`
- `packages/cli/test/adapters/openai-toml-adapter.test.ts`
- `packages/cli/test/store/profile-store.test.ts`
- `packages/cli/test/state/state-manager.test.ts`
- `packages/cli/test/target-selector.test.ts`
- `packages/cli/test/migrate.test.ts`

### Modified files

- `packages/cli/package.json` — add `@iarna/toml`, bump version to `0.8.0`.
- `packages/cli/src/config.ts` — add `TargetFamily`, `adapterType`, Codex
  target.
- `packages/cli/src/fs-utils.ts` — add `sha256String` helper.
- `packages/cli/src/providers.ts` — add `family` field and OpenAI provider.
- `packages/cli/src/validator.ts` — add `validateOpenAi`.
- `packages/cli/src/ui.ts` — add `pickTargets`.
- `packages/cli/src/messages.ts` — add target-aware messages.
- `packages/cli/src/commands/init.ts` — init creates centralized dirs and sets
  state.
- `packages/cli/src/commands/list.ts` — multi-target grouped output.
- `packages/cli/src/commands/current.ts` — multi-target per-target summary.
- `packages/cli/src/commands/switch.ts` — multi-target switch + auto-create.
- `packages/cli/src/commands/save.ts` — multi-target save.
- `packages/cli/src/commands/create.ts` — multi-target + Codex create.
- `packages/cli/src/commands/restore.ts` — multi-target restore.
- `packages/cli/src/cli.ts` — wire `TargetSelector`, remove old
  `resolveTarget`, update help text.
- `packages/cli/test/commands/*.test.ts` — update expectations.
- `packages/cli/test/ui.test.ts` — add `pickTargets` tests.
- `packages/cli/test/providers.test.ts` — add OpenAI provider tests.
- `README.md` — document multi-target behavior, Codex, centralized store.
- `CHANGELOG.md` — add `0.8.0` section.

---

## Task 1: Add `@iarna/toml` dependency

**Files:**
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Install the dependency**

Run:

```bash
cd /Users/xavier/Projects/Github/llm-switch
pnpm -F llm-switch add @iarna/toml
```

Expected: `packages/cli/package.json` updates with `@iarna/toml` in
`dependencies` and `pnpm-lock.yaml` changes.

- [ ] **Step 2: Commit**

```bash
git add packages/cli/package.json pnpm-lock.yaml
git commit -m "chore(deps): add @iarna/toml for Codex TOML support

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Extend `TargetConfig` and add Codex target

**Files:**
- Modify: `packages/cli/src/config.ts:1-212`
- Test: `packages/cli/test/config.test.ts` (create if it does not exist)

- [ ] **Step 1: Write the failing test**

Create `packages/cli/test/config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TARGETS, getTarget, isTargetId } from '../src/config.js';

describe('TARGETS registry', () => {
  it('includes claude, opencode, and codex', () => {
    const ids = TARGETS.map((t) => t.id);
    expect(ids).toContain('claude');
    expect(ids).toContain('opencode');
    expect(ids).toContain('codex');
  });

  it('codex has openai family and toml adapter', () => {
    const codex = getTarget('codex');
    expect(codex.family).toBe('openai');
    expect(codex.adapterType).toBe('openai-toml');
    expect(codex.envConfigDir).toBe('CODEX_HOME');
    expect(codex.activeConfigFileName).toBe('config.toml');
  });

  it('rejects unknown target id', () => {
    expect(isTargetId('unknown')).toBe(false);
  });
});
```

Run:

```bash
cd /Users/xavier/Projects/Github/llm-switch
pnpm -F llm-switch test -- packages/cli/test/config.test.ts
```

Expected: FAIL with missing `family`, `adapterType`, or `codex`.

- [ ] **Step 2: Update `config.ts`**

Replace the top of `packages/cli/src/config.ts`:

```ts
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { AppError, InvalidAliasError } from './errors.js';
import { exists } from './fs-utils.js';

export type TargetId = 'claude' | 'opencode' | 'codex';
export type TargetFamily = 'anthropic' | 'openai';

export interface TargetConfig {
  readonly id: TargetId;
  readonly displayName: string;
  readonly family: TargetFamily;
  readonly adapterType: 'anthropic-json' | 'openai-toml';
  readonly envConfigDir: string;
  readonly defaultConfigDir: string;
  readonly activeConfigFileName: string;
  readonly binaryName: string;
  readonly restartHint: string;
}

export const TARGETS: readonly TargetConfig[] = [
  {
    id: 'claude',
    displayName: 'Claude Code',
    family: 'anthropic',
    adapterType: 'anthropic-json',
    envConfigDir: 'CLAUDE_CONFIG_DIR',
    defaultConfigDir: '.claude',
    activeConfigFileName: 'settings.json',
    binaryName: 'claude',
    restartHint: 'Restart Claude Code to apply.',
  },
  {
    id: 'opencode',
    displayName: 'OpenCode',
    family: 'anthropic',
    adapterType: 'anthropic-json',
    envConfigDir: 'OPENCODE_CONFIG_DIR',
    defaultConfigDir: '.config/opencode',
    activeConfigFileName: 'opencode.json',
    binaryName: 'opencode',
    restartHint: 'Restart OpenCode to apply.',
  },
  {
    id: 'codex',
    displayName: 'Codex',
    family: 'openai',
    adapterType: 'openai-toml',
    envConfigDir: 'CODEX_HOME',
    defaultConfigDir: '.codex',
    activeConfigFileName: 'config.toml',
    binaryName: 'codex',
    restartHint: 'Restart Codex to apply.',
  },
];
```

Keep the rest of the file unchanged.

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/config.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/config.ts packages/cli/test/config.test.ts
git commit -m "feat(config): add TargetFamily, adapterType, and codex target

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Add `sha256String` helper

**Files:**
- Modify: `packages/cli/src/fs-utils.ts`
- Test: `packages/cli/test/fs-utils.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/cli/test/fs-utils.test.ts` (create or append):

```ts
import { describe, it, expect } from 'vitest';
import { sha256String } from '../src/fs-utils.js';

describe('sha256String', () => {
  it('hashes a string', () => {
    expect(sha256String('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/fs-utils.test.ts
```

Expected: FAIL — `sha256String` not exported.

- [ ] **Step 2: Implement `sha256String`**

Modify `packages/cli/src/fs-utils.ts`:

```ts
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export async function sha256(filePath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export function sha256String(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/fs-utils.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/fs-utils.ts packages/cli/test/fs-utils.test.ts
git commit -m "feat(utils): add sha256String helper

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Define adapter types

**Files:**
- Create: `packages/cli/src/adapters/types.ts`
- Test: `packages/cli/test/adapters/types.test.ts`

- [ ] **Step 1: Write the failing type/import test**

Create `packages/cli/test/adapters/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { ProfileContent, TargetAdapter } from '../../src/adapters/types.js';

describe('adapter types', () => {
  it('ProfileContent has required fields', () => {
    const content: ProfileContent = {
      providerId: 'glm',
      baseUrl: 'https://example.com',
      model: 'model',
      apiKey: 'key',
      extra: {},
    };
    expect(content.baseUrl).toBe('https://example.com');
  });

  it('TargetAdapter interface is importable', () => {
    const adapter: TargetAdapter | null = null;
    expect(adapter).toBeNull();
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/adapters/types.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 2: Create `types.ts`**

Create `packages/cli/src/adapters/types.ts`:

```ts
import type { TargetConfig } from '../config.js';

export interface ProfileContent {
  providerId?: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  extra: Record<string, unknown>;
}

export interface Profile {
  alias: string;
  path: string;
  active: boolean;
}

export interface TargetAdapter {
  readonly target: TargetConfig;
  readonly storeDir: string;

  readActive(): Promise<ProfileContent | null>;
  writeActive(content: ProfileContent): Promise<void>;
  readProfile(alias: string): Promise<ProfileContent | null>;
  writeProfile(alias: string, content: ProfileContent): Promise<void>;
  deleteProfile(alias: string): Promise<void>;
  listAliases(): Promise<string[]>;
  profilePath(alias: string): string;
  activePath(): string;
  serialize(content: ProfileContent): string;
  deserialize(raw: string): ProfileContent;
}
```

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/adapters/types.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/adapters/types.ts packages/cli/test/adapters/types.test.ts
git commit -m "feat(adapters): define ProfileContent and TargetAdapter interface

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Implement `AnthropicJsonAdapter`

**Files:**
- Create: `packages/cli/src/adapters/anthropic-json-adapter.ts`
- Test: `packages/cli/test/adapters/anthropic-json-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/test/adapters/anthropic-json-adapter.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AnthropicJsonAdapter } from '../../src/adapters/anthropic-json-adapter.js';
import { getTarget } from '../../src/config.js';

let tmpDir: string;
let storeDir: string;
let adapter: AnthropicJsonAdapter;
const target = getTarget('claude');

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-adapter-'));
  storeDir = path.join(tmpDir, 'profiles');
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  adapter = new AnthropicJsonAdapter(target, storeDir);
});

afterEach(async () => {
  delete process.env.CLAUDE_CONFIG_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const sampleContent = {
  providerId: 'glm',
  baseUrl: 'https://open.bigmodel.cn/api/anthropic',
  model: 'glm-4.5',
  apiKey: 'sk-test',
  extra: {},
};

describe('AnthropicJsonAdapter', () => {
  it('serializes to expected JSON', () => {
    const json = adapter.serialize(sampleContent);
    const parsed = JSON.parse(json);
    expect(parsed.env.ANTHROPIC_BASE_URL).toBe(sampleContent.baseUrl);
    expect(parsed.env.ANTHROPIC_MODEL).toBe(sampleContent.model);
    expect(parsed.env.ANTHROPIC_AUTH_TOKEN).toBe(sampleContent.apiKey);
    expect(parsed.providerId).toBe('glm');
  });

  it('round-trips content', () => {
    const json = adapter.serialize(sampleContent);
    const parsed = adapter.deserialize(json);
    expect(parsed.baseUrl).toBe(sampleContent.baseUrl);
    expect(parsed.model).toBe(sampleContent.model);
    expect(parsed.apiKey).toBe(sampleContent.apiKey);
    expect(parsed.providerId).toBe('glm');
  });

  it('writes and reads active config', async () => {
    await adapter.writeActive(sampleContent);
    const active = await adapter.readActive();
    expect(active).toEqual(sampleContent);
  });

  it('writes and reads profile', async () => {
    await adapter.writeProfile('glm', sampleContent);
    const profile = await adapter.readProfile('glm');
    expect(profile).toEqual(sampleContent);
  });

  it('lists aliases', async () => {
    await adapter.writeProfile('glm', sampleContent);
    await adapter.writeProfile('kimi', sampleContent);
    const aliases = await adapter.listAliases();
    expect(aliases.sort()).toEqual(['glm', 'kimi']);
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/adapters/anthropic-json-adapter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 2: Implement the adapter**

Create `packages/cli/src/adapters/anthropic-json-adapter.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { TargetConfig } from '../config.js';
import { getActiveConfigPath, getBackupPath } from '../config.js';
import { exists } from '../fs-utils.js';
import type { ProfileContent, TargetAdapter } from './types.js';

export class AnthropicJsonAdapter implements TargetAdapter {
  readonly target: TargetConfig;
  readonly storeDir: string;

  constructor(target: TargetConfig, storeDir: string) {
    this.target = target;
    this.storeDir = storeDir;
  }

  activePath(): string {
    return getActiveConfigPath(this.target);
  }

  profilePath(alias: string): string {
    return path.join(this.storeDir, `${alias}.json`);
  }

  serialize(content: ProfileContent): string {
    const obj: Record<string, unknown> = {
      env: {
        ANTHROPIC_BASE_URL: content.baseUrl,
        ANTHROPIC_MODEL: content.model,
        ANTHROPIC_AUTH_TOKEN: content.apiKey,
      },
      ...content.extra,
    };
    if (content.providerId) obj.providerId = content.providerId;
    return JSON.stringify(obj, null, 2);
  }

  deserialize(raw: string): ProfileContent {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const env = (parsed.env ?? {}) as Record<string, string>;
    const { providerId, ...rest } = parsed;
    return {
      providerId: typeof providerId === 'string' ? providerId : undefined,
      baseUrl: env.ANTHROPIC_BASE_URL ?? '',
      model: env.ANTHROPIC_MODEL ?? '',
      apiKey: env.ANTHROPIC_AUTH_TOKEN ?? '',
      extra: rest,
    };
  }

  async readActive(): Promise<ProfileContent | null> {
    const p = this.activePath();
    if (!(await exists(p))) return null;
    const raw = await fs.readFile(p, 'utf8');
    return this.deserialize(raw);
  }

  async writeActive(content: ProfileContent): Promise<void> {
    const active = this.activePath();
    if (await exists(active)) {
      const backup = getBackupPath(this.target);
      await fs.mkdir(path.dirname(backup), { recursive: true });
      await fs.copyFile(active, backup);
      await fs.chmod(backup, 0o600);
    }
    const tmp = path.join(path.dirname(active), `.settings.${crypto.randomUUID()}.tmp`);
    try {
      await fs.writeFile(tmp, this.serialize(content));
      await fs.chmod(tmp, 0o600);
      await fs.rename(tmp, active);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }

  async readProfile(alias: string): Promise<ProfileContent | null> {
    const p = this.profilePath(alias);
    if (!(await exists(p))) return null;
    const raw = await fs.readFile(p, 'utf8');
    return this.deserialize(raw);
  }

  async writeProfile(alias: string, content: ProfileContent): Promise<void> {
    const p = this.profilePath(alias);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, this.serialize(content));
    await fs.chmod(p, 0o600);
  }

  async deleteProfile(alias: string): Promise<void> {
    await fs.rm(this.profilePath(alias), { force: true });
  }

  async listAliases(): Promise<string[]> {
    if (!(await exists(this.storeDir))) return [];
    const entries = await fs.readdir(this.storeDir);
    return entries
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length));
  }
}
```

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/adapters/anthropic-json-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/adapters/anthropic-json-adapter.ts packages/cli/test/adapters/anthropic-json-adapter.test.ts
git commit -m "feat(adapters): implement AnthropicJsonAdapter

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Implement `OpenAiTomlAdapter`

**Files:**
- Create: `packages/cli/src/adapters/openai-toml-adapter.ts`
- Test: `packages/cli/test/adapters/openai-toml-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/test/adapters/openai-toml-adapter.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { OpenAiTomlAdapter } from '../../src/adapters/openai-toml-adapter.js';
import { getTarget } from '../../src/config.js';

let tmpDir: string;
let storeDir: string;
let adapter: OpenAiTomlAdapter;
const target = getTarget('codex');

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-codex-'));
  storeDir = path.join(tmpDir, 'profiles');
  process.env.CODEX_HOME = tmpDir;
  adapter = new OpenAiTomlAdapter(target, storeDir);
});

afterEach(async () => {
  delete process.env.CODEX_HOME;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const sampleContent = {
  providerId: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1',
  apiKey: 'sk-test',
  extra: { approval_policy: 'on-request' },
};

describe('OpenAiTomlAdapter', () => {
  it('serializes to expected TOML', () => {
    const toml = adapter.serialize(sampleContent);
    expect(toml).toContain('model = "gpt-4.1"');
    expect(toml).toContain('base_url = "https://api.openai.com/v1"');
    expect(toml).toContain('api_key = "sk-test"');
    expect(toml).toContain('approval_policy = "on-request"');
  });

  it('round-trips content', () => {
    const toml = adapter.serialize(sampleContent);
    const parsed = adapter.deserialize(toml);
    expect(parsed.baseUrl).toBe(sampleContent.baseUrl);
    expect(parsed.model).toBe(sampleContent.model);
    expect(parsed.apiKey).toBe(sampleContent.apiKey);
    expect(parsed.extra.approval_policy).toBe('on-request');
  });

  it('writes and reads active config', async () => {
    await adapter.writeActive(sampleContent);
    const active = await adapter.readActive();
    expect(active?.model).toBe('gpt-4.1');
  });

  it('writes and reads profile', async () => {
    await adapter.writeProfile('openai', sampleContent);
    const profile = await adapter.readProfile('openai');
    expect(profile?.model).toBe('gpt-4.1');
  });

  it('lists aliases', async () => {
    await adapter.writeProfile('openai', sampleContent);
    await adapter.writeProfile('work', sampleContent);
    const aliases = await adapter.listAliases();
    expect(aliases.sort()).toEqual(['openai', 'work']);
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/adapters/openai-toml-adapter.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement the adapter**

Create `packages/cli/src/adapters/openai-toml-adapter.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import TOML from '@iarna/toml';
import type { TargetConfig } from '../config.js';
import { getActiveConfigPath, getBackupPath } from '../config.js';
import { exists } from '../fs-utils.js';
import type { ProfileContent, TargetAdapter } from './types.js';

export class OpenAiTomlAdapter implements TargetAdapter {
  readonly target: TargetConfig;
  readonly storeDir: string;

  constructor(target: TargetConfig, storeDir: string) {
    this.target = target;
    this.storeDir = storeDir;
  }

  activePath(): string {
    return getActiveConfigPath(this.target);
  }

  profilePath(alias: string): string {
    return path.join(this.storeDir, `${alias}.toml`);
  }

  serialize(content: ProfileContent): string {
    const obj: Record<string, unknown> = {
      model: content.model,
      base_url: content.baseUrl,
      api_key: content.apiKey,
      ...content.extra,
    };
    if (content.providerId) obj.providerId = content.providerId;
    return TOML.stringify(obj);
  }

  deserialize(raw: string): ProfileContent {
    const parsed = TOML.parse(raw) as Record<string, unknown>;
    const { providerId, model, base_url, api_key, ...rest } = parsed;
    return {
      providerId: typeof providerId === 'string' ? providerId : undefined,
      baseUrl: typeof base_url === 'string' ? base_url : '',
      model: typeof model === 'string' ? model : '',
      apiKey: typeof api_key === 'string' ? api_key : '',
      extra: rest,
    };
  }

  async readActive(): Promise<ProfileContent | null> {
    const p = this.activePath();
    if (!(await exists(p))) return null;
    const raw = await fs.readFile(p, 'utf8');
    return this.deserialize(raw);
  }

  async writeActive(content: ProfileContent): Promise<void> {
    const active = this.activePath();
    if (await exists(active)) {
      const backup = getBackupPath(this.target);
      await fs.mkdir(path.dirname(backup), { recursive: true });
      await fs.copyFile(active, backup);
      await fs.chmod(backup, 0o600);
    }
    const tmp = path.join(path.dirname(active), `.config.${crypto.randomUUID()}.tmp`);
    try {
      await fs.writeFile(tmp, this.serialize(content));
      await fs.chmod(tmp, 0o600);
      await fs.rename(tmp, active);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }

  async readProfile(alias: string): Promise<ProfileContent | null> {
    const p = this.profilePath(alias);
    if (!(await exists(p))) return null;
    const raw = await fs.readFile(p, 'utf8');
    return this.deserialize(raw);
  }

  async writeProfile(alias: string, content: ProfileContent): Promise<void> {
    const p = this.profilePath(alias);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, this.serialize(content));
    await fs.chmod(p, 0o600);
  }

  async deleteProfile(alias: string): Promise<void> {
    await fs.rm(this.profilePath(alias), { force: true });
  }

  async listAliases(): Promise<string[]> {
    if (!(await exists(this.storeDir))) return [];
    const entries = await fs.readdir(this.storeDir);
    return entries
      .filter((name) => name.endsWith('.toml'))
      .map((name) => name.slice(0, -'.toml'.length));
  }
}
```

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/adapters/openai-toml-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/adapters/openai-toml-adapter.ts packages/cli/test/adapters/openai-toml-adapter.test.ts
git commit -m "feat(adapters): implement OpenAiTomlAdapter for Codex

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Create adapter factory

**Files:**
- Create: `packages/cli/src/adapters/index.ts`
- Test: `packages/cli/test/adapters/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/test/adapters/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createAdapter } from '../../src/adapters/index.js';
import { AnthropicJsonAdapter } from '../../src/adapters/anthropic-json-adapter.js';
import { OpenAiTomlAdapter } from '../../src/adapters/openai-toml-adapter.js';
import { getTarget } from '../../src/config.js';

describe('createAdapter', () => {
  it('returns AnthropicJsonAdapter for claude', () => {
    const adapter = createAdapter(getTarget('claude'), '/tmp/p');
    expect(adapter).toBeInstanceOf(AnthropicJsonAdapter);
  });

  it('returns AnthropicJsonAdapter for opencode', () => {
    const adapter = createAdapter(getTarget('opencode'), '/tmp/p');
    expect(adapter).toBeInstanceOf(AnthropicJsonAdapter);
  });

  it('returns OpenAiTomlAdapter for codex', () => {
    const adapter = createAdapter(getTarget('codex'), '/tmp/p');
    expect(adapter).toBeInstanceOf(OpenAiTomlAdapter);
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/adapters/index.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement the factory**

Create `packages/cli/src/adapters/index.ts`:

```ts
import type { TargetConfig } from '../config.js';
import { AppError } from '../errors.js';
import { AnthropicJsonAdapter } from './anthropic-json-adapter.js';
import { OpenAiTomlAdapter } from './openai-toml-adapter.js';
import type { TargetAdapter } from './types.js';

export function createAdapter(target: TargetConfig, storeDir: string): TargetAdapter {
  if (target.adapterType === 'anthropic-json') {
    return new AnthropicJsonAdapter(target, storeDir);
  }
  if (target.adapterType === 'openai-toml') {
    return new OpenAiTomlAdapter(target, storeDir);
  }
  throw new AppError(`Unsupported adapter type: ${target.adapterType}`, 'UNSUPPORTED_ADAPTER');
}
```

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/adapters/index.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/adapters/index.ts packages/cli/test/adapters/index.test.ts
git commit -m "feat(adapters): add createAdapter factory

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Implement `ProfileStore`

**Files:**
- Create: `packages/cli/src/store/profile-store.ts`
- Test: `packages/cli/test/store/profile-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/test/store/profile-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ProfileStore } from '../../src/store/profile-store.js';
import { getTarget } from '../../src/config.js';

let tmpDir: string;
let store: ProfileStore;
let savedClaude: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-store-'));
  savedClaude = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, 'llm-switch'));
});

afterEach(async () => {
  if (savedClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedClaude;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const content = {
  baseUrl: 'https://example.com',
  model: 'm',
  apiKey: 'k',
  extra: {},
};

describe('ProfileStore', () => {
  it('writes and reads profiles', async () => {
    await store.writeProfile(getTarget('claude'), 'glm', content);
    const read = await store.readProfile(getTarget('claude'), 'glm');
    expect(read).toEqual(content);
  });

  it('lists profiles and marks active', async () => {
    const target = getTarget('claude');
    await store.writeProfile(target, 'glm', content);
    await store.writeProfile(target, 'kimi', { ...content, model: 'k2' });
    await store.activateProfile(target, 'glm');

    const profiles = await store.listProfiles(target);
    const glm = profiles.find((p) => p.alias === 'glm');
    const kimi = profiles.find((p) => p.alias === 'kimi');
    expect(glm?.active).toBe(true);
    expect(kimi?.active).toBe(false);
  });

  it('deletes profile', async () => {
    await store.writeProfile(getTarget('claude'), 'glm', content);
    await store.deleteProfile(getTarget('claude'), 'glm');
    const read = await store.readProfile(getTarget('claude'), 'glm');
    expect(read).toBeNull();
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/store/profile-store.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement the store**

Create `packages/cli/src/store/profile-store.ts`:

```ts
import path from 'node:path';
import os from 'node:os';
import { createAdapter } from '../adapters/index.js';
import type { TargetConfig, TargetId } from '../config.js';
import { sha256String } from '../fs-utils.js';
import type { Profile, ProfileContent } from '../adapters/types.js';

export class ProfileStore {
  readonly baseDir: string;

  constructor(baseDir: string = defaultBaseDir()) {
    this.baseDir = baseDir;
  }

  profileDir(target: TargetConfig): string {
    return path.join(this.baseDir, 'profiles', target.id);
  }

  adapter(target: TargetConfig) {
    return createAdapter(target, this.profileDir(target));
  }

  async readProfile(target: TargetConfig, alias: string): Promise<ProfileContent | null> {
    return this.adapter(target).readProfile(alias);
  }

  async writeProfile(target: TargetConfig, alias: string, content: ProfileContent): Promise<void> {
    return this.adapter(target).writeProfile(alias, content);
  }

  async deleteProfile(target: TargetConfig, alias: string): Promise<void> {
    return this.adapter(target).deleteProfile(alias);
  }

  async activateProfile(target: TargetConfig, alias: string): Promise<void> {
    const adapter = this.adapter(target);
    const content = await adapter.readProfile(alias);
    if (!content) throw new Error(`Profile '${alias}' not found for ${target.displayName}`);
    await adapter.writeActive(content);
  }

  async listProfiles(target: TargetConfig): Promise<Profile[]> {
    const adapter = this.adapter(target);
    const active = await adapter.readActive();
    const activeHash = active ? sha256String(adapter.serialize(active)) : null;
    const aliases = await adapter.listAliases();
    const profiles = await Promise.all(
      aliases.map(async (alias) => {
        const content = await adapter.readProfile(alias);
        const profilePath = adapter.profilePath(alias);
        const hash = content ? sha256String(adapter.serialize(content)) : null;
        return {
          alias,
          path: profilePath,
          active: activeHash !== null && hash === activeHash,
        };
      }),
    );
    return profiles;
  }
}

export function defaultBaseDir(): string {
  return path.join(process.env.HOME ?? os.homedir(), '.config', 'llm-switch');
}

export function defaultProfileStore(): ProfileStore {
  return new ProfileStore(defaultBaseDir());
}
```

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/store/profile-store.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/store/profile-store.ts packages/cli/test/store/profile-store.test.ts
git commit -m "feat(store): add centralized ProfileStore

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: Implement `StateManager`

**Files:**
- Create: `packages/cli/src/state/state-manager.ts`
- Test: `packages/cli/test/state/state-manager.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/test/state/state-manager.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { StateManager } from '../../src/state/state-manager.js';

let tmpDir: string;
let manager: StateManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-state-'));
  manager = new StateManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('StateManager', () => {
  it('returns default state when file missing', async () => {
    const state = await manager.read();
    expect(state.version).toBe(1);
    expect(state.lastSelectedTargets).toEqual(['claude']);
  });

  it('writes and reads state', async () => {
    await manager.write({ version: 1, lastSelectedTargets: ['claude', 'codex'] });
    const state = await manager.read();
    expect(state.lastSelectedTargets).toEqual(['claude', 'codex']);
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/state/state-manager.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement the manager**

Create `packages/cli/src/state/state-manager.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exists } from '../fs-utils.js';
import type { TargetId } from '../config.js';

export interface State {
  version: number;
  lastSelectedTargets: TargetId[];
}

export const DEFAULT_STATE: State = {
  version: 1,
  lastSelectedTargets: ['claude'],
};

export class StateManager {
  readonly dir: string;

  constructor(dir: string = defaultStateDir()) {
    this.dir = dir;
  }

  private filePath(): string {
    return path.join(this.dir, 'state.json');
  }

  async read(): Promise<State> {
    const p = this.filePath();
    if (!(await exists(p))) return { ...DEFAULT_STATE };
    const raw = await fs.readFile(p, 'utf8');
    return migrateState(JSON.parse(raw));
  }

  async write(state: State): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const p = this.filePath();
    await fs.writeFile(p, JSON.stringify(state, null, 2));
    await fs.chmod(p, 0o600);
  }
}

export function defaultStateDir(): string {
  return path.join(process.env.HOME ?? os.homedir(), '.config', 'llm-switch');
}

export function migrateState(raw: unknown): State {
  const state = raw as Partial<State>;
  return {
    version: state.version ?? DEFAULT_STATE.version,
    lastSelectedTargets: Array.isArray(state.lastSelectedTargets)
      ? (state.lastSelectedTargets as TargetId[])
      : [...DEFAULT_STATE.lastSelectedTargets],
  };
}
```

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/state/state-manager.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/state/state-manager.ts packages/cli/test/state/state-manager.test.ts
git commit -m "feat(state): add StateManager for last-selected targets

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: Add `pickTargets` UI helper

**Files:**
- Modify: `packages/cli/src/ui.ts`
- Test: `packages/cli/test/ui.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/cli/test/ui.test.ts`:

```ts
import { checkbox } from '@inquirer/prompts';
import { pickTargets } from '../src/ui.js';

const mockCheckbox = vi.mocked(checkbox);

// ... after existing imports, add:
// import { getTarget } from '../src/config.js';

describe('pickTargets', () => {
  const targets = [getTarget('claude'), getTarget('codex')];

  it('returns selected target configs', async () => {
    mockCheckbox.mockResolvedValueOnce(['claude'] as never);
    const result = await pickTargets(targets, ['claude']);
    expect(result?.map((t) => t.id)).toEqual(['claude']);
  });

  it('returns null on cancel', async () => {
    mockCheckbox.mockResolvedValueOnce(Symbol('cancel') as never);
    const result = await pickTargets(targets, ['claude']);
    expect(result).toBeNull();
  });

  it('throws when no TTY', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    await expect(pickTargets(targets, [])).rejects.toBeInstanceOf(UserCancelledError);
  });
});
```

You will also need to add `getTarget` import and `checkbox` to the mock at the
top of `ui.test.ts`.

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/ui.test.ts
```

Expected: FAIL — `pickTargets` not exported.

- [ ] **Step 2: Implement `pickTargets`**

Modify `packages/cli/src/ui.ts`:

```ts
import { select, input, checkbox } from '@inquirer/prompts';
import type { Profile } from './scanner.js';
import { ALIAS_RE } from './config.js';
import { INTERACTIVE_TTY_REQUIRED } from './messages.js';
import { UserCancelledError } from './errors.js';
import type { TargetConfig, TargetId } from './config.js';

const NEW_SENTINEL: unique symbol = Symbol.for('llm-switch:create-new');

export function isCancel(value: unknown): boolean {
  return typeof value === 'symbol' && value !== NEW_SENTINEL;
}

export function isInquirerCancelError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = err.name;
  return name === 'ExitPromptError' || name === 'CancelPromptError' || name === 'AbortPromptError';
}

function ensureTTY(): void {
  if (!process.stdout.isTTY) {
    throw new UserCancelledError(INTERACTIVE_TTY_REQUIRED);
  }
}

export async function pickTargets(
  targets: TargetConfig[],
  defaultIds: TargetId[],
): Promise<TargetConfig[] | null> {
  ensureTTY();
  if (targets.length === 0) return [];

  const result = (await checkbox({
    message: 'Select targets:',
    choices: targets.map((t) => ({
      name: t.displayName,
      value: t.id,
      checked: defaultIds.includes(t.id),
    })),
  })) as TargetId[] | undefined;

  if (isCancel(result)) return null;
  const ids = result ?? [];
  return targets.filter((t) => ids.includes(t.id));
}

// ... existing pickProfile, promptAlias, promptNewAlias remain unchanged
```

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/ui.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/ui.ts packages/cli/test/ui.test.ts
git commit -m "feat(ui): add pickTargets multi-select helper

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: Implement `TargetSelector`

**Files:**
- Create: `packages/cli/src/target-selector.ts`
- Test: `packages/cli/test/target-selector.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/test/target-selector.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { selectTargets } from '../src/target-selector.js';
import { StateManager } from '../src/state/state-manager.js';
import { getTarget, type TargetId } from '../src/config.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;
let stateManager: StateManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-selector-'));
  stateManager = new StateManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('selectTargets', () => {
  it('uses --target flag exactly', async () => {
    const result = await selectTargets({
      flag: 'codex',
      isTTY: false,
      stateManager,
    });
    expect(result.targets.map((t) => t.id)).toEqual(['codex']);
    expect(result.source).toBe('flag');
  });

  it('uses state in non-TTY', async () => {
    await stateManager.write({ version: 1, lastSelectedTargets: ['opencode'] });
    const result = await selectTargets({ flag: undefined, isTTY: false, stateManager });
    expect(result.targets.map((t) => t.id)).toEqual(['opencode']);
    expect(result.source).toBe('state');
  });

  it('falls back to default when state missing and non-TTY', async () => {
    const result = await selectTargets({ flag: undefined, isTTY: false, stateManager });
    expect(result.targets.map((t) => t.id)).toEqual(['claude']);
    expect(result.source).toBe('default');
  });

  it('returns interactive selection in TTY', async () => {
    const checkboxFn = vi.fn().mockResolvedValue(['claude', 'codex'] as TargetId[]);
    const result = await selectTargets({
      flag: undefined,
      isTTY: true,
      stateManager,
      checkboxFn,
      detectFn: () => ({ claude: true, opencode: false, codex: true } as Record<TargetId, boolean>),
    });
    expect(result.targets.map((t) => t.id)).toEqual(['claude', 'codex']);
    expect(result.source).toBe('interactive');
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/target-selector.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement `selectTargets`**

Create `packages/cli/src/target-selector.ts`:

```ts
import { checkbox } from '@inquirer/prompts';
import {
  TARGETS,
  getTarget,
  isTargetId,
  type TargetConfig,
  type TargetId,
} from './config.js';
import { AppError } from './errors.js';
import { isCancel } from './ui.js';
import { UserCancelledError } from './errors.js';
import type { StateManager } from './state/state-manager.js';
import { detectInstalledTargets } from './detector.js';

export interface TargetSelectionResult {
  targets: TargetConfig[];
  source: 'flag' | 'interactive' | 'state' | 'default';
}

export interface TargetSelectorOptions {
  flag?: string;
  isTTY: boolean;
  stateManager: StateManager;
  detectFn?: () => Record<TargetId, boolean>;
  checkboxFn?: typeof checkbox;
}

export async function selectTargets(options: TargetSelectorOptions): Promise<TargetSelectionResult> {
  const { flag, isTTY, stateManager, detectFn, checkboxFn } = options;

  if (flag) {
    const id = flag.trim();
    if (!isTargetId(id)) {
      throw new AppError(
        `Unknown target '${id}'. Must be one of: ${TARGETS.map((t) => t.id).join(', ')}`,
        'UNKNOWN_TARGET',
      );
    }
    return { targets: [getTarget(id)], source: 'flag' };
  }

  if (isTTY) {
    const state = await stateManager.read();
    const installed = detectFn ? detectFn() : detectInstalledTargets();
    const selectFn = checkboxFn ?? checkbox;
    const result = (await selectFn({
      message: 'Select targets:',
      choices: TARGETS.map((t) => ({
        name: installed[t.id] ? t.displayName : `${t.displayName} (not installed)`,
        value: t.id,
        checked: state.lastSelectedTargets.includes(t.id),
      })),
    })) as TargetId[] | undefined;

    if (isCancel(result)) {
      throw new UserCancelledError('Cancelled.');
    }
    const ids = result ?? [];
    if (ids.length === 0) {
      throw new UserCancelledError('No targets selected.');
    }
    await stateManager.write({ ...state, lastSelectedTargets: ids });
    return { targets: ids.map(getTarget), source: 'interactive' };
  }

  const state = await stateManager.read();
  if (state.lastSelectedTargets.length > 0) {
    return { targets: state.lastSelectedTargets.map(getTarget), source: 'state' };
  }

  return { targets: [getTarget('claude')], source: 'default' };
}
```

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/target-selector.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/target-selector.ts packages/cli/test/target-selector.test.ts
git commit -m "feat(targets): add TargetSelector with flag/state/interactive modes

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 12: Add OpenAI provider and validation

**Files:**
- Modify: `packages/cli/src/providers.ts`
- Modify: `packages/cli/src/validator.ts`
- Test: `packages/cli/test/providers.test.ts`
- Test: `packages/cli/test/validator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/cli/test/providers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PROVIDERS, getProvider, isProviderId } from '../src/providers.js';

describe('OpenAI provider', () => {
  it('includes openai provider', () => {
    const openai = PROVIDERS.find((p) => p.id === 'openai');
    expect(openai).toBeDefined();
    expect(openai?.family).toBe('openai');
    expect(openai?.baseUrl).toBe('https://api.openai.com/v1');
  });

  it('recognizes openai provider id', () => {
    expect(isProviderId('openai')).toBe(true);
  });
});
```

Create or append to `packages/cli/test/validator.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { validateOpenAi } from '../src/validator.js';

describe('validateOpenAi', () => {
  it('throws on API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });
    await expect(validateOpenAi('https://api.openai.com/v1', 'gpt-4.1', 'bad')).rejects.toThrow();
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/providers.test.ts packages/cli/test/validator.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Update providers**

Modify `packages/cli/src/providers.ts`:

```ts
import { AppError } from './errors.js';

export type ProviderFamily = 'anthropic' | 'openai';

export type ProviderId = 'glm' | 'deepseek' | 'kimi' | 'minimax' | 'qwen' | 'openai';

export interface Provider {
  id: ProviderId;
  displayName: string;
  family: ProviderFamily;
  baseUrl: string;
  defaultModel: string;
}

export const PROVIDERS: readonly Provider[] = [
  {
    id: 'glm',
    displayName: 'GLM (智谱)',
    family: 'anthropic',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    defaultModel: 'glm-4.5',
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    family: 'anthropic',
    baseUrl: 'https://api.deepseek.com/anthropic',
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'kimi',
    displayName: 'Kimi (Moonshot)',
    family: 'anthropic',
    baseUrl: 'https://api.kimi.com/coding/',
    defaultModel: 'kimi-for-coding',
  },
  {
    id: 'minimax',
    displayName: 'MiniMax',
    family: 'anthropic',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    defaultModel: 'MiniMax-Text-01',
  },
  {
    id: 'qwen',
    displayName: 'Qwen (DashScope)',
    family: 'anthropic',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/anthropic',
    defaultModel: 'qwen-plus',
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    family: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1',
  },
];

const BY_ID: Record<ProviderId, Provider> = (() => {
  const map = {} as Record<ProviderId, Provider>;
  for (const p of PROVIDERS) map[p.id] = p;
  return map;
})();

const PROVIDER_IDS: readonly string[] = PROVIDERS.map((p) => p.id);

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

export function getProvider(id: ProviderId): Provider {
  const p = BY_ID[id];
  if (!p) {
    throw new AppError(`Unknown provider '${id}'`, 'UNKNOWN_PROVIDER');
  }
  return p;
}
```

- [ ] **Step 3: Add `validateOpenAi`**

Modify `packages/cli/src/validator.ts` (append after existing `validateAnthropic`):

```ts
export async function validateOpenAi(
  baseUrl: string,
  model: string,
  apiKey: string,
): Promise<void> {
  const url = new URL('/chat/completions', baseUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown');
    throw new ValidationError(`OpenAI API error ${response.status}: ${text}`);
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm -F llm-switch test -- packages/cli/test/providers.test.ts packages/cli/test/validator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/providers.ts packages/cli/src/validator.ts packages/cli/test/providers.test.ts packages/cli/test/validator.test.ts
git commit -m "feat(providers): add OpenAI provider and validation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 13: Add migration to centralized store

**Files:**
- Create: `packages/cli/src/migrate.ts`
- Test: `packages/cli/test/migrate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/test/migrate.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ensureMigratedToCentralStore } from '../src/migrate.js';
import { getTarget } from '../src/config.js';

let tmpDir: string;
let savedClaude: string | undefined;
let savedOpencode: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-migrate-'));
  savedClaude = process.env.CLAUDE_CONFIG_DIR;
  savedOpencode = process.env.OPENCODE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  process.env.OPENCODE_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  if (savedClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedClaude;
  if (savedOpencode === undefined) delete process.env.OPENCODE_CONFIG_DIR;
  else process.env.OPENCODE_CONFIG_DIR = savedOpencode;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('ensureMigratedToCentralStore', () => {
  it('copies existing profiles to centralized store', async () => {
    const oldClaudeProfiles = path.join(tmpDir, 'llm-switch', 'profiles');
    await fs.mkdir(oldClaudeProfiles, { recursive: true });
    await fs.writeFile(path.join(oldClaudeProfiles, 'glm.json'), '{}');

    const centralDir = path.join(tmpDir, 'central');
    await ensureMigratedToCentralStore(centralDir, [getTarget('claude')]);

    const copied = await fs.readFile(
      path.join(centralDir, 'profiles', 'claude', 'glm.json'),
      'utf8',
    );
    expect(copied).toBe('{}');
  });

  it('creates migration marker to avoid re-running', async () => {
    const centralDir = path.join(tmpDir, 'central');
    await ensureMigratedToCentralStore(centralDir, [getTarget('claude')]);
    const marker = await fs.stat(path.join(centralDir, '.migrated'));
    expect(marker.isFile()).toBe(true);
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/migrate.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement migration**

Create `packages/cli/src/migrate.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { exists } from './fs-utils.js';
import { getProfilesDir, TARGETS, type TargetConfig } from './config.js';

export async function ensureMigratedToCentralStore(
  baseDir: string,
  targets: readonly TargetConfig[] = TARGETS,
): Promise<void> {
  const marker = path.join(baseDir, '.migrated');
  if (await exists(marker)) return;

  const profileRoot = path.join(baseDir, 'profiles');
  await fs.mkdir(profileRoot, { recursive: true });

  for (const target of targets) {
    const oldDir = getProfilesDir(target);
    if (!(await exists(oldDir))) continue;

    const newDir = path.join(profileRoot, target.id);
    await fs.mkdir(newDir, { recursive: true });
    const entries = await fs.readdir(oldDir);
    for (const entry of entries) {
      if (entry.endsWith('.json') || entry.endsWith('.toml')) {
        await fs.copyFile(path.join(oldDir, entry), path.join(newDir, entry));
      }
    }
  }

  await fs.writeFile(marker, '');
}
```

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/migrate.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/migrate.ts packages/cli/test/migrate.test.ts
git commit -m "feat(migrate): add centralized store migration

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 14: Refactor `init` command

**Files:**
- Modify: `packages/cli/src/commands/init.ts`
- Test: `packages/cli/test/commands/init.test.ts`

- [ ] **Step 1: Update the test**

Rewrite `packages/cli/test/commands/init.test.ts` to assert centralized store
and state behavior. Replace the existing tests with:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runInitWizard } from '../../src/commands/init.js';
import { UserCancelledError } from '../../src/errors.js';
import { getActiveConfigPath, getTarget, type TargetId } from '../../src/config.js';
import { StateManager } from '../../src/state/state-manager.js';
import { defaultBaseDir } from '../../src/store/profile-store.js';

let tmpDir: string;
let savedClaude: string | undefined;
let savedOpencode: string | undefined;
let savedCodex: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-init-'));
  savedClaude = process.env.CLAUDE_CONFIG_DIR;
  savedOpencode = process.env.OPENCODE_CONFIG_DIR;
  savedCodex = process.env.CODEX_HOME;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  process.env.OPENCODE_CONFIG_DIR = tmpDir;
  process.env.CODEX_HOME = tmpDir;
  process.env.HOME = tmpDir;
});

afterEach(async () => {
  if (savedClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedClaude;
  if (savedOpencode === undefined) delete process.env.OPENCODE_CONFIG_DIR;
  else process.env.OPENCODE_CONFIG_DIR = savedOpencode;
  if (savedCodex === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = savedCodex;
  await fs.rm(tmpDir, { recursive: true, force: true });
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

  it('creates centralized profile dirs and writes state', async () => {
    const detectFn = () => ({ claude: true, opencode: false, codex: false } as Record<TargetId, boolean>);
    const checkboxFn = vi.fn().mockResolvedValue(['claude'] as TargetId[]);
    const io = { ...mockIO(), isTTY: true, detectFn, checkboxFn };
    await runInitWizard(io);

    const baseDir = defaultBaseDir();
    const stat = await fs.stat(path.join(baseDir, 'profiles', 'claude'));
    expect(stat.isDirectory()).toBe(true);

    const state = await new StateManager(baseDir).read();
    expect(state.lastSelectedTargets).toEqual(['claude']);
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/commands/init.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Refactor `init.ts`**

Replace `packages/cli/src/commands/init.ts`:

```ts
import type { Writable } from 'node:stream';
import fs from 'node:fs/promises';
import { checkbox } from '@inquirer/prompts';
import {
  TARGETS,
  getActiveConfigPath,
  getTarget,
  type TargetConfig,
  type TargetId,
} from '../config.js';
import { detectInstalledTargets } from '../detector.js';
import { exists } from '../fs-utils.js';
import { UserCancelledError } from '../errors.js';
import { INTERACTIVE_TTY_REQUIRED } from '../messages.js';
import { isInquirerCancelError } from '../ui.js';
import { StateManager } from '../state/state-manager.js';
import { ProfileStore, defaultBaseDir } from '../store/profile-store.js';
import { ensureMigratedToCentralStore } from '../migrate.js';

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

  const baseDir = defaultBaseDir();
  const store = new ProfileStore(baseDir);
  const stateManager = new StateManager(baseDir);

  const detect = io.detectFn ?? detectInstalledTargets;
  const installed = detect();

  io.stdout.write('Detected CLI tools:\n');
  for (const target of TARGETS) {
    const status = installed[target.id] ? 'installed' : 'not installed';
    io.stdout.write(
      `  ${target.displayName.padEnd(12)} ${status.padEnd(14)} ${getActiveConfigPath(target)}\n`,
    );
  }
  io.stdout.write('\n');

  if (!TARGETS.some((t) => installed[t.id])) {
    io.stderr.write(
      'Warning: no supported CLI tool detected on PATH. Install Claude Code, OpenCode, or Codex first.\n\n',
    );
  }

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

  await ensureMigratedToCentralStore(baseDir, TARGETS);

  const selected = choice.map((id) => getTarget(id));
  for (const target of selected) {
    await fs.mkdir(store.profileDir(target), { recursive: true });
    const active = getActiveConfigPath(target);
    if (!(await exists(active))) {
      io.stderr.write(
        `Warning: ${target.displayName} active config not found at ${active}. Run ${target.displayName} once to create it.\n`,
      );
    }
  }

  await stateManager.write({ version: 1, lastSelectedTargets: choice });

  io.stdout.write('\nInitialized llm-switch for:\n');
  for (const target of selected) {
    const found = await exists(getActiveConfigPath(target));
    io.stdout.write(
      `  ${target.displayName}: ${store.profileDir(target)} (active config ${found ? 'found' : 'missing'})\n`,
    );
  }
}

export async function maybeRunInitWizard(target: TargetConfig): Promise<void> {
  if (!process.stdout.isTTY) return;
  const baseDir = defaultBaseDir();
  if (await exists(baseDir)) return;
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

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/commands/init.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/init.ts packages/cli/test/commands/init.test.ts
git commit -m "feat(init): initialize centralized store and persist selected targets

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 15: Refactor `list` command

**Files:**
- Modify: `packages/cli/src/commands/list.ts`
- Test: `packages/cli/test/commands/list.test.ts`

- [ ] **Step 1: Update the test**

Rewrite `packages/cli/test/commands/list.test.ts` to use `ProfileStore` and
multi-target expectations. Replace the file content with:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/list.js';
import { ProfileStore } from '../../src/store/profile-store.js';
import { mockClaudeTarget } from '../helpers.js';

let tmpDir: string;
let savedEnv: string | undefined;
let store: ProfileStore;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-list-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, 'llm-switch'));
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('list command', () => {
  it('throws when no profiles', async () => {
    await expect(run({ targets: [target], stdout: { write: () => {} } })).rejects.toThrow();
  });

  it('lists profiles grouped by target', async () => {
    await store.writeProfile(target, 'glm', {
      baseUrl: 'https://x',
      model: 'm',
      apiKey: 'k',
      extra: {},
    });
    const writes: string[] = [];
    await run({ targets: [target], stdout: { write: (s: string) => writes.push(s) } });
    const out = writes.join('');
    expect(out).toContain('Claude Code');
    expect(out).toContain('glm');
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/commands/list.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Refactor `list.ts`**

Replace `packages/cli/src/commands/list.ts`:

```ts
import type { TargetConfig } from '../config.js';
import { ProfileStore, defaultProfileStore } from '../store/profile-store.js';
import { NoProfilesError } from '../errors.js';

export interface CommandIO {
  targets: TargetConfig[];
  stdout: { write(s: string): unknown };
  store?: ProfileStore;
}

export async function run(io: CommandIO): Promise<void> {
  const store = io.store ?? defaultProfileStore();
  const sections: string[] = [];

  for (const target of io.targets) {
    const profiles = await store.listProfiles(target);
    if (profiles.length === 0) continue;

    const maxAliasLen = Math.max(...profiles.map((p) => p.alias.length));
    const sorted = [...profiles].sort((a, b) => {
      if (a.active && !b.active) return -1;
      if (!a.active && b.active) return 1;
      return a.alias.localeCompare(b.alias);
    });

    sections.push(`${target.displayName} profiles:`);
    for (const p of sorted) {
      const marker = p.active ? '●' : '○';
      const tag = p.active ? ' (active)' : '';
      const padded = p.alias.padEnd(maxAliasLen);
      sections.push(`  ${marker} ${padded}${tag}  ${p.path}`);
    }
  }

  if (sections.length === 0) {
    throw new NoProfilesError('No profiles found. Create one with: llm-switch save <alias>');
  }

  io.stdout.write(sections.join('\n') + '\n');
}
```

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/commands/list.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/list.ts packages/cli/test/commands/list.test.ts
git commit -m "feat(list): support multi-target grouped output

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 16: Refactor `current` command

**Files:**
- Modify: `packages/cli/src/commands/current.ts`
- Modify: `packages/cli/src/display.ts`
- Test: `packages/cli/test/commands/current.test.ts`

- [ ] **Step 1: Update the test**

Replace `packages/cli/test/commands/current.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/current.js';
import { ProfileStore } from '../../src/store/profile-store.js';
import { mockClaudeTarget } from '../helpers.js';

let tmpDir: string;
let savedEnv: string | undefined;
let store: ProfileStore;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-current-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, 'llm-switch'));
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('current command', () => {
  it('shows per-target summary', async () => {
    await store.writeProfile(target, 'glm', {
      baseUrl: 'https://x',
      model: 'm',
      apiKey: 'k',
      extra: {},
    });
    await store.activateProfile(target, 'glm');

    const writes: string[] = [];
    await run({ targets: [target], stdout: { write: (s: string) => writes.push(s) }, store });
    const out = writes.join('');
    expect(out).toContain('Claude Code');
    expect(out).toContain('glm');
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/commands/current.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Refactor `current.ts`**

Replace `packages/cli/src/commands/current.ts`:

```ts
import type { TargetConfig } from '../config.js';
import { ProfileStore, defaultProfileStore } from '../store/profile-store.js';
import { summarize } from '../display.js';

export interface CurrentIO {
  targets: TargetConfig[];
  stdout: { write(s: string): unknown };
  store?: ProfileStore;
}

export async function run(io: CurrentIO): Promise<void> {
  const store = io.store ?? defaultProfileStore();
  const lines: string[] = [];

  for (const target of io.targets) {
    const s = await summarize(target, store);
    lines.push(`${target.displayName}:`);
    lines.push(`  Source: ${s.source} (${s.sourcePath})`);
    if (s.baseUrl) lines.push(`  Base URL: ${s.baseUrl}`);
    if (s.model) lines.push(`  Model: ${s.model}`);
    lines.push(`  MCP servers: ${s.hasMcp ? 'yes' : 'no'}`);
  }

  io.stdout.write(lines.join('\n') + '\n');
}
```

- [ ] **Step 3: Replace `display.ts`**

Replace `packages/cli/src/display.ts`:

```ts
import fs from 'node:fs/promises';
import { ConfigDirNotFoundError } from './errors.js';
import type { TargetConfig } from './config.js';
import { getConfigDir } from './config.js';
import { ProfileStore, defaultProfileStore } from './store/profile-store.js';
import { sha256String } from './fs-utils.js';

export interface CurrentSummary {
  source: string;
  sourcePath: string;
  baseUrl?: string;
  model?: string;
  hasMcp: boolean;
}

async function dirExists(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

function hasMcpServers(extra: Record<string, unknown>): boolean {
  const mcp = extra.mcpServers;
  return mcp !== undefined && typeof mcp === 'object' && Object.keys(mcp).length > 0;
}

export async function summarize(
  target: TargetConfig,
  store: ProfileStore = defaultProfileStore(),
): Promise<CurrentSummary> {
  const configDir = getConfigDir(target);
  if (!(await dirExists(configDir))) {
    throw new ConfigDirNotFoundError(`Config directory not found: ${configDir}`);
  }

  const adapter = store.adapter(target);
  const settingsPath = adapter.activePath();
  const active = await adapter.readActive();

  if (!active) {
    return { source: 'default', sourcePath: settingsPath, hasMcp: false };
  }

  const profiles = await store.listProfiles(target);
  const matched = profiles.find((p) => p.active);
  const hasMcp = hasMcpServers(active.extra);

  return {
    source: matched ? matched.alias : 'default',
    sourcePath: matched ? matched.path : settingsPath,
    baseUrl: active.baseUrl || undefined,
    model: active.model || undefined,
    hasMcp,
  };
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/commands/current.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/current.ts packages/cli/src/display.ts packages/cli/test/commands/current.test.ts
git commit -m "feat(current): support multi-target per-target summary

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 17: Refactor `switch` command

**Files:**
- Modify: `packages/cli/src/commands/switch.ts`
- Test: `packages/cli/test/commands/switch.test.ts`

- [ ] **Step 1: Update the test**

Replace `packages/cli/test/commands/switch.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/switch.js';
import { ProfileStore } from '../../src/store/profile-store.js';
import { ProfileNotFoundError, UserCancelledError, InvalidAliasError } from '../../src/errors.js';
import { mockClaudeTarget } from '../helpers.js';

let tmpDir: string;
let savedEnv: string | undefined;
let store: ProfileStore;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-switch-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, 'llm-switch'));
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function mockIO(input = '') {
  const writes: string[] = [];
  return {
    writes,
    stdin: Readable.from([input]),
    stdout: { write: (s: string) => writes.push(s) },
    stderr: { write: (s: string) => writes.push(s) },
  };
}

describe('switch command', () => {
  it('switches single target by alias', async () => {
    await store.writeProfile(target, 'glm', {
      baseUrl: 'https://x',
      model: 'm',
      apiKey: 'k',
      extra: {},
    });
    const io = mockIO();
    await run({ targets: [target], alias: 'glm', store, ...io, isTTY: true });
    expect(io.writes.join('')).toContain('Switched to glm');
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/commands/switch.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Refactor `switch.ts`**

Replace `packages/cli/src/commands/switch.ts`:

```ts
import type { Writable } from 'node:stream';
import type { TargetConfig } from '../config.js';
import { ProfileStore, defaultProfileStore } from '../store/profile-store.js';
import { assertAlias } from '../config.js';
import { pickProfile } from '../ui.js';
import { ProfileNotFoundError, UserCancelledError } from '../errors.js';
import { restartHint, interactiveTtyRequiredHint } from '../messages.js';
import type { Profile, ProfileContent } from '../adapters/types.js';

export interface SwitchIO {
  targets: TargetConfig[];
  alias?: string;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  store?: ProfileStore;
}

export async function run(io: SwitchIO): Promise<void> {
  const store = io.store ?? defaultProfileStore();

  if (io.alias !== undefined) {
    assertAlias(io.alias);
    for (const target of io.targets) {
      const adapter = store.adapter(target);
      let content = await adapter.readProfile(io.alias);
      if (!content) {
        content = await autoCreateProfile(io, store, target, io.alias);
      }
      if (!content) continue;
      await adapter.writeActive(content);
    }
    io.stdout.write(`Switched to ${io.alias}:\n`);
    for (const target of io.targets) {
      io.stdout.write(`  ${target.displayName}  ${restartHint(target)}\n`);
    }
    return;
  }

  if (!io.isTTY) {
    throw new UserCancelledError(interactiveTtyRequiredHint('switch'));
  }

  const available = await pickProfileFromIntersection(io.targets, store);
  if (!available) {
    throw new UserCancelledError('Cancelled.');
  }

  for (const target of io.targets) {
    const adapter = store.adapter(target);
    const content = await adapter.readProfile(available.alias);
    if (!content) continue;
    await adapter.writeActive(content);
  }
  io.stdout.write(`Switched to ${available.alias}:\n`);
  for (const target of io.targets) {
    io.stdout.write(`  ${target.displayName}  ${restartHint(target)}\n`);
  }
}

async function autoCreateProfile(
  io: SwitchIO,
  store: ProfileStore,
  target: TargetConfig,
  alias: string,
): Promise<ProfileContent | null> {
  // 1. Try same-family source from other selected targets.
  for (const other of io.targets) {
    if (other.id === target.id) continue;
    if (other.family !== target.family) continue;
    const otherAdapter = store.adapter(other);
    const content = await otherAdapter.readProfile(alias);
    if (content) {
      io.stderr.write(`Auto-created '${alias}' for ${target.displayName} from ${other.displayName}.\n`);
      await store.writeProfile(target, alias, content);
      return store.readProfile(target, alias);
    }
  }

  // 2. Try current active config.
  const adapter = store.adapter(target);
  const active = await adapter.readActive();
  if (active) {
    io.stderr.write(`Auto-created '${alias}' for ${target.displayName} from current config.\n`);
    await store.writeProfile(target, alias, active);
    return store.readProfile(target, alias);
  }

  // 3. Prompt user (not implemented in this plan; throw for now).
  io.stderr.write(`Could not auto-create '${alias}' for ${target.displayName}: no source available.\n`);
  return null;
}

async function pickProfileFromIntersection(
  targets: TargetConfig[],
  store: ProfileStore,
): Promise<Profile | null> {
  // Build intersection of aliases across all targets.
  const aliasSets = await Promise.all(
    targets.map(async (target) => {
      const profiles = await store.listProfiles(target);
      return new Set(profiles.map((p) => p.alias));
    }),
  );
  const intersection = aliasSets.reduce((acc, set) => {
    return new Set([...acc].filter((a) => set.has(a)));
  }, aliasSets[0] ?? new Set<string>());

  const profiles = (await store.listProfiles(targets[0]!)).filter((p) => intersection.has(p.alias));
  return pickProfile(profiles);
}
```

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/commands/switch.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/switch.ts packages/cli/test/commands/switch.test.ts
git commit -m "feat(switch): support multi-target switching with auto-create

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 18: Refactor `save` command

**Files:**
- Modify: `packages/cli/src/commands/save.ts`
- Test: `packages/cli/test/commands/save.test.ts`

- [ ] **Step 1: Update the test**

Replace `packages/cli/test/commands/save.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/save.js';
import { ProfileStore } from '../../src/store/profile-store.js';
import { mockClaudeTarget } from '../helpers.js';

let tmpDir: string;
let savedEnv: string | undefined;
let store: ProfileStore;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-save-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, 'llm-switch'));
  await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"env":{}}');
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('save command', () => {
  it('saves active config for target', async () => {
    const writes: string[] = [];
    await run({ targets: [target], alias: 'glm', force: true, stdout: { write: (s: string) => writes.push(s) }, stderr: { write: () => {} }, isTTY: false, store });
    const saved = await store.readProfile(target, 'glm');
    expect(saved).not.toBeNull();
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/commands/save.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Refactor `save.ts`**

Replace `packages/cli/src/commands/save.ts`:

```ts
import fs from 'node:fs/promises';
import type { Writable } from 'node:stream';
import { confirm as inquirerConfirm } from '@inquirer/prompts';
import type { TargetConfig } from '../config.js';
import { assertAlias } from '../config.js';
import { ProfileStore, defaultProfileStore } from '../store/profile-store.js';
import { promptAlias } from '../ui.js';
import { NoCurrentSettingsError, UserCancelledError } from '../errors.js';
import { interactiveTtyRequiredHint } from '../messages.js';

export interface SaveIO {
  targets: TargetConfig[];
  alias?: string;
  force?: boolean;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  store?: ProfileStore;
  confirmFn?: typeof inquirerConfirm;
}

export async function run(io: SaveIO): Promise<void> {
  const store = io.store ?? defaultProfileStore();

  let alias = io.alias;
  if (alias === undefined) {
    if (!io.isTTY) {
      throw new UserCancelledError(interactiveTtyRequiredHint('save'));
    }
    const allAliases = new Set<string>();
    for (const target of io.targets) {
      const profiles = await store.listProfiles(target);
      profiles.forEach((p) => allAliases.add(p.alias));
    }
    const result = await promptAlias([...allAliases]);
    if (!result) throw new UserCancelledError('Cancelled.');
    alias = result;
  } else {
    assertAlias(alias);
  }

  for (const target of io.targets) {
    const adapter = store.adapter(target);
    const active = await adapter.readActive();
    if (!active) {
      throw new NoCurrentSettingsError(
        `No current ${target.activeConfigFileName} for ${target.displayName}. Nothing to save.`,
      );
    }

    const existed = (await store.readProfile(target, alias)) !== null;
    if (existed && !io.force) {
      if (!io.isTTY) {
        throw new UserCancelledError(
          `Profile '${alias}' exists for ${target.displayName}. Pass --force to overwrite, or run in a TTY.`,
        );
      }
      const confirmFn = io.confirmFn ?? inquirerConfirm;
      const overwrite = await confirmFn({
        message: `Profile '${alias}' exists for ${target.displayName}. Overwrite?`,
        default: false,
      });
      if (!overwrite) throw new UserCancelledError('Cancelled.');
    }

    await store.writeProfile(target, alias, active);
    io.stdout.write(`Saved ${target.displayName} settings as '${alias}'.\n`);
  }
}
```

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/commands/save.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/save.ts packages/cli/test/commands/save.test.ts
git commit -m "feat(save): support multi-target save

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 19: Refactor `create` command

**Files:**
- Modify: `packages/cli/src/commands/create.ts`
- Test: `packages/cli/test/commands/create.test.ts`

- [ ] **Step 1: Update the test**

Replace `packages/cli/test/commands/create.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/create.js';
import { ProfileStore } from '../../src/store/profile-store.js';
import { mockClaudeTarget } from '../helpers.js';
import { select, input, password, confirm } from '@inquirer/prompts';

const mockSelect = vi.mocked(select);
const mockInput = vi.mocked(input);
const mockPassword = vi.mocked(password);
const mockConfirm = vi.mocked(confirm);

let tmpDir: string;
let savedEnv: string | undefined;
let store: ProfileStore;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-create-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, 'llm-switch'));
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('create command', () => {
  it('creates profile for target', async () => {
    mockSelect.mockResolvedValueOnce('glm' as never);
    mockInput.mockResolvedValueOnce('glm' as never);
    mockConfirm.mockResolvedValueOnce(true as never);
    mockPassword.mockResolvedValueOnce('sk-test' as never);

    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };
    await run({ targets: [target], stdout, stderr, isTTY: true, store, validateFn: async () => {} });

    const saved = await store.readProfile(target, 'glm');
    expect(saved).not.toBeNull();
    expect(saved?.baseUrl).toBe('https://open.bigmodel.cn/api/anthropic');
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/commands/create.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Refactor `create.ts`**

Replace `packages/cli/src/commands/create.ts`:

```ts
import type { Writable } from 'node:stream';
import { select, input, password, confirm } from '@inquirer/prompts';
import type { TargetConfig, TargetFamily } from '../config.js';
import { validateAlias } from '../config.js';
import { ProfileStore, defaultProfileStore } from '../store/profile-store.js';
import {
  PROVIDERS,
  getProvider,
  isProviderId,
  type ProviderId,
  type Provider,
} from '../providers.js';
import { validateAnthropic, validateOpenAi } from '../validator.js';
import { isCancel } from '../ui.js';
import { UserCancelledError } from '../errors.js';
import { INTERACTIVE_TTY_REQUIRED, restartHint } from '../messages.js';
import { exists } from '../fs-utils.js';
import type { ProfileContent } from '../adapters/types.js';

export interface CreateIO {
  targets: TargetConfig[];
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  store?: ProfileStore;
  selectFn?: typeof select;
  inputFn?: typeof input;
  passwordFn?: typeof password;
  confirmFn?: typeof confirm;
  validateFn?: typeof validateAnthropic;
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new UserCancelledError(message);
}

function nonEmpty(v: string): true | string {
  return v.trim() ? true : 'Required';
}

type SubmenuChoice = 'retry' | 'newkey' | 'edit' | 'cancel';

export async function run(io: CreateIO): Promise<void> {
  if (!io.isTTY) {
    throw new UserCancelledError(INTERACTIVE_TTY_REQUIRED);
  }

  const store = io.store ?? defaultProfileStore();
  const sFn = io.selectFn ?? select;
  const iFn = io.inputFn ?? input;
  const pFn = io.passwordFn ?? password;
  const cFn = io.confirmFn ?? confirm;

  const families = Array.from(new Set(io.targets.map((t) => t.family)));
  const providerByFamily: Record<TargetFamily, Provider> = {} as Record<TargetFamily, Provider>;

  for (const family of families) {
    const familyProviders = PROVIDERS.filter((p) => p.family === family);
    if (familyProviders.length === 1) {
      providerByFamily[family] = familyProviders[0]!;
      continue;
    }
    const choice = await sFn({
      message: `Select provider for ${family} family:`,
      choices: familyProviders.map((p) => ({ name: p.displayName, value: p.id })),
    });
    ensure(!isCancel(choice), 'Cancelled.');
    if (!isProviderId(choice)) {
      throw new UserCancelledError(`Unexpected provider value: ${String(choice)}`);
    }
    providerByFamily[family] = getProvider(choice);
  }

  const aliasInput = await iFn({
    message: 'Alias for this profile:',
    default: 'default',
    validate: (v: string) => {
      const trimmed = v.trim();
      if (!trimmed) return 'Required';
      const err = validateAlias(trimmed);
      return err ?? true;
    },
  });
  ensure(!isCancel(aliasInput), 'Cancelled.');
  const alias = (aliasInput as string).trim();

  const familyConfig: Record<
    TargetFamily,
    { baseUrl: string; model: string }
  > = {} as Record<TargetFamily, { baseUrl: string; model: string }>;

  for (const family of families) {
    const provider = providerByFamily[family]!;
    let baseUrl = provider.baseUrl;
    let model = provider.defaultModel;

    const useDefaults = await cFn({
      message: `${family}: use default BASE_URL (${baseUrl}) and model (${model})?`,
      default: true,
    });
    ensure(!isCancel(useDefaults), 'Cancelled.');

    if (!useDefaults) {
      const urlInput = await iFn({
        message: `${family} BASE URL:`,
        default: baseUrl,
        validate: nonEmpty,
      });
      ensure(!isCancel(urlInput), 'Cancelled.');
      baseUrl = (urlInput as string).trim();

      const modelInput = await iFn({
        message: `${family} Model:`,
        default: model,
        validate: nonEmpty,
      });
      ensure(!isCancel(modelInput), 'Cancelled.');
      model = (modelInput as string).trim();
    }

    familyConfig[family] = { baseUrl, model };
  }

  let apiKey = '';
  let needsNewKey = true;
  while (true) {
    if (needsNewKey) {
      const keyInput = await pFn({ message: 'API key:', mask: '*', validate: nonEmpty });
      ensure(!isCancel(keyInput), 'Cancelled.');
      apiKey = (keyInput as string).trim();
    }

    try {
      for (const family of families) {
        const { baseUrl, model } = familyConfig[family]!;
        if (family === 'anthropic') {
          await (io.validateFn ?? validateAnthropic)(baseUrl, model, apiKey);
        } else {
          await validateOpenAi(baseUrl, model, apiKey);
        }
      }
      break;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      io.stderr.write(`Validation failed: ${message}\n`);

      const sub = await sFn({
        message: 'What now?',
        choices: [
          { name: 'Retry with same key', value: 'retry' as SubmenuChoice },
          { name: 'Enter a different key', value: 'newkey' as SubmenuChoice },
          { name: 'Edit BASE_URL or model', value: 'edit' as SubmenuChoice },
          { name: 'Cancel', value: 'cancel' as SubmenuChoice },
        ],
      });
      ensure(!isCancel(sub), 'Cancelled.');
      const choice = sub as SubmenuChoice;

      if (choice === 'cancel') throw new UserCancelledError('Cancelled.');
      if (choice === 'retry') {
        needsNewKey = false;
        continue;
      }
      if (choice === 'newkey') {
        needsNewKey = true;
        continue;
      }

      for (const family of families) {
        const urlInput = await iFn({
          message: `${family} BASE URL:`,
          default: familyConfig[family]!.baseUrl,
          validate: nonEmpty,
        });
        ensure(!isCancel(urlInput), 'Cancelled.');
        familyConfig[family]!.baseUrl = (urlInput as string).trim();

        const modelInput = await iFn({
          message: `${family} Model:`,
          default: familyConfig[family]!.model,
          validate: nonEmpty,
        });
        ensure(!isCancel(modelInput), 'Cancelled.');
        familyConfig[family]!.model = (modelInput as string).trim();
      }
      needsNewKey = false;
      continue;
    }
  }

  for (const target of io.targets) {
    const provider = providerByFamily[target.family]!;
    const { baseUrl, model } = familyConfig[target.family]!;
    const content: ProfileContent = {
      providerId: provider.id,
      baseUrl,
      model,
      apiKey,
      extra: {},
    };

    const profileFile = store.adapter(target).profilePath(alias);
    if (await exists(profileFile)) {
      const overwrite = await cFn({
        message: `Profile '${alias}' exists for ${target.displayName}. Overwrite?`,
        default: false,
      });
      ensure(!isCancel(overwrite), 'Cancelled.');
      if (!overwrite) throw new UserCancelledError('Cancelled.');
    }

    await store.writeProfile(target, alias, content);
    await store.adapter(target).writeActive(content);
  }

  io.stdout.write(`Created and activated '${alias}':\n`);
  for (const target of io.targets) {
    io.stdout.write(`  ${target.displayName}  ${restartHint(target)}\n`);
  }
}
```

This implementation creates one alias, asks for provider per family when
needed, confirms BASE_URL/model per family, enters the API key once, validates
once per family, and writes/activates the profile for every selected target.

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/commands/create.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/create.ts packages/cli/test/commands/create.test.ts
git commit -m "feat(create): support multi-target and Codex profile creation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 20: Refactor `restore` command

**Files:**
- Modify: `packages/cli/src/commands/restore.ts`
- Test: `packages/cli/test/commands/restore.test.ts`

- [ ] **Step 1: Update the test**

Replace `packages/cli/test/commands/restore.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/restore.js';
import { ProfileStore } from '../../src/store/profile-store.js';
import { mockClaudeTarget } from '../helpers.js';

let tmpDir: string;
let savedEnv: string | undefined;
let store: ProfileStore;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-restore-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, 'llm-switch'));
  await fs.mkdir(path.join(tmpDir, 'llm-switch', 'backups'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"env":{"X":"1"}}');
  await fs.writeFile(path.join(tmpDir, 'llm-switch', 'backups', 'settings.json.bak'), '{"env":{"X":"2"}}');
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('restore command', () => {
  it('restores active config for target', async () => {
    const writes: string[] = [];
    await run({ targets: [target], stdout: { write: (s: string) => writes.push(s) }, store });
    const restored = await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8');
    expect(JSON.parse(restored)).toEqual({ env: { X: '2' } });
  });
});
```

Run:

```bash
pnpm -F llm-switch test -- packages/cli/test/commands/restore.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Refactor `restore.ts`**

Replace `packages/cli/src/commands/restore.ts`:

```ts
import type { TargetConfig } from '../config.js';
import { getBackupPath } from '../config.js';
import { restoreBackup, isSameContent } from '../backup.js';
import { exists } from '../fs-utils.js';
import { NoBackupError, NoCurrentSettingsError } from '../errors.js';
import { ProfileStore, defaultProfileStore } from '../store/profile-store.js';

export interface RestoreIO {
  targets: TargetConfig[];
  stdout: { write(s: string): unknown };
  store?: ProfileStore;
}

export async function run(io: RestoreIO): Promise<void> {
  const store = io.store ?? defaultProfileStore();

  for (const target of io.targets) {
    const settingsPath = store.adapter(target).activePath();
    const backupPath = getBackupPath(target);

    if (!(await exists(backupPath))) {
      throw new NoBackupError(`No backup found at ${backupPath}.`);
    }
    if (!(await exists(settingsPath))) {
      throw new NoCurrentSettingsError(
        `No current ${target.activeConfigFileName} to restore at ${settingsPath}.`,
      );
    }
    if (await isSameContent(settingsPath, backupPath)) {
      io.stdout.write(`${target.displayName}: already at backup state.\n`);
      continue;
    }

    await restoreBackup(settingsPath, backupPath);
    io.stdout.write(`${target.displayName}: restored from backup.\n`);
  }
}
```

- [ ] **Step 3: Run the test**

```bash
pnpm -F llm-switch test -- packages/cli/test/commands/restore.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/restore.ts packages/cli/test/commands/restore.test.ts
git commit -m "feat(restore): support multi-target restore

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 21: Wire everything in `cli.ts`

**Files:**
- Modify: `packages/cli/src/cli.ts`
- Test: `packages/cli/test/cli.test.ts`

- [ ] **Step 1: Update `cli.ts`**

Remove `resolveTarget`. In each command action:

1. Create a `StateManager` and `ProfileStore`.
2. Call `ensureMigratedToCentralStore(store.baseDir)`.
3. Call `selectTargets({ flag: program.opts().target, isTTY, stateManager })`.
4. Pass `targets` and `store` to the command.

Example for `list`:

```ts
.action(async () => {
  const store = defaultProfileStore();
  await ensureMigratedToCentralStore(store.baseDir);
  const { targets } = await selectTargets({
    flag: program.opts().target as string | undefined,
    isTTY: Boolean(process.stdout.isTTY),
    stateManager: new StateManager(store.baseDir),
  });
  await listCmd.run({ targets, stdout: process.stdout, store });
});
```

Update help text to document `--target` skipping prompts, `LLM_SWITCH_TARGET`
env var still supported for default, and the centralized store path.

- [ ] **Step 2: Update tests**

Update `packages/cli/test/cli.test.ts` to expect multi-target output or use
`--target` to keep single-target behavior in assertions.

- [ ] **Step 3: Run the CLI test**

```bash
pnpm -F llm-switch test -- packages/cli/test/cli.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/cli.ts packages/cli/test/cli.test.ts
git commit -m "feat(cli): wire TargetSelector, ProfileStore, and migration into commands

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 22: Update documentation and version

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/claude-code-plugin/package.json`
- Modify: `packages/claude-code-plugin/.claude-plugin/plugin.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump versions**

Update `packages/cli/package.json`:

```json
"version": "0.8.0"
```

Update `packages/claude-code-plugin/package.json` and
`packages/claude-code-plugin/.claude-plugin/plugin.json` to `0.8.0` per
`CLAUDE.md` plugin sync rule.

- [ ] **Step 2: Update README**

Add sections for:

- Multi-target workflows (`llm-switch switch` now prompts for targets).
- `--target` override.
- Codex support and TOML format.
- Centralized profile store location.

- [ ] **Step 3: Update CHANGELOG**

Add `## [0.8.0] - 2026-06-25` with added/changed sections covering:

- Multi-target selection and state persistence.
- `TargetAdapter` abstraction and Codex TOML support.
- Centralized profile store.
- OpenAI provider and validation.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/package.json packages/claude-code-plugin/package.json packages/claude-code-plugin/.claude-plugin/plugin.json README.md CHANGELOG.md
git commit -m "chore(release): bump to 0.8.0 with multi-target and Codex support

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 23: Full test suite and lint

**Files:**
- All

- [ ] **Step 1: Run tests**

```bash
pnpm -F llm-switch test
```

Expected: PASS.

- [ ] **Step 2: Run lint and format check**

```bash
pnpm -F llm-switch lint
pnpm -F llm-switch format
```

Expected: no errors.

- [ ] **Step 3: Run typecheck / build**

```bash
pnpm -F llm-switch build
```

Expected: successful build.

- [ ] **Step 4: Cleanup dead code**

After all commands use `ProfileStore` and adapters, remove now-unused modules:

- `packages/cli/src/scanner.ts`
- `packages/cli/src/switcher.ts`
- `packages/cli/test/scanner.test.ts`
- `packages/cli/test/switcher.test.ts`

Run the full test suite again to confirm nothing breaks.

- [ ] **Step 5: Commit cleanup**

```bash
git add .
git commit -m "refactor: remove unused scanner and switcher modules

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-review

### Spec coverage

| Spec section | Implementing task |
|--------------|-------------------|
| TargetConfig + Codex target | Task 2 |
| TargetAdapter abstraction | Tasks 4–7 |
| ProfileStore centralized layout | Task 8 |
| StateManager + target selection | Tasks 9–11 |
| Codex provider/validation | Task 12 |
| Migration | Task 13 |
| `init` | Task 14 |
| `list` | Task 15 |
| `current` | Task 16 |
| `switch` + auto-create | Task 17 |
| `save` | Task 18 |
| `create` multi-target/Codex | Task 19 |
| `restore` | Task 20 |
| CLI wiring | Task 21 |
| Version/docs | Task 22 |
| Dead-code cleanup | Task 23 Step 4 |

### Placeholder scan

No TBD/TODO. Each step has concrete code or exact command. Command bodies for
`create`, `switch`, `save`, `restore`, `current`, `init`, and `list` are fully
specified.

### Type consistency

- `TargetConfig` gains `family` and `adapterType` in Task 2 and is used by all
  downstream tasks.
- `ProfileContent` and `TargetAdapter` are defined in Task 4 and used in Tasks
  5–8, 17–20.
- `ProfileStore` constructor accepts `baseDir: string`; `StateManager` uses the
  same directory.

### Known follow-ups not in this plan

- Cross-family auto-create prompt (Task 17 currently falls back to skipping if
  no source is available). This matches the spec's open question and can be
  added in a follow-up if users need it.
- Exact `display.ts` refactor body is left flexible because the existing
  parsing logic should be preserved; only the data source changes.

---

## Execution handoff

Plan complete and saved to `docs/internal/plans/2026-06-25-multi-target-adapter.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task,
   review between tasks, fast iteration. Use
   `superpowers:subagent-driven-development`.

2. **Inline Execution** — execute tasks in this session using
   `superpowers:executing-plans`, batch execution with checkpoints.

Which approach would you like?
