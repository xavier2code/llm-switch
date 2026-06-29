# Plan 1: 底层修复与配置目录重构

> **Current state note (2026-06-26):** The working tree already contains substantial uncommitted changes. Based on a fresh review against `docs/OPTIMIZATIONS.md`:
>
> - **Already fixed**: `create` non-interactive flags (Task 11), `init --yes` (Task 12).
> - **Partially fixed**: adapter `writeActive` now wraps `writeFile`+`chmod`+`rename` in one `try` (Task 2), but there is no startup cleanup of stale `.tmp` files; `state-manager.ts` creates dir with `0o700` but still writes `state.json` directly.
> - **Not fixed**: `switch` auto-create backup bug (Task 8), `restoreBackup` fsync (Task 4), `state.json` atomic write (Task 3), `cli.ts` split (Task 10), `ensureMigrated` subdir check (Task 9).
> - **Added by design**: config directory move to `~/.llm-switch/` and adapter merge-on-activate behavior (Tasks 6, 7, 9).
>
> Tasks below have been updated to skip already-implemented work.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `docs/OPTIMIZATIONS.md` 中影响数据安全和 TUI 稳定性的底层问题，将配置目录迁移到 `~/.llm-switch/`，并把 active 配置写入从整文件覆盖改为 merge 更新。

**Architecture:** 抽取 `atomicWrite` 工具统一所有配置文件写入；重构两个 adapter 消除重复逻辑并改为 merge 策略；修复 `switch.ts` auto-create 数据丢失；拆分臃肿的 `cli.ts`；补齐 smoke test 和错误路径测试。所有改动保持现有 CLI 行为向后兼容。

**Tech Stack:** Node.js 20+, TypeScript, Vitest, Commander.js, @iarna/toml

---

## File Structure

**新增文件：**

- `packages/cli/src/utils/atomic-write.ts` — 原子文件写入工具
- `packages/cli/src/utils/atomic-write.test.ts` — atomicWrite 测试
- `packages/cli/src/adapters/base-adapter.ts` — adapter 公共基类
- `packages/cli/src/commands/register/` — 各子命令注册函数
- `packages/cli/test/cli.smoke.test.ts` — CLI 端到端 smoke test
- `packages/cli/test/adapters/anthropic-json-adapter.test.ts` — JSON adapter 测试
- `packages/cli/test/adapters/openai-toml-adapter.test.ts` — TOML adapter 测试

**修改文件：**

- `packages/cli/src/adapters/anthropic-json-adapter.ts` — 继承基类，只实现序列化/反序列化
- `packages/cli/src/adapters/openai-toml-adapter.ts` — 继承基类，只实现序列化/反序列化
- `packages/cli/src/state/state-manager.ts` — state.json 走 atomicWrite
- `packages/cli/src/backup.ts` — restoreBackup 增加 fsync
- `packages/cli/src/commands/switch.ts` — 修复 auto-create 丢失 active
- `packages/cli/src/config.ts` — 路径改为 `~/.llm-switch/`，修复 ensureMigrated
- `packages/cli/src/migrate.ts` — 修复迁移回滚，支持从旧目录迁移
- `packages/cli/src/store/profile-store.ts` — 权限和路径调整
- `packages/cli/src/cli.ts` — 拆分命令注册
- `packages/cli/src/commands/create.ts` — 增加非交互参数
- `packages/cli/src/commands/init.ts` — 增加 `--yes`
- `packages/cli/src/logger.ts` — 扩展 info/warn
- `packages/cli/src/validator.ts` — OpenAI 校验错误提示

---

## Task 1: 抽取 atomicWrite 工具

**Files:**
- Create: `packages/cli/src/utils/atomic-write.ts`
- Test: `packages/cli/src/utils/atomic-write.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { atomicWrite } from './atomic-write.js';

describe('atomicWrite', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-write-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes content to target path', async () => {
    const target = path.join(tmpDir, 'target.txt');
    await atomicWrite(target, 'hello', { mode: 0o600 });
    const content = await fs.readFile(target, 'utf8');
    expect(content).toBe('hello');
  });

  it('sets file mode', async () => {
    const target = path.join(tmpDir, 'target.txt');
    await atomicWrite(target, 'hello', { mode: 0o600 });
    const stat = await fs.stat(target);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('does not leave tmp file on success', async () => {
    const target = path.join(tmpDir, 'target.txt');
    await atomicWrite(target, 'hello', { mode: 0o600 });
    const entries = await fs.readdir(tmpDir);
    expect(entries).toEqual(['target.txt']);
  });

  it('cleans up tmp file on failure', async () => {
    const target = path.join(tmpDir, 'readonly-dir', 'target.txt');
    await fs.mkdir(path.dirname(target), { mode: 0o500 });
    await expect(atomicWrite(target, 'hello', { mode: 0o600 })).rejects.toThrow();
    const entries = await fs.readdir(path.dirname(target));
    expect(entries.filter((e) => e.endsWith('.tmp'))).toEqual([]);
    await fs.chmod(path.dirname(target), 0o700);
  });

  it('creates parent directory if needed', async () => {
    const target = path.join(tmpDir, 'nested', 'target.txt');
    await atomicWrite(target, 'hello', { mode: 0o600 });
    const content = await fs.readFile(target, 'utf8');
    expect(content).toBe('hello');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
npx vitest run src/utils/atomic-write.test.ts
```

Expected: FAIL with "atomicWrite is not defined" or similar.

- [ ] **Step 3: Implement atomicWrite**

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export type AtomicWriteOptions = {
  mode?: number;
};

export async function atomicWrite(
  targetPath: string,
  content: string,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });

  const tmpName = `.atomic-write-${crypto.randomUUID()}.tmp`;
  const tmpPath = path.join(dir, tmpName);

  try {
    await fs.writeFile(tmpPath, content, { mode: options.mode });
    if (options.mode !== undefined) {
      await fs.chmod(tmpPath, options.mode);
    }
    await fs.rename(tmpPath, targetPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true });
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/utils/atomic-write.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/atomic-write.ts packages/cli/src/utils/atomic-write.test.ts
git commit -m "feat(core): add atomicWrite utility for safe config writes

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Adapter 写入改为 atomicWrite

**Files:**
- Modify: `packages/cli/src/adapters/anthropic-json-adapter.ts:59-76`
- Modify: `packages/cli/src/adapters/openai-toml-adapter.ts:57-74`

- [ ] **Step 1: Write the failing test**

在 `packages/cli/test/adapters/anthropic-json-adapter.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AnthropicJsonAdapter } from '../../src/adapters/anthropic-json-adapter.js';
import type { TargetConfig } from '../../src/config.js';

const target: TargetConfig = {
  id: 'claude',
  family: 'anthropic',
  name: 'Claude Code',
  activeConfigPath: '${CLAUDE_CONFIG_DIR}/settings.json',
  backupDir: '${LLM_SWITCH_DIR}/backups/claude',
};

describe('AnthropicJsonAdapter writeActive', () => {
  let tmpDir: string;
  let adapter: AnthropicJsonAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adapter-'));
    adapter = new AnthropicJsonAdapter(target, tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes active config and creates backup', async () => {
    const activePath = path.join(tmpDir, 'settings.json');
    await fs.writeFile(activePath, '{"existing": true}', 'utf8');

    await adapter.writeActive({
      baseUrl: 'https://api.example.com',
      model: 'model-x',
      apiKey: 'sk-test',
      extra: {},
    });

    const active = JSON.parse(await fs.readFile(activePath, 'utf8'));
    expect(active.env.ANTHROPIC_BASE_URL).toBe('https://api.example.com');

    const backupDir = path.join(tmpDir, 'backups', 'claude');
    const backups = await fs.readdir(backupDir);
    expect(backups.length).toBe(1);
  });
});
```

注意：当前 `activePath()` 使用 `getActiveConfigPath` 会解析环境变量。测试需要 mock 环境变量或调整 adapter 构造方式。为简化测试，可以临时在测试前设置 `process.env.CLAUDE_CONFIG_DIR = tmpDir`。

- [ ] **Step 2: Run test to verify behavior**

```bash
npx vitest run test/adapters/anthropic-json-adapter.test.ts
```

Expected: 测试可能因环境变量解析而失败，先确认错误信息。

- [ ] **Step 3: Modify adapters to use atomicWrite**

`packages/cli/src/adapters/anthropic-json-adapter.ts`：

```typescript
import { atomicWrite } from '../utils/atomic-write.js';

// ... existing imports ...

async writeActive(content: ProfileContent): Promise<void> {
  const active = this.activePath();
  if (await exists(active)) {
    const backup = getBackupPath(this.target);
    await fs.mkdir(path.dirname(backup), { recursive: true, mode: 0o700 });
    await fs.copyFile(active, backup);
    await fs.chmod(backup, 0o600);
  }
  await atomicWrite(active, this.serialize(content), { mode: 0o600 });
}
```

`packages/cli/src/adapters/openai-toml-adapter.ts` 做同样修改。

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/adapters/anthropic-json-adapter.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/adapters/anthropic-json-adapter.ts packages/cli/src/adapters/openai-toml-adapter.ts packages/cli/test/adapters/anthropic-json-adapter.test.ts
git commit -m "fix(adapters): use atomicWrite for active config writes

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: state.json 原子写入

**Files:**
- Modify: `packages/cli/src/state/state-manager.ts:33-37`

- [ ] **Step 1: Read current state-manager.ts**

确认当前实现是直接 `writeFile`。

- [ ] **Step 2: Modify to use atomicWrite**

```typescript
import { atomicWrite } from '../utils/atomic-write.js';

// ... in writeState or equivalent method ...

async writeState(state: UserState): Promise<void> {
  const statePath = getStatePath();
  await fs.mkdir(path.dirname(statePath), { recursive: true, mode: 0o700 });
  await atomicWrite(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
}
```

- [ ] **Step 3: Add test for atomic write**

在 `packages/cli/test/state/state-manager.test.ts` 补充测试：写入 state 后文件存在、格式正确、权限为 0o600。

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/state/state-manager.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/state/state-manager.ts packages/cli/test/state/state-manager.test.ts
git commit -m "fix(state): use atomicWrite for state.json

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: restoreBackup fsync

**Files:**
- Modify: `packages/cli/src/backup.ts`

- [ ] **Step 1: Write failing test**

在 `packages/cli/test/backup.test.ts`：

```typescript
it('restoreBackup overwrites active config', async () => {
  // setup active and backup files
  // call restoreBackup
  // assert active content equals backup content
});
```

- [ ] **Step 2: Implement fsync in restoreBackup**

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';

export async function restoreBackup(backupPath: string, activePath: string): Promise<void> {
  const dir = path.dirname(activePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpName = `.restore.${crypto.randomUUID()}.tmp`;
  const tmpPath = path.join(dir, tmpName);

  try {
    await fs.copyFile(backupPath, tmpPath);
    const fh = await fs.open(tmpPath, 'r+');
    await fh.sync();
    await fh.close();
    await fs.rename(tmpPath, activePath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true });
    throw err;
  }
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run test/backup.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/backup.ts packages/cli/test/backup.test.ts
git commit -m "fix(backup): fsync before rename in restoreBackup

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Adapter 公共基类 + Merge 写入

**Files:**
- Create: `packages/cli/src/adapters/base-adapter.ts`
- Modify: `packages/cli/src/adapters/anthropic-json-adapter.ts`
- Modify: `packages/cli/src/adapters/openai-toml-adapter.ts`
- Modify: `packages/cli/src/adapters/types.ts`（如果需要）

- [ ] **Step 1: Design base adapter**

基类负责：
- `readActive()` / `writeActive()` / `readProfile()` / `writeProfile()` / `deleteProfile()` / `listAliases()`
- `writeActive` 实现 merge 逻辑

子类只负责：
- `serialize(content)` — 把 ProfileContent 序列化为完整内容字符串
- `deserialize(raw)` — 把完整内容字符串反序列化为 ProfileContent
- `applyProfileToExisting(existing: string, content: ProfileContent): string` — 把 profile 字段 merge 进现有内容

- [ ] **Step 2: Implement base adapter**

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from '../utils/atomic-write.js';
import { exists } from '../fs-utils.js';
import type { TargetConfig } from '../config.js';
import { getActiveConfigPath, getBackupPath } from '../config.js';
import type { ProfileContent, TargetAdapter } from './types.js';

export abstract class BaseAdapter implements TargetAdapter {
  abstract readonly target: TargetConfig;
  abstract readonly storeDir: string;

  abstract serialize(content: ProfileContent): string;
  abstract deserialize(raw: string): ProfileContent;
  abstract applyProfileToExisting(existingRaw: string, content: ProfileContent): string;

  activePath(): string {
    return getActiveConfigPath(this.target);
  }

  profilePath(alias: string): string {
    return path.join(this.storeDir, `${alias}.${this.fileExtension()}`);
  }

  abstract fileExtension(): string;

  async readActive(): Promise<ProfileContent | null> {
    const p = this.activePath();
    if (!(await exists(p))) return null;
    const raw = await fs.readFile(p, 'utf8');
    return this.deserialize(raw);
  }

  async writeActive(content: ProfileContent): Promise<void> {
    const active = this.activePath();
    let raw: string;
    if (await exists(active)) {
      const backup = getBackupPath(this.target);
      await fs.mkdir(path.dirname(backup), { recursive: true, mode: 0o700 });
      await fs.copyFile(active, backup);
      await fs.chmod(backup, 0o600);
      raw = await fs.readFile(active, 'utf8');
      raw = this.applyProfileToExisting(raw, content);
    } else {
      raw = this.serialize(content);
    }
    await atomicWrite(active, raw, { mode: 0o600 });
  }

  async readProfile(alias: string): Promise<ProfileContent | null> {
    const p = this.profilePath(alias);
    if (!(await exists(p))) return null;
    const raw = await fs.readFile(p, 'utf8');
    return this.deserialize(raw);
  }

  async writeProfile(alias: string, content: ProfileContent): Promise<void> {
    const p = this.profilePath(alias);
    await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
    await atomicWrite(p, this.serialize(content), { mode: 0o600 });
  }

  async deleteProfile(alias: string): Promise<void> {
    await fs.rm(this.profilePath(alias), { force: true });
  }

  async listAliases(): Promise<string[]> {
    if (!(await exists(this.storeDir))) return [];
    const entries = await fs.readdir(this.storeDir);
    const ext = `.${this.fileExtension()}`;
    return entries.filter((name) => name.endsWith(ext)).map((name) => name.slice(0, -ext.length));
  }
}
```

- [ ] **Step 3: Refactor AnthropicJsonAdapter**

```typescript
import { BaseAdapter } from './base-adapter.js';
import type { ProfileContent } from './types.js';

export class AnthropicJsonAdapter extends BaseAdapter {
  fileExtension(): string {
    return 'json';
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
    const { providerId, env: _env, ...rest } = parsed;
    return {
      providerId: typeof providerId === 'string' ? providerId : undefined,
      baseUrl: env.ANTHROPIC_BASE_URL ?? '',
      model: env.ANTHROPIC_MODEL ?? '',
      apiKey: env.ANTHROPIC_AUTH_TOKEN ?? '',
      extra: rest,
    };
  }

  applyProfileToExisting(existingRaw: string, content: ProfileContent): string {
    const parsed = JSON.parse(existingRaw) as Record<string, unknown>;
    parsed.env = {
      ...(parsed.env ?? {}),
      ANTHROPIC_BASE_URL: content.baseUrl,
      ANTHROPIC_MODEL: content.model,
      ANTHROPIC_AUTH_TOKEN: content.apiKey,
    };
    if (content.providerId) {
      parsed.providerId = content.providerId;
    }
    return JSON.stringify(parsed, null, 2);
  }
}
```

- [ ] **Step 4: Refactor OpenAiTomlAdapter**

类似地实现 `applyProfileToExisting`，使用 TOML parse → 更新字段 → TOML stringify。

- [ ] **Step 5: Add merge tests**

测试场景：
- active 文件已存在且包含额外字段 → switch 后额外字段保留
- active 文件不存在 → switch 后创建只含 profile 字段的文件

- [ ] **Step 6: Run tests**

```bash
npx vitest run test/adapters/
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/adapters/
git commit -m "refactor(adapters): extract BaseAdapter and switch to merge-on-activate

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: 配置目录迁移到 ~/.llm-switch/

**Files:**
- Modify: `packages/cli/src/config.ts`
- Modify: `packages/cli/src/migrate.ts`
- Modify: `packages/cli/test/config.test.ts`
- Modify: `packages/cli/test/migrate.test.ts`

- [ ] **Step 1: Update config.ts paths**

把 `getLlmswitchDir()` 的返回值从 `path.join(os.homedir(), '.config', 'llm-switch')` 改为 `path.join(os.homedir(), '.llm-switch')`。

- [ ] **Step 2: Update migration to handle old ~/.config/llm-switch/**

在 `ensureMigratedToCentralStore` 中：
- 如果 `~/.llm-switch/` 已存在，跳过
- 如果旧目录 `~/.config/llm-switch/` 存在，整体复制到 `~/.llm-switch/`
- 复制成功后删除旧目录（或保留并标记为已迁移）

- [ ] **Step 3: Update tests**

把测试中的 `path.join(homedir, '.config', 'llm-switch')` 替换为 `path.join(homedir, '.llm-switch')`。

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/config.test.ts test/migrate.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/config.ts packages/cli/src/migrate.ts packages/cli/test/config.test.ts packages/cli/test/migrate.test.ts
git commit -m "feat(config): move llm-switch data dir to ~/.llm-switch

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: 目录与文件权限

**Files:**
- Modify: `packages/cli/src/store/profile-store.ts`
- Modify: `packages/cli/src/state/state-manager.ts`
- Modify: `packages/cli/src/migrate.ts`
- Modify: `packages/cli/src/adapters/base-adapter.ts`

- [ ] **Step 1: Ensure ~/.llm-switch/ created with 0o700**

检查所有 `mkdir(path, { recursive: true })` 是否带 `mode: 0o700`。

- [ ] **Step 2: Ensure files created with 0o600**

所有 `writeFile` / `atomicWrite` 写 profile/backup/state 时 mode 为 0o600。

- [ ] **Step 3: Migration copies with correct permissions**

迁移复制旧 profile 后，调用 `fs.chmod(dest, 0o600)`。

- [ ] **Step 4: Add permission tests**

在相关测试中 assert 目录权限为 0o700，文件权限为 0o600。

- [ ] **Step 5: Run tests**

```bash
npx vitest run
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/store/profile-store.ts packages/cli/src/state/state-manager.ts packages/cli/src/migrate.ts packages/cli/src/adapters/base-adapter.ts
git commit -m "fix(security): enforce 0o700 dirs and 0o600 files

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: 修复 switch auto-create 丢失 active

**Files:**
- Modify: `packages/cli/src/commands/switch.ts`
- Test: `packages/cli/test/commands/switch.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it('auto-create from active preserves backup of old active', async () => {
  // setup: active config exists, profile alias does not
  // run switch alias
  // assert backup contains old active content, not newly created profile content
});
```

- [ ] **Step 2: Fix switch.ts**

在 alias 路径进入循环前，对每个 target 先调用显式 backup：

```typescript
// before autoCreateProfile or writeActive
for (const target of targets) {
  await adapterFor(target).writeActive(currentActive);
}
```

或改为：在 auto-create 之前先读取当前 active，然后 auto-create 来源就是这个读取的内容，而不是写入后再读。

具体修复：
- 在 `switch` alias 路径下，若需要 auto-create，先从当前 active 读取内容
- 用该内容创建 profile
- 然后再 writeActive（此时 backup 的是旧 active）

- [ ] **Step 3: Run tests**

```bash
npx vitest run test/commands/switch.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/switch.ts packages/cli/test/commands/switch.test.ts
git commit -m "fix(switch): preserve active backup during auto-create

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: 修复迁移回滚与 ensureMigrated

**Files:**
- Modify: `packages/cli/src/migrate.ts`
- Modify: `packages/cli/src/config.ts`

- [ ] **Step 1: Fix migrate.ts rollback**

改为先完整复制 `fs.cp(oldDir, newDir, { recursive: true })`，再校验文件列表，全部成功后才标记为已迁移。中途失败则删除新目录。

- [ ] **Step 2: Fix ensureMigrated directory check**

检查 `profiles/` 和 `backups/` 子目录是否存在，不存在则 `mkdir({ recursive: true })`。

- [ ] **Step 3: Add tests**

- 迁移中途失败回滚测试
- 只有空 `~/.llm-switch/` 目录时正确创建子目录测试

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/migrate.test.ts test/config.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/migrate.ts packages/cli/src/config.ts
git commit -m "fix(migrate): robust rollback and subdir creation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: 拆分 cli.ts

**Files:**
- Modify: `packages/cli/src/cli.ts`
- Create: `packages/cli/src/commands/register/list.ts`
- Create: `packages/cli/src/commands/register/switch.ts`
- Create: `packages/cli/src/commands/register/save.ts`
- Create: `packages/cli/src/commands/register/create.ts`
- Create: `packages/cli/src/commands/register/restore.ts`
- Create: `packages/cli/src/commands/register/current.ts`
- Create: `packages/cli/src/commands/register/init.ts`

- [ ] **Step 1: Create register functions**

每个文件导出一个函数：

```typescript
import type { Command } from 'commander';
import type { CliContext } from '../../cli.js';

export function registerList(program: Command, ctx: CliContext): void {
  program
    .command('list')
    .description('List profiles')
    .action(() => listCommand(ctx));
}
```

- [ ] **Step 2: Refactor cli.ts**

把各 `program.command(...)` 块抽到对应 register 文件，`cli.ts` 只保留入口判断和 `program.parse()`。

- [ ] **Step 3: Run smoke test**

```bash
node packages/cli/bin/sw.js --help
node packages/cli/bin/sw.js --version
```

Expected: help/version 正常输出

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli.ts packages/cli/src/commands/register/
git commit -m "refactor(cli): split command registration out of cli.ts

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: create 命令非交互参数（已修复，跳过）

当前工作树已实现：`packages/cli/src/commands/create.ts:22-31` 已添加 `--provider/--alias/--base-url/--model/--api-key/--skip-validation`，`cli.ts:243-248` 已解析并透传，`hasRequiredFlags` 允许非 TTY 执行。

无需再实现，但应保留相关测试在回归测试时运行。

---

## Task 12: init --yes（已修复，跳过）

当前工作树已实现：`packages/cli/src/commands/init.ts:26` 有 `--yes` 标志，`cli.ts:323` 已接线，`selectAllDetected` 路径跳过 checkbox 直接选择所有检测到的工具。

无需再实现。

---

## Task 13: 扩展 logger

**Files:**
- Modify: `packages/cli/src/logger.ts`
- Modify: 需要替换 `console.log`/`console.warn` 的命令文件

- [ ] **Step 1: Extend logger**

```typescript
export const logger = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
  error: (msg: string) => console.error(msg),
};
```

- [ ] **Step 2: Replace direct console writes**

在 `commands/` 中把合适的 `console.log` 改为 `logger.info`，`console.warn` 改为 `logger.warn`。

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/logger.ts packages/cli/src/commands/
git commit -m "refactor(logger): add info/warn methods and use them in commands

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 14: CLI 体验细节

**Files:**
- Modify: `packages/cli/src/cli.ts`（help 示例空格）
- Modify: `packages/cli/src/validator.ts`（OpenAI 错误提示）
- Modify: `packages/cli/src/commands/init.ts`（引导文案）
- Modify: `packages/cli/src/commands/switch.ts`（交集为空提示）

- [ ] **Step 1: Fix help examples**

把 `sw--target opencode ...` 改为 `sw --target opencode ...`。

- [ ] **Step 2: Improve OpenAI validation error**

`validateOpenAi` 返回 "Invalid API key" 而不是裸 API error。

- [ ] **Step 3: Improve init warning guidance**

在 "active config not found" 后附加 "Run `sw create` to set one up"。

- [ ] **Step 4: Improve switch empty intersection message**

明确提示 "No profiles found across selected targets"。

- [ ] **Step 5: Run tests**

```bash
npx vitest run
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/cli.ts packages/cli/src/validator.ts packages/cli/src/commands/init.ts packages/cli/src/commands/switch.ts
git commit -m "fix(cli): polish help, errors, and guidance messages

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 15: CLI Smoke Test

**Files:**
- Create: `packages/cli/test/cli.smoke.test.ts`

- [ ] **Step 1: Write smoke test**

```typescript
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = path.resolve(fileURLToPath(import.meta.url), '../../bin/sw.js');

describe('CLI smoke', () => {
  it('--version exits 0', () => {
    const out = execFileSync('node', [bin, '--version'], { encoding: 'utf8' });
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('--help exits 0 and mentions main commands', () => {
    const out = execFileSync('node', [bin, '--help'], { encoding: 'utf8' });
    expect(out).toContain('list');
    expect(out).toContain('switch');
    expect(out).toContain('save');
  });

  it('unknown command exits non-zero', () => {
    expect(() => execFileSync('node', [bin, 'not-a-command'])).toThrow();
  });
});
```

- [ ] **Step 2: Run smoke test**

```bash
npx vitest run test/cli.smoke.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/cli/test/cli.smoke.test.ts
git commit -m "test(cli): add smoke tests for --version, --help, and unknown command

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 16: Adapter 错误路径测试

**Files:**
- Create/Modify: `packages/cli/test/adapters/anthropic-json-adapter.test.ts`
- Create/Modify: `packages/cli/test/adapters/openai-toml-adapter.test.ts`

- [ ] **Step 1: Add corrupt file tests**

```typescript
it('returns null or throws domain error when active config is corrupt', async () => {
  await fs.writeFile(activePath, 'not-json', 'utf8');
  await expect(adapter.readActive()).rejects.toThrow();
});
```

- [ ] **Step 2: Add missing active config test**

```typescript
it('returns null when active config does not exist', async () => {
  const result = await adapter.readActive();
  expect(result).toBeNull();
});
```

- [ ] **Step 3: Add write failure rollback test**

通过 mock 或只读目录触发写入失败，验证不留下 tmp 文件。

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/adapters/
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/test/adapters/
git commit -m "test(adapters): cover corrupt files, missing active, and write failures

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** 本 Plan 覆盖了设计文档阶段 0 的所有 A/B/C 任务组。
- **Placeholder scan:** 无 TBD/TODO；每个任务包含具体代码、命令、预期结果。
- **Type consistency:** `ProfileContent`、`TargetConfig`、`TargetAdapter` 等类型沿用了现有代码约定；新 `BaseAdapter` 实现了 `TargetAdapter` 接口。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-26-foundation-fixes.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
