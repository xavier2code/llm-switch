# `create` 子命令实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `llm-switch` 新增交互式 `create` 子命令：选 provider（5 个内置）→ 输入/确认 alias → 确认/覆盖默认 BASE_URL 与模型 → 输入 API key → 真实 API 调用验证 → 写 `settings.json.<alias>` → 原子激活为当前 `settings.json`。

**Architecture:** 三层新增：`providers.ts`（数据）/ `validator.ts`（Anthropic 协议 ping）/ `commands/create.ts`（交互编排）。复用 `switcher.switchTo` 做原子切换。失败有 4 选项子菜单（重试 / 换 key / 改 URL 或模型 / 取消）。复用 `@inquirer/prompts` 的 `select` / `input` / `password` / `confirm`。`CreateIO` 注入 prompt 与 validator 函数方便测试。

**Tech Stack:** TypeScript · `@inquirer/prompts` ^7 · Node 20 内置 `fetch` + `AbortController` · vitest `vi.mock` · tsup ESM

---

## 文件结构

```
packages/cli/
├── src/
│   ├── providers.ts                   # NEW: 5 个 provider 注册表 + getProvider
│   ├── validator.ts                   # NEW: validateAnthropic + ValidationError
│   ├── errors.ts                      # 改: 增加 ValidationError
│   ├── cli.ts                         # 改: 注册 create 子命令
│   └── commands/
│       └── create.ts                  # NEW: 交互流程
├── test/
│   ├── providers.test.ts              # NEW
│   ├── validator.test.ts              # NEW（mock fetch）
│   ├── errors.test.ts                 # 改: 加入 ValidationError 断言
│   ├── cli.test.ts                    # 改: 加 create --help + 非 TTY e2e
│   └── commands/
│       └── create.test.ts             # NEW（mock @inquirer/prompts + 注入 validateFn）
├── package.json                       # 改: version 0.2.0 → 0.3.0
├── CHANGELOG.md                       # 改: 加 [0.3.0] 段
└── README.md                          # 改: 加 create 使用说明
```

每个 src 文件单一职责；测试与源码一一对应。

**注意：实施前先核实 `providers.ts` 默认 BASE_URL / 模型名（见 spec §「默认 provider 值核实」）。**

---

## Task 1: 添加 `ValidationError` 错误类

**Files:**
- Modify: `packages/cli/src/errors.ts`
- Modify: `packages/cli/test/errors.test.ts`

- [ ] **Step 1: 写失败的测试**

编辑 `packages/cli/test/errors.test.ts`，在文件末尾追加：

```typescript
import { ValidationError } from '../src/errors.js';

describe('ValidationError', () => {
  it('extends AppError with code VALIDATION_FAILED', () => {
    const cause = new Error('underlying');
    const err = new ValidationError('Invalid API key (401).', cause);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.message).toBe('Invalid API key (401).');
    expect(err.cause).toBe(cause);
  });

  it('cause is optional', () => {
    const err = new ValidationError('boom');
    expect(err.cause).toBeUndefined();
  });
});
```

并在文件顶部 import 区追加 `ValidationError`（已有 `AppError` 等 import 旁边）。

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- errors.test.ts
```

预期：FAIL，`SyntaxError: The requested module '../src/errors.js' does not provide an export named 'ValidationError'`。

- [ ] **Step 3: 实现**

编辑 `packages/cli/src/errors.ts`，在 `InvalidAliasError` 类之后追加：

```typescript
export class ValidationError extends AppError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message, 'VALIDATION_FAILED');
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- errors.test.ts
```

预期：所有 `errors.test.ts` 用例 PASS。

- [ ] **Step 5: 提交**

```bash
cd /Users/xavier/Projects/Github/llm-switch
git add packages/cli/src/errors.ts packages/cli/test/errors.test.ts
git commit -m "feat(cli): add ValidationError class for API ping failures"
```

---

## Task 2: Provider 注册表

**Files:**
- Create: `packages/cli/src/providers.ts`
- Create: `packages/cli/test/providers.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `packages/cli/test/providers.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { PROVIDERS, getProvider } from '../src/providers.js';
import { AppError } from '../src/errors.js';

describe('PROVIDERS', () => {
  it('contains exactly 5 providers', () => {
    expect(PROVIDERS).toHaveLength(5);
  });

  it('all ids are unique and match expected set', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(['deepseek', 'glm', 'kimi', 'minimax', 'qwen']);
  });

  it('every provider has non-empty displayName, baseUrl, defaultModel', () => {
    for (const p of PROVIDERS) {
      expect(p.displayName.length).toBeGreaterThan(0);
      expect(p.baseUrl).toMatch(/^https?:\/\//);
      expect(p.defaultModel.length).toBeGreaterThan(0);
    }
  });
});

describe('getProvider', () => {
  it('returns matching provider for known id', () => {
    const glm = getProvider('glm');
    expect(glm.id).toBe('glm');
    expect(glm.displayName).toContain('GLM');
  });

  it('throws AppError for unknown id', () => {
    // @ts-expect-error testing runtime guard against invalid ids
    expect(() => getProvider('nope')).toThrow(AppError);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- providers.test.ts
```

预期：FAIL，`Cannot find module '../src/providers.js'`。

- [ ] **Step 3: 实现**

创建 `packages/cli/src/providers.ts`。**注意**：先按 spec §「默认 provider 值核实」核对 BASE_URL 与模型名，不对就调整。

```typescript
export type ProviderId = 'glm' | 'deepseek' | 'kimi' | 'minimax' | 'qwen';

export interface Provider {
  id: ProviderId;
  displayName: string;
  baseUrl: string;
  defaultModel: string;
}

export const PROVIDERS: readonly Provider[] = [
  { id: 'glm',      displayName: 'GLM (智谱)',      baseUrl: 'https://open.bigmodel.cn/api/anthropic',                 defaultModel: 'glm-4.5' },
  { id: 'deepseek', displayName: 'DeepSeek',         baseUrl: 'https://api.deepseek.com/anthropic',                     defaultModel: 'deepseek-chat' },
  { id: 'kimi',     displayName: 'Kimi (Moonshot)',  baseUrl: 'https://api.moonshot.cn/anthropic',                      defaultModel: 'moonshot-v1-8k' },
  { id: 'minimax',  displayName: 'MiniMax',          baseUrl: 'https://api.minimaxi.com/anthropic',                    defaultModel: 'MiniMax-Text-01' },
  { id: 'qwen',     displayName: 'Qwen (DashScope)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/anthropic', defaultModel: 'qwen-plus' },
];

const BY_ID: Record<ProviderId, Provider> = (() => {
  const map = {} as Record<ProviderId, Provider>;
  for (const p of PROVIDERS) map[p.id] = p;
  return map;
})();

export function getProvider(id: ProviderId): Provider {
  const p = BY_ID[id];
  if (!p) {
    throw new AppError(`Unknown provider '${id}'`, 'UNKNOWN_PROVIDER');
  }
  return p;
}
```

并在文件顶部追加 import：

```typescript
import { AppError } from './errors.js';
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- providers.test.ts
```

预期：5 个 `PROVIDERS` 用例 + 2 个 `getProvider` 用例 PASS。

- [ ] **Step 5: 类型检查**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm typecheck
```

预期：无错误。

- [ ] **Step 6: 提交**

```bash
cd /Users/xavier/Projects/Github/llm-switch
git add packages/cli/src/providers.ts packages/cli/test/providers.test.ts
git commit -m "feat(cli): add provider registry with 5 built-in providers"
```

---

## Task 3: Validator（Anthropic 协议 ping）

**Files:**
- Create: `packages/cli/src/validator.ts`
- Create: `packages/cli/test/validator.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `packages/cli/test/validator.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateAnthropic } from '../src/validator.js';
import { ValidationError } from '../src/errors.js';

type FetchResp = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

function makeResponse(opts: { status: number; body?: string }): FetchResp {
  return {
    ok: opts.status >= 200 && opts.status < 300,
    status: opts.status,
    text: async () => opts.body ?? '',
  };
}

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('validateAnthropic', () => {
  it('returns on 2xx response', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 200 }));
    await expect(
      validateAnthropic('https://x.example.com', 'm', 'key'),
    ).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('POSTs to {baseUrl}/v1/messages with Anthropic headers and minimal body', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 200 }));
    await validateAnthropic('https://x.example.com/', 'glm-4.5', 'sk-abc');

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://x.example.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'x-api-key': 'sk-abc',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    });
    const body = JSON.parse(init.body);
    expect(body.model).toBe('glm-4.5');
    expect(body.max_tokens).toBe(1);
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }]);
  });

  it('throws ValidationError with 401 on unauthorized', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 401, body: 'bad key' }));
    await expect(validateAnthropic('https://x', 'm', 'k')).rejects.toThrowError(
      /Invalid API key \(401\)/,
    );
    await expect(validateAnthropic('https://x', 'm', 'k')).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError with 403 on forbidden', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 403 }));
    await expect(validateAnthropic('https://x', 'm', 'k')).rejects.toThrowError(/403/);
  });

  it('throws ValidationError with status and body on 5xx', async () => {
    const bodyText = 'X'.repeat(250);
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 500, body: bodyText }));
    await expect(validateAnthropic('https://x', 'm', 'k')).rejects.toThrowError(
      /Provider rejected request \(500\)/,
    );
    // body is truncated to 200 chars
    await expect(validateAnthropic('https://x', 'm', 'k')).rejects.toThrowError(
      new RegExp('X{200}'),
    );
  });

  it('throws ValidationError with timed out on AbortError', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    mockFetch.mockRejectedValueOnce(abortErr);
    await expect(
      validateAnthropic('https://x', 'm', 'k', { timeoutMs: 50 }),
    ).rejects.toThrowError(/timed out after 50ms/);
  });

  it('throws ValidationError with Network error on generic fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ENOTFOUND'));
    await expect(validateAnthropic('https://x', 'm', 'k')).rejects.toThrowError(
      /Network error.*ENOTFOUND/,
    );
  });

  it('passes AbortSignal to fetch', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 200 }));
    await validateAnthropic('https://x', 'm', 'k', { timeoutMs: 5000 });
    const init = mockFetch.mock.calls[0]?.[1] as { signal?: AbortSignal };
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- validator.test.ts
```

预期：FAIL，`Cannot find module '../src/validator.js'`。

- [ ] **Step 3: 实现**

创建 `packages/cli/src/validator.ts`：

```typescript
import { ValidationError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const BODY_SNIPPET_LEN = 200;

export interface ValidateOptions {
  timeoutMs?: number;
}

export async function validateAnthropic(
  baseUrl: string,
  model: string,
  apiKey: string,
  opts?: ValidateOptions,
): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`;
  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      throw new ValidationError(`Invalid API key (${res.status}).`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const snippet = text.slice(0, BODY_SNIPPET_LEN);
      throw new ValidationError(
        `Provider rejected request (${res.status}): ${snippet}`,
      );
    }
  } catch (err: unknown) {
    if (err instanceof ValidationError) throw err;
    const name = (err as { name?: string } | null)?.name;
    if (name === 'AbortError') {
      throw new ValidationError(`Validation timed out after ${timeoutMs}ms.`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new ValidationError(`Network error: ${msg}`, err);
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- validator.test.ts
```

预期：所有 8 个 `validateAnthropic` 用例 PASS。

- [ ] **Step 5: 类型检查**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm typecheck
```

预期：无错误。

- [ ] **Step 6: 提交**

```bash
cd /Users/xavier/Projects/Github/llm-switch
git add packages/cli/src/validator.ts packages/cli/test/validator.test.ts
git commit -m "feat(cli): add Anthropic protocol ping validator"
```

---

## Task 4: create 命令 - 骨架与 TTY 检查

**Files:**
- Create: `packages/cli/src/commands/create.ts`
- Create: `packages/cli/test/commands/create.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `packages/cli/test/commands/create.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';

const CANCEL = Symbol('cancel');

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
}));

import { select, input, password, confirm } from '@inquirer/prompts';
import { run } from '../../src/commands/create.js';
import { UserCancelledError } from '../../src/errors.js';

const mockSelect = vi.mocked(select);
const mockInput = vi.mocked(input);
const mockPassword = vi.mocked(password);
const mockConfirm = vi.mocked(confirm);

let tmpDir: string;
let savedEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

function mockIO() {
  const writes: string[] = [];
  return {
    writes,
    stdin: Readable.from(['']),
    stdout: { write: (s: string) => writes.push(s) },
    stderr: { write: (s: string) => writes.push(s) },
  };
}

describe('create command', () => {
  it('throws UserCancelledError when not TTY', async () => {
    const io = { ...mockIO(), isTTY: false };
    await expect(run(io as never)).rejects.toBeInstanceOf(UserCancelledError);
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- commands/create.test.ts
```

预期：FAIL，`Cannot find module '../../src/commands/create.js'`。

- [ ] **Step 3: 实现骨架**

创建 `packages/cli/src/commands/create.ts`：

```typescript
import type { Readable, Writable } from 'node:stream';
import { select, input, password, confirm, isCancel } from '@inquirer/prompts';
import {
  getSettingsPath,
  getBackupPath,
  profilePath,
} from '../config.js';
import { switchTo } from '../switcher.js';
import { PROVIDERS, getProvider, type ProviderId } from '../providers.js';
import { validateAnthropic } from '../validator.js';
import { UserCancelledError } from '../errors.js';

export interface CreateIO {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  selectFn?: typeof select;
  inputFn?: typeof input;
  passwordFn?: typeof password;
  confirmFn?: typeof confirm;
  validateFn?: typeof validateAnthropic;
}

export async function run(io: CreateIO): Promise<void> {
  if (!io.isTTY) {
    throw new UserCancelledError(
      'Interactive mode requires a TTY. Use: llm-switch <alias>',
    );
  }
  // 实现将在后续步骤补全
  void io;
  void select;
  void input;
  void password;
  void confirm;
  void isCancel;
  void PROVIDERS;
  void getProvider;
  void switchTo;
  void getSettingsPath;
  void getBackupPath;
  void profilePath;
  void validateAnthropic;
}
```

`void x` 是为了在骨架阶段让 TypeScript 不报 unused 错误；后续步骤会逐步替换。

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- commands/create.test.ts
```

预期：1 个用例 PASS。

- [ ] **Step 5: 类型检查**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm typecheck
```

预期：无错误。

- [ ] **Step 6: 提交**

```bash
cd /Users/xavier/Projects/Github/llm-switch
git add packages/cli/src/commands/create.ts packages/cli/test/commands/create.test.ts
git commit -m "feat(cli): scaffold create command with TTY check"
```

---

## Task 5: create 命令 - 选 provider + 输入 alias

**Files:**
- Modify: `packages/cli/src/commands/create.ts`
- Modify: `packages/cli/test/commands/create.test.ts`

- [ ] **Step 1: 添加失败的测试**

编辑 `packages/cli/test/commands/create.test.ts`，在 `describe` 内追加：

```typescript
  it('throws UserCancelledError when provider select cancelled', async () => {
    mockSelect.mockResolvedValueOnce(CANCEL as never);
    const io = { ...mockIO(), isTTY: true };
    await expect(run(io as never)).rejects.toBeInstanceOf(UserCancelledError);
  });

  it('throws UserCancelledError when alias input cancelled', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce(CANCEL as never);
    const io = { ...mockIO(), isTTY: true };
    await expect(run(io as never)).rejects.toBeInstanceOf(UserCancelledError);
  });

  it('alias input uses provider id as default', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const call = mockInput.mock.calls[0]?.[0] as { default?: string };
    expect(call.default).toBe('glm');
  });

  it('alias input validate rejects empty', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const call = mockInput.mock.calls[0]?.[0] as { validate?: (v: string) => boolean | string };
    expect(call.validate!('')).toBe('Required');
    expect(call.validate!('   ')).toBe('Required');
  });

  it('alias input validate rejects invalid format', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const call = mockInput.mock.calls[0]?.[0] as { validate?: (v: string) => boolean | string };
    expect(call.validate!('BAD!')).toMatch(/Invalid alias/);
    expect(call.validate!('GLM')).toMatch(/Invalid alias/);
  });

  it('alias input validate accepts valid alias', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const call = mockInput.mock.calls[0]?.[0] as { validate?: (v: string) => boolean | string };
    expect(call.validate!('glm')).toBe(true);
    expect(call.validate!('glm-v2')).toBe(true);
  });

  it('provider select presents 5 choices with displayName', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const call = mockSelect.mock.calls[0]?.[0] as { choices?: Array<{ name: string; value: string }> };
    expect(call.choices).toHaveLength(5);
    const ids = call.choices!.map((c) => c.value).sort();
    expect(ids).toEqual(['deepseek', 'glm', 'kimi', 'minimax', 'qwen']);
    expect(call.choices!.find((c) => c.value === 'glm')?.name).toContain('GLM');
  });
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- commands/create.test.ts
```

预期：新增的 7 个用例 FAIL（因为骨架里的 `void` 占位不会调用任何 prompt）。

- [ ] **Step 3: 实现**

**完全重写** `packages/cli/src/commands/create.ts`（替换 Task 4 的骨架）：

```typescript
import type { Readable, Writable } from 'node:stream';
import { select, input, password, confirm, isCancel } from '@inquirer/prompts';
import { getSettingsPath, getBackupPath, profilePath } from '../config.js';
import { switchTo } from '../switcher.js';
import { PROVIDERS, getProvider, type ProviderId } from '../providers.js';
import { validateAnthropic } from '../validator.js';
import { UserCancelledError } from '../errors.js';
import { validateAlias } from '../config.js';

export interface CreateIO {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  selectFn?: typeof select;
  inputFn?: typeof input;
  passwordFn?: typeof password;
  confirmFn?: typeof confirm;
  validateFn?: typeof validateAnthropic;
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new UserCancelledError(message);
}

export async function run(io: CreateIO): Promise<void> {
  if (!io.isTTY) {
    throw new UserCancelledError(
      'Interactive mode requires a TTY. Use: llm-switch <alias>',
    );
  }

  const sFn = io.selectFn ?? select;
  const iFn = io.inputFn ?? input;
  const pFn = io.passwordFn ?? password;
  const cFn = io.confirmFn ?? confirm;
  const vFn = io.validateFn ?? validateAnthropic;

  // 1. Select provider
  const providerChoice = await sFn({
    message: 'Select provider:',
    choices: PROVIDERS.map((p) => ({ name: p.displayName, value: p.id })),
  });
  ensure(!isCancel(providerChoice), 'Cancelled.');
  const provider = getProvider(providerChoice as ProviderId);

  // 2. Alias input
  const aliasInput = await iFn({
    message: 'Alias for this profile:',
    default: provider.id,
    validate: (v: string) => {
      const trimmed = v.trim();
      if (!trimmed) return 'Required';
      const err = validateAlias(trimmed);
      return err ?? true;
    },
  });
  ensure(!isCancel(aliasInput), 'Cancelled.');
  const alias = (aliasInput as string).trim();

  // 后续步骤补全
  void cFn;
  void pFn;
  void vFn;
  void switchTo;
  void getSettingsPath;
  void getBackupPath;
  void profilePath;
  void alias;
  void provider;
}
```

`validateAlias` 在 `config.ts` 已导出（`string | null`）。`getProvider` 与 `provider` 的 `void` 是为了让后续步骤编译过；下一步会替换。

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- commands/create.test.ts
```

预期：新增的 7 个用例 + Task 4 的 1 个 TTY 用例 PASS。

- [ ] **Step 5: 类型检查**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm typecheck
```

预期：无错误。

- [ ] **Step 6: 提交**

```bash
cd /Users/xavier/Projects/Github/llm-switch
git add packages/cli/src/commands/create.ts packages/cli/test/commands/create.test.ts
git commit -m "feat(cli): add provider select and alias input to create command"
```

---

## Task 6: create 命令 - 默认值确认 + 自定义 URL/model

**Files:**
- Modify: `packages/cli/src/commands/create.ts`
- Modify: `packages/cli/test/commands/create.test.ts`

- [ ] **Step 1: 添加失败的测试**

编辑 `packages/cli/test/commands/create.test.ts`，在 `describe` 内追加：

```typescript
  it('confirm shows Use default question with default true', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const call = mockConfirm.mock.calls[0]?.[0] as { message?: string; default?: boolean };
    expect(call.message).toMatch(/Use default/);
    expect(call.default).toBe(true);
  });

  it('when user rejects defaults, prompts for custom BASE_URL then model', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput
      .mockResolvedValueOnce('glm')
      .mockResolvedValueOnce('https://my-proxy.example.com/anthropic')
      .mockResolvedValueOnce('custom-model');
    mockConfirm.mockResolvedValueOnce(false);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    expect(mockInput).toHaveBeenCalledTimes(3);
    const urlCall = mockInput.mock.calls[1]?.[0] as { message?: string };
    expect(urlCall.message).toMatch(/BASE URL/i);
    const modelCall = mockInput.mock.calls[2]?.[0] as { message?: string };
    expect(modelCall.message).toBe('Model:');

    expect(validateFn).toHaveBeenCalledWith(
      'https://my-proxy.example.com/anthropic',
      'custom-model',
      'key',
    );
  });

  it('BASE_URL and model inputs reject empty', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput
      .mockResolvedValueOnce('glm')
      .mockResolvedValueOnce('https://x')
      .mockResolvedValueOnce('m');
    mockConfirm.mockResolvedValueOnce(false);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const urlCall = mockInput.mock.calls[1]?.[0] as { validate?: (v: string) => boolean | string };
    expect(urlCall.validate!('')).toBe('Required');
    const modelCall = mockInput.mock.calls[2]?.[0] as { validate?: (v: string) => boolean | string };
    expect(modelCall.validate!('')).toBe('Required');
  });

  it('when user accepts defaults, validator called with provider default URL and model', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    expect(validateFn).toHaveBeenCalledWith(
      'https://open.bigmodel.cn/api/anthropic',
      'glm-4.5',
      'key',
    );
  });
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- commands/create.test.ts
```

预期：新增 4 个用例 FAIL（骨架里 cFn/pFn/vFn 还是 void）。

- [ ] **Step 3: 实现**

**再次完全重写** `packages/cli/src/commands/create.ts`：

```typescript
import type { Readable, Writable } from 'node:stream';
import { select, input, password, confirm, isCancel } from '@inquirer/prompts';
import { getSettingsPath, getBackupPath, profilePath, validateAlias } from '../config.js';
import { switchTo } from '../switcher.js';
import { PROVIDERS, getProvider, type ProviderId } from '../providers.js';
import { validateAnthropic } from '../validator.js';
import { UserCancelledError } from '../errors.js';

export interface CreateIO {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
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

export async function run(io: CreateIO): Promise<void> {
  if (!io.isTTY) {
    throw new UserCancelledError(
      'Interactive mode requires a TTY. Use: llm-switch <alias>',
    );
  }

  const sFn = io.selectFn ?? select;
  const iFn = io.inputFn ?? input;
  const pFn = io.passwordFn ?? password;
  const cFn = io.confirmFn ?? confirm;
  const vFn = io.validateFn ?? validateAnthropic;

  // 1. Provider
  const providerChoice = await sFn({
    message: 'Select provider:',
    choices: PROVIDERS.map((p) => ({ name: p.displayName, value: p.id })),
  });
  ensure(!isCancel(providerChoice), 'Cancelled.');
  const provider = getProvider(providerChoice as ProviderId);

  // 2. Alias
  const aliasInput = await iFn({
    message: 'Alias for this profile:',
    default: provider.id,
    validate: (v: string) => {
      const trimmed = v.trim();
      if (!trimmed) return 'Required';
      const err = validateAlias(trimmed);
      return err ?? true;
    },
  });
  ensure(!isCancel(aliasInput), 'Cancelled.');
  const alias = (aliasInput as string).trim();

  // 3. Confirm defaults
  let baseUrl = provider.baseUrl;
  let model = provider.defaultModel;
  const useDefaults = await cFn({
    message: 'Use default BASE_URL and model?',
    default: true,
  });
  ensure(!isCancel(useDefaults), 'Cancelled.');
  if (!useDefaults) {
    const urlInput = await iFn({
      message: 'BASE URL:',
      default: provider.baseUrl,
      validate: nonEmpty,
    });
    ensure(!isCancel(urlInput), 'Cancelled.');
    baseUrl = (urlInput as string).trim();

    const modelInput = await iFn({
      message: 'Model:',
      default: provider.defaultModel,
      validate: nonEmpty,
    });
    ensure(!isCancel(modelInput), 'Cancelled.');
    model = (modelInput as string).trim();
  }

  // 后续步骤补全
  void pFn;
  void vFn;
  void switchTo;
  void getSettingsPath;
  void getBackupPath;
  void profilePath;
  void alias;
  void baseUrl;
  void model;
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- commands/create.test.ts
```

预期：所有用例 PASS（之前的 + 新增 4 个）。

- [ ] **Step 5: 类型检查**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm typecheck
```

预期：无错误。

- [ ] **Step 6: 提交**

```bash
cd /Users/xavier/Projects/Github/llm-switch
git add packages/cli/src/commands/create.ts packages/cli/test/commands/create.test.ts
git commit -m "feat(cli): add default confirm and custom URL/model prompts to create"
```

---

## Task 7: create 命令 - API key + 验证 + 失败子菜单

**Files:**
- Modify: `packages/cli/src/commands/create.ts`
- Modify: `packages/cli/test/commands/create.test.ts`

- [ ] **Step 1: 添加失败的测试**

编辑 `packages/cli/test/commands/create.test.ts`，在 `describe` 内追加：

```typescript
import { ValidationError } from '../../src/errors.js';
```

并在 describe 内追加：

```typescript
  it('password input uses mask * and rejects empty', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const call = mockPassword.mock.calls[0]?.[0] as { mask?: string; validate?: (v: string) => boolean | string };
    expect(call.mask).toBe('*');
    expect(call.validate!('')).toBe('Required');
  });

  it('happy path: validate succeeds and flow continues to write', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('sk-test-123');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    expect(validateFn).toHaveBeenCalledWith(
      'https://open.bigmodel.cn/api/anthropic',
      'glm-4.5',
      'sk-test-123',
    );
    // profile written
    const profile = JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json.glm'), 'utf8'));
    expect(profile.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test-123');
  });

  it('validation fails → submenu: Enter a different key → loops password then succeeds', async () => {
    mockSelect
      .mockResolvedValueOnce('glm')     // provider
      .mockResolvedValueOnce('newkey'); // submenu
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword
      .mockResolvedValueOnce('bad-key')
      .mockResolvedValueOnce('good-key');
    const validateFn = vi.fn()
      .mockRejectedValueOnce(new ValidationError('Invalid API key (401).'))
      .mockResolvedValueOnce(undefined);

    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    expect(validateFn).toHaveBeenCalledTimes(2);
    expect(validateFn.mock.calls[0]?.[2]).toBe('bad-key');
    expect(validateFn.mock.calls[1]?.[2]).toBe('good-key');
  });

  it('validation fails → submenu: Cancel → UserCancelledError', async () => {
    mockSelect
      .mockResolvedValueOnce('glm')
      .mockResolvedValueOnce('cancel');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('bad-key');
    const validateFn = vi.fn().mockRejectedValueOnce(new ValidationError('boom'));

    const io = { ...mockIO(), isTTY: true, validateFn };
    await expect(run(io as never)).rejects.toBeInstanceOf(UserCancelledError);
    expect(validateFn).toHaveBeenCalledOnce();
  });

  it('validation fails → submenu: Edit BASE_URL/model → prompts URL+model, re-validates with same key', async () => {
    mockSelect
      .mockResolvedValueOnce('glm')
      .mockResolvedValueOnce('edit');
    mockInput
      .mockResolvedValueOnce('glm')
      .mockResolvedValueOnce('https://my-proxy.example.com/anthropic')
      .mockResolvedValueOnce('custom-model');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn()
      .mockRejectedValueOnce(new ValidationError('boom'))
      .mockResolvedValueOnce(undefined);

    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    expect(validateFn).toHaveBeenCalledTimes(2);
    expect(validateFn.mock.calls[1]?.[0]).toBe('https://my-proxy.example.com/anthropic');
    expect(validateFn.mock.calls[1]?.[1]).toBe('custom-model');
    expect(validateFn.mock.calls[1]?.[2]).toBe('key');
  });

  it('validation fails → submenu: Retry with same key → re-validates with same params', async () => {
    mockSelect
      .mockResolvedValueOnce('glm')
      .mockResolvedValueOnce('retry');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn()
      .mockRejectedValueOnce(new ValidationError('boom'))
      .mockResolvedValueOnce(undefined);

    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    expect(validateFn).toHaveBeenCalledTimes(2);
    expect(validateFn.mock.calls[0]).toEqual(validateFn.mock.calls[1]);
  });

  it('validation error message is printed to stderr', async () => {
    mockSelect
      .mockResolvedValueOnce('glm')
      .mockResolvedValueOnce('cancel');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('bad-key');
    const validateFn = vi.fn().mockRejectedValueOnce(new ValidationError('boom: bad key'));

    const io = { ...mockIO(), isTTY: true, validateFn };
    await expect(run(io as never)).rejects.toBeInstanceOf(UserCancelledError);
    expect(io.writes.join('')).toContain('boom: bad key');
  });
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- commands/create.test.ts
```

预期：新增 7 个用例 FAIL（其中部分会因 Task 6 的 happy path 已经写过而实际通过；至少 5 个 FAIL）。

- [ ] **Step 3: 实现**

**再次完全重写** `packages/cli/src/commands/create.ts`：

```typescript
import type { Readable, Writable } from 'node:stream';
import { select, input, password, confirm, isCancel } from '@inquirer/prompts';
import { getSettingsPath, getBackupPath, profilePath, validateAlias } from '../config.js';
import { switchTo } from '../switcher.js';
import { PROVIDERS, getProvider, type ProviderId } from '../providers.js';
import { validateAnthropic } from '../validator.js';
import { UserCancelledError } from '../errors.js';

export interface CreateIO {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
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
    throw new UserCancelledError(
      'Interactive mode requires a TTY. Use: llm-switch <alias>',
    );
  }

  const sFn = io.selectFn ?? select;
  const iFn = io.inputFn ?? input;
  const pFn = io.passwordFn ?? password;
  const cFn = io.confirmFn ?? confirm;
  const vFn = io.validateFn ?? validateAnthropic;

  // 1. Provider
  const providerChoice = await sFn({
    message: 'Select provider:',
    choices: PROVIDERS.map((p) => ({ name: p.displayName, value: p.id })),
  });
  ensure(!isCancel(providerChoice), 'Cancelled.');
  const provider = getProvider(providerChoice as ProviderId);

  // 2. Alias
  const aliasInput = await iFn({
    message: 'Alias for this profile:',
    default: provider.id,
    validate: (v: string) => {
      const trimmed = v.trim();
      if (!trimmed) return 'Required';
      const err = validateAlias(trimmed);
      return err ?? true;
    },
  });
  ensure(!isCancel(aliasInput), 'Cancelled.');
  const alias = (aliasInput as string).trim();

  // 3. Confirm defaults
  let baseUrl = provider.baseUrl;
  let model = provider.defaultModel;
  const useDefaults = await cFn({
    message: 'Use default BASE_URL and model?',
    default: true,
  });
  ensure(!isCancel(useDefaults), 'Cancelled.');
  if (!useDefaults) {
    const urlInput = await iFn({
      message: 'BASE URL:',
      default: provider.baseUrl,
      validate: nonEmpty,
    });
    ensure(!isCancel(urlInput), 'Cancelled.');
    baseUrl = (urlInput as string).trim();

    const modelInput = await iFn({
      message: 'Model:',
      default: provider.defaultModel,
      validate: nonEmpty,
    });
    ensure(!isCancel(modelInput), 'Cancelled.');
    model = (modelInput as string).trim();
  }

  // 4-6. API key + validate loop
  let apiKey = '';
  let needsNewKey = true;
  while (true) {
    if (needsNewKey) {
      const keyInput = await pFn({
        message: 'API key:',
        mask: '*',
        validate: nonEmpty,
      });
      ensure(!isCancel(keyInput), 'Cancelled.');
      apiKey = (keyInput as string).trim();
      needsNewKey = false;
    }

    try {
      await vFn(baseUrl, model, apiKey);
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
      // 'edit'
      const urlInput = await iFn({
        message: 'BASE URL:',
        default: baseUrl,
        validate: nonEmpty,
      });
      ensure(!isCancel(urlInput), 'Cancelled.');
      baseUrl = (urlInput as string).trim();

      const modelInput = await iFn({
        message: 'Model:',
        default: model,
        validate: nonEmpty,
      });
      ensure(!isCancel(modelInput), 'Cancelled.');
      model = (modelInput as string).trim();

      needsNewKey = false;
      continue;
    }
  }

  // 后续步骤补全
  void switchTo;
  void getSettingsPath;
  void getBackupPath;
  void profilePath;
  void alias;
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- commands/create.test.ts
```

预期：所有用例 PASS。

- [ ] **Step 5: 类型检查**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm typecheck
```

预期：无错误。

- [ ] **Step 6: 提交**

```bash
cd /Users/xavier/Projects/Github/llm-switch
git add packages/cli/src/commands/create.ts packages/cli/test/commands/create.test.ts
git commit -m "feat(cli): add API key input, validate, and failure submenu to create"
```

---

## Task 8: create 命令 - 覆盖确认 + 写文件 + 激活

**Files:**
- Modify: `packages/cli/src/commands/create.ts`
- Modify: `packages/cli/test/commands/create.test.ts`

- [ ] **Step 1: 添加失败的测试**

编辑 `packages/cli/test/commands/create.test.ts`，在 `describe` 内追加：

```typescript
  it('when profile exists, prompts Overwrite? with default false', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), JSON.stringify({ OLD: 'yes' }));

    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm
      .mockResolvedValueOnce(true)   // use defaults
      .mockResolvedValueOnce(true);  // overwrite = yes
    mockPassword.mockResolvedValueOnce('new-key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);

    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const overwriteCall = mockConfirm.mock.calls[1]?.[0] as { message?: string; default?: boolean };
    expect(overwriteCall.message).toMatch(/exists.*Overwrite/);
    expect(overwriteCall.default).toBe(false);

    const profile = JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json.glm'), 'utf8'));
    expect(profile.env.ANTHROPIC_AUTH_TOKEN).toBe('new-key');
  });

  it('when profile exists and user declines overwrite → UserCancelledError, file unchanged', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), JSON.stringify({ OLD: 'yes' }));

    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);

    const io = { ...mockIO(), isTTY: true, validateFn };
    await expect(run(io as never)).rejects.toBeInstanceOf(UserCancelledError);

    const profile = await fs.readFile(path.join(tmpDir, 'settings.json.glm'), 'utf8');
    expect(JSON.parse(profile)).toEqual({ OLD: 'yes' });
  });

  it('writes JSON with env containing ANTHROPIC_BASE_URL, MODEL, AUTH_TOKEN', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('sk-xyz');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const profile = await fs.readFile(path.join(tmpDir, 'settings.json.glm'), 'utf8');
    const parsed = JSON.parse(profile);
    expect(parsed).toEqual({
      env: {
        ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
        ANTHROPIC_MODEL: 'glm-4.5',
        ANTHROPIC_AUTH_TOKEN: 'sk-xyz',
      },
    });
  });

  it('activates profile: settings.json matches profile and backup created', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), JSON.stringify({ env: { PREV: 'yes' } }));

    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const settings = JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8'));
    expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('key');
    const bak = JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json.bak'), 'utf8'));
    expect(bak.env.PREV).toBe('yes');
  });

  it('prints success message to stdout', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    expect(io.writes.join('')).toContain("Created and activated 'glm'");
    expect(io.writes.join('')).toMatch(/Restart Claude Code/);
  });
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- commands/create.test.ts
```

预期：5 个新用例 FAIL（因为 switchTo 还是 void）。

- [ ] **Step 3: 实现完整版**

**最终重写** `packages/cli/src/commands/create.ts`：

```typescript
import type { Readable, Writable } from 'node:stream';
import fs from 'node:fs/promises';
import { select, input, password, confirm, isCancel } from '@inquirer/prompts';
import {
  getSettingsPath,
  getBackupPath,
  profilePath,
  validateAlias,
} from '../config.js';
import { switchTo } from '../switcher.js';
import { PROVIDERS, getProvider, type ProviderId } from '../providers.js';
import { validateAnthropic } from '../validator.js';
import { UserCancelledError } from '../errors.js';

export interface CreateIO {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
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

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function run(io: CreateIO): Promise<void> {
  if (!io.isTTY) {
    throw new UserCancelledError(
      'Interactive mode requires a TTY. Use: llm-switch <alias>',
    );
  }

  const sFn = io.selectFn ?? select;
  const iFn = io.inputFn ?? input;
  const pFn = io.passwordFn ?? password;
  const cFn = io.confirmFn ?? confirm;
  const vFn = io.validateFn ?? validateAnthropic;

  // 1. Provider
  const providerChoice = await sFn({
    message: 'Select provider:',
    choices: PROVIDERS.map((p) => ({ name: p.displayName, value: p.id })),
  });
  ensure(!isCancel(providerChoice), 'Cancelled.');
  const provider = getProvider(providerChoice as ProviderId);

  // 2. Alias
  const aliasInput = await iFn({
    message: 'Alias for this profile:',
    default: provider.id,
    validate: (v: string) => {
      const trimmed = v.trim();
      if (!trimmed) return 'Required';
      const err = validateAlias(trimmed);
      return err ?? true;
    },
  });
  ensure(!isCancel(aliasInput), 'Cancelled.');
  const alias = (aliasInput as string).trim();

  // 3. Confirm defaults
  let baseUrl = provider.baseUrl;
  let model = provider.defaultModel;
  const useDefaults = await cFn({
    message: 'Use default BASE_URL and model?',
    default: true,
  });
  ensure(!isCancel(useDefaults), 'Cancelled.');
  if (!useDefaults) {
    const urlInput = await iFn({
      message: 'BASE URL:',
      default: provider.baseUrl,
      validate: nonEmpty,
    });
    ensure(!isCancel(urlInput), 'Cancelled.');
    baseUrl = (urlInput as string).trim();

    const modelInput = await iFn({
      message: 'Model:',
      default: provider.defaultModel,
      validate: nonEmpty,
    });
    ensure(!isCancel(modelInput), 'Cancelled.');
    model = (modelInput as string).trim();
  }

  // 4-6. API key + validate loop
  let apiKey = '';
  let needsNewKey = true;
  while (true) {
    if (needsNewKey) {
      const keyInput = await pFn({
        message: 'API key:',
        mask: '*',
        validate: nonEmpty,
      });
      ensure(!isCancel(keyInput), 'Cancelled.');
      apiKey = (keyInput as string).trim();
      needsNewKey = false;
    }

    try {
      await vFn(baseUrl, model, apiKey);
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
      // 'edit'
      const urlInput = await iFn({
        message: 'BASE URL:',
        default: baseUrl,
        validate: nonEmpty,
      });
      ensure(!isCancel(urlInput), 'Cancelled.');
      baseUrl = (urlInput as string).trim();

      const modelInput = await iFn({
        message: 'Model:',
        default: model,
        validate: nonEmpty,
      });
      ensure(!isCancel(modelInput), 'Cancelled.');
      model = (modelInput as string).trim();

      needsNewKey = false;
      continue;
    }
  }

  // 7. Overwrite confirm
  const profileFile = profilePath(alias);
  if (await fileExists(profileFile)) {
    const overwrite = await cFn({
      message: `Profile '${alias}' exists. Overwrite?`,
      default: false,
    });
    ensure(!isCancel(overwrite), 'Cancelled.');
    if (!overwrite) throw new UserCancelledError('Cancelled.');
  }

  // 8. Write profile
  const content = JSON.stringify(
    {
      env: {
        ANTHROPIC_BASE_URL: baseUrl,
        ANTHROPIC_MODEL: model,
        ANTHROPIC_AUTH_TOKEN: apiKey,
      },
    },
    null,
    2,
  );
  await fs.writeFile(profileFile, content);

  // 9. Activate (atomic switch + backup)
  const settingsPath = getSettingsPath();
  const backupPath = getBackupPath();
  await switchTo(profileFile, settingsPath, backupPath);

  // 10. Output
  io.stdout.write(`Created and activated '${alias}'. Restart Claude Code to apply.\n`);
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test -- commands/create.test.ts
```

预期：所有用例（17 个左右）PASS。

- [ ] **Step 5: 类型检查**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm typecheck
```

预期：无错误。

- [ ] **Step 6: 跑全部测试，确保没破坏旧代码**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test
```

预期：所有旧测试 + 新测试 PASS。

- [ ] **Step 7: 提交**

```bash
cd /Users/xavier/Projects/Github/llm-switch
git add packages/cli/src/commands/create.ts packages/cli/test/commands/create.test.ts
git commit -m "feat(cli): complete create command with overwrite, write, and activate"
```

---

## Task 9: 在 cli.ts 注册 create 子命令

**Files:**
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/test/cli.test.ts`

- [ ] **Step 1: 修改 cli.ts**

编辑 `packages/cli/src/cli.ts`：

在顶部 import 区追加（与现有 `import * as currentCmd from './commands/current.js';` 并列）：

```typescript
import * as createCmd from './commands/create.js';
```

在 `program.command('current')...` 之后、`async function main` 之前，追加：

```typescript
program
  .command('create')
  .description('Create a new profile from a built-in provider (interactive)')
  .action(async () => {
    await createCmd.run({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: Boolean(process.stdout.isTTY),
    });
  });
```

- [ ] **Step 2: 修改 cli.test.ts 添加 e2e 用例**

编辑 `packages/cli/test/cli.test.ts`，在 `describe('cli e2e', ...)` 内追加：

```typescript
  it('create --help mentions create subcommand', async () => {
    const r = await run(['create', '--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('create');
  });

  it('create exits 0 when no TTY (user cancel)', async () => {
    const r = await run(['create'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(0);
  });
```

- [ ] **Step 3: 跑测试**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test
```

预期：所有用例 PASS（包括 e2e 新增 2 条）。

- [ ] **Step 4: 构建并手动冒烟测试（可选）**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm build
```

预期：`dist/cli.js` 生成，无错误。

- [ ] **Step 5: 提交**

```bash
cd /Users/xavier/Projects/Github/llm-switch
git add packages/cli/src/cli.ts packages/cli/test/cli.test.ts
git commit -m "feat(cli): register create subcommand"
```

---

## Task 10: 升级版本 + CHANGELOG + README

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: 升级版本**

编辑 `packages/cli/package.json`，把 `"version": "0.2.0"` 改为 `"version": "0.3.0"`。

- [ ] **Step 2: 更新 CHANGELOG**

编辑 `CHANGELOG.md`，在文件顶部 `## [Unreleased]` 之后、`## [0.2.0]` 之前插入：

```markdown
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
```

- [ ] **Step 3: 更新 README**

编辑 `README.md`，在 Usage 段（在 `llm-switch current` 行之后）追加：

```markdown
llm-switch create               # interactive wizard to create a new profile
```

并在"What it does"段之后追加一段说明：

```markdown
## Built-in providers

`llm-switch create` ships with built-in defaults for five Anthropic-compatible providers:

| Provider      | Default BASE URL                                           | Default model       |
| ------------- | ---------------------------------------------------------- | ------------------- |
| GLM (智谱)    | `https://open.bigmodel.cn/api/anthropic`                   | `glm-4.5`           |
| DeepSeek      | `https://api.deepseek.com/anthropic`                       | `deepseek-chat`     |
| Kimi (Moonshot)| `https://api.moonshot.cn/anthropic`                       | `moonshot-v1-8k`    |
| MiniMax       | `https://api.minimaxi.com/anthropic`                       | `MiniMax-Text-01`   |
| Qwen (DashScope)| `https://dashscope.aliyuncs.com/compatible-mode/anthropic`| `qwen-plus`         |

You can override the BASE URL and model during the wizard. The default alias for each provider is its short id (e.g., `glm`, `kimi`).

## Security note

API keys entered into `create` are stored in plaintext in `~/.claude/settings.json` (and `settings.json.<alias>`). This matches how `save` works. Use file permissions (`chmod 600`) to protect the file if your machine is shared.
```

- [ ] **Step 4: 跑 lint 与 typecheck**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm typecheck
pnpm lint 2>/dev/null || echo "no lint script"
```

预期：typecheck 无错误；lint 跳过（项目可能没配）。

- [ ] **Step 5: 跑全部测试**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test
```

预期：所有 PASS。

- [ ] **Step 6: 提交**

```bash
cd /Users/xavier/Projects/Github/llm-switch
git add packages/cli/package.json CHANGELOG.md README.md
git commit -m "chore(cli): bump to 0.3.0, update CHANGELOG and README"
```

---

## 自审（实施完后必做）

- [ ] **跑一次完整测试 + typecheck + build**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test && pnpm typecheck && pnpm build
```

预期：全部通过，`dist/cli.js` 生成。

- [ ] **手动冒烟测试（必须）**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
node bin/llm-switch.js --help
```

预期：help 中包含 `create [alias]` 行（注意：实际命令是 `create` 无 alias，commander 会显示 `create`）。

```bash
node bin/llm-switch.js create --help
```

预期：显示 `Usage: llm-switch create` 和 description。

```bash
node bin/llm-switch.js create </dev/null
```

预期：立即退出，code 0，stderr 含 "Interactive mode requires a TTY"（实际走的是 UserCancelledError，cli.ts 把它映射成 code 0，stderr 由 cli.ts 的 catch 输出 "Error: ..."）。

如果 help 不含 `create`：检查 `cli.ts` 是否漏了 `program.command('create')...` 块。

- [ ] **最终提交**

```bash
cd /Users/xavier/Projects/Github/llm-switch
git status
git log --oneline -10
```

确认：所有改动已提交，工作区干净。

---

## 实施后验证（可选但推荐）

```bash
# 在真实环境跑一次 create（非交互，直接 Ctrl-C 应该退出 0）
node bin/llm-switch.js create

# 验证 list 看到新建的 profile
node bin/llm-switch.js list

# 验证 current 显示新建的
node bin/llm-switch.js current
```

如果哪个 provider 的 BASE_URL 或模型名有问题（不在 spec 默认值核实文档里），现在还来得及调整 `providers.ts`。