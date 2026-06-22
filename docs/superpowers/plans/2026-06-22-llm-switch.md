# llm-switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 `llm-switch` CLI + Claude Code 插件，用于在 `~/.claude/settings.json.<别名>` 备选配置之间一键切换。

**Architecture:** monorepo（pnpm workspaces）下两个包：`packages/cli`（TypeScript，tsup 打包为单文件 JS）和 `packages/claude-code-plugin`（薄封装调用 CLI）。CLI 内部 5 个模块（config / scanner / backup / switcher / display / ui）通过明确定义的接口协作，5 个子命令（list / switch / restore / save / current）由 commander 分发。原子替换（`fs.rename`）+ 单文件备份（`.bak`）保证切换失败时不损坏 `settings.json`。

**Tech Stack:** TypeScript 5.x · Node >= 20 · pnpm workspaces · tsup · commander · zod · picocolors · vitest

---

## 文件结构（实施前先固化）

```
llm-switch/
├── package.json                             # 根：workspaces 配置
├── pnpm-workspace.yaml                      # workspaces: ['packages/*']
├── .gitignore
├── .nvmrc                                   # node 版本
├── packages/
│   ├── cli/
│   │   ├── package.json                     # name: llm-switch, bin
│   │   ├── tsconfig.json                    # strict
│   │   ├── tsup.config.ts                   # entry src/cli.ts → dist/cli.js
│   │   ├── vitest.config.ts                 # 测试配置
│   │   ├── bin/
│   │   │   └── llm-switch.js                # #!/usr/bin/env node + require
│   │   ├── src/
│   │   │   ├── cli.ts                       # commander 装配 + 全局错误处理
│   │   │   ├── errors.ts                    # 自定义错误类
│   │   │   ├── exit.ts                      # 错误 → 退出码
│   │   │   ├── schemas.ts                   # zod schema
│   │   │   ├── config.ts                    # 路径解析
│   │   │   ├── scanner.ts                   # 扫描 + SHA256 active 判定
│   │   │   ├── backup.ts                    # 单文件备份 + 恢复
│   │   │   ├── switcher.ts                  # 原子切换
│   │   │   ├── ui.ts                        # 编号菜单
│   │   │   ├── display.ts                   # 当前配置概要
│   │   │   ├── logger.ts                    # 输出封装（picocolors）
│   │   │   └── commands/
│   │   │       ├── list.ts
│   │   │       ├── switch.ts
│   │   │       ├── restore.ts
│   │   │       ├── save.ts
│   │   │       └── current.ts
│   │   └── test/
│   │       ├── errors.test.ts
│   │       ├── exit.test.ts
│   │       ├── config.test.ts
│   │       ├── scanner.test.ts
│   │       ├── backup.test.ts
│   │       ├── switcher.test.ts
│   │       ├── ui.test.ts
│   │       ├── display.test.ts
│   │       ├── cli.test.ts                  # spawn bin 端到端
│   │       └── commands/
│   │           ├── list.test.ts
│   │           ├── switch.test.ts
│   │           ├── restore.test.ts
│   │           ├── save.test.ts
│   │           └── current.test.ts
│   └── claude-code-plugin/
│       ├── package.json
│       ├── .claude-plugin/
│       │   └── plugin.json
│       └── commands/
│           └── switch-config.md
└── docs/superpowers/
    ├── specs/2026-06-22-llm-switch-design.md
    └── plans/2026-06-22-llm-switch.md        # 本文件
```

每个 src 文件单一职责；test/ 与 src 一一对应（多 commands 文件归到 commands/ 子目录）。

---

## Task 1: 初始化 monorepo 根

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`

- [ ] **Step 1: 初始化 git**

```bash
cd /Users/xavier/Projects/Github/llm-switch
git init
git config user.email "you@example.com"   # 如未配置
git config user.name "Your Name"          # 如未配置
```

预期：Initialized empty Git repository in .../.git/

- [ ] **Step 2: 写 `.gitignore`**

写入 `/Users/xavier/Projects/Github/llm-switch/.gitignore`：

```
node_modules/
dist/
*.log
.DS_Store
coverage/
.turbo/
.env
.env.local
```

- [ ] **Step 3: 写 `.nvmrc`**

写入 `/Users/xavier/Projects/Github/llm-switch/.nvmrc`：

```
20
```

- [ ] **Step 4: 写根 `package.json`**

写入 `/Users/xavier/Projects/Github/llm-switch/package.json`：

```json
{
  "name": "llm-switch-monorepo",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  },
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  }
}
```

- [ ] **Step 5: 写 `pnpm-workspace.yaml`**

写入 `/Users/xavier/Projects/Github/llm-switch/pnpm-workspace.yaml`：

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 6: 验证 pnpm 安装**

```bash
pnpm --version
```

预期：9.x 或 10.x。若无 pnpm：`npm i -g pnpm`。

- [ ] **Step 7: 提交**

```bash
git add .
git commit -m "chore: initialize monorepo with pnpm workspaces"
```

---

## Task 2: 搭建 CLI 包骨架

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/tsup.config.ts`
- Create: `packages/cli/vitest.config.ts`

- [ ] **Step 1: 写 `packages/cli/package.json`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/package.json`：

```json
{
  "name": "llm-switch",
  "version": "0.1.0",
  "description": "Switch Claude Code settings.json profiles from the command line",
  "type": "module",
  "bin": {
    "llm-switch": "./bin/llm-switch.js"
  },
  "files": ["bin", "dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "pnpm test && pnpm build"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "picocolors": "^1.1.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: 写 `packages/cli/tsconfig.json`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "test"]
}
```

- [ ] **Step 3: 写 `packages/cli/tsup.config.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/tsup.config.ts`：

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  shims: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
```

- [ ] **Step 4: 写 `packages/cli/vitest.config.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10000,
  },
});
```

- [ ] **Step 5: 安装依赖**

```bash
cd /Users/xavier/Projects/Github/llm-switch
pnpm install
```

预期：Lockfile 创建，依赖装到 `node_modules/` 和 `packages/cli/node_modules/`。无 error。

- [ ] **Step 6: 验证 typecheck 能跑**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm typecheck
```

预期：无错误（虽然 src/ 还是空的，typecheck 应该 pass）。

- [ ] **Step 7: 提交**

```bash
git add .
git commit -m "feat(cli): scaffold package with tsup, vitest, tsconfig"
```

---

## Task 3: bin 入口文件

**Files:**
- Create: `packages/cli/bin/llm-switch.js`

- [ ] **Step 1: 写 bin 入口**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/bin/llm-switch.js`：

```js
#!/usr/bin/env node
require('../dist/cli.js');
```

- [ ] **Step 2: 设置可执行权限**

```bash
chmod +x /Users/xavier/Projects/Github/llm-switch/packages/cli/bin/llm-switch.js
```

- [ ] **Step 3: 提交**

```bash
git add packages/cli/bin/llm-switch.js
git commit -m "feat(cli): add bin entry stub"
```

注意：此时直接运行 `bin/llm-switch.js` 会失败（dist 不存在），是预期状态。Task 21 会做构建验证。

---

## Task 4: 实现 errors.ts（自定义错误类）

**Files:**
- Create: `packages/cli/src/errors.ts`
- Test: `packages/cli/test/errors.test.ts`

- [ ] **Step 1: 写失败测试**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/test/errors.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  AppError,
  ConfigDirNotFoundError,
  NoProfilesError,
  ProfileNotFoundError,
  NoBackupError,
  NoCurrentSettingsError,
  UserCancelledError,
} from '../src/errors.js';

describe('AppError', () => {
  it('is an Error subclass with a code', () => {
    const err = new AppError('boom', 'TEST_CODE');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe('boom');
    expect(err.code).toBe('TEST_CODE');
  });
});

describe('concrete errors', () => {
  it('all extend AppError', () => {
    const errors = [
      new ConfigDirNotFoundError('x'),
      new NoProfilesError('x'),
      new ProfileNotFoundError('x'),
      new NoBackupError('x'),
      new NoCurrentSettingsError('x'),
      new UserCancelledError('x'),
    ];
    for (const e of errors) {
      expect(e).toBeInstanceOf(AppError);
      expect(e).toBeInstanceOf(Error);
      expect(e.code).toMatch(/^[A-Z_]+$/);
      expect(e.message).toBe('x');
    }
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test test/errors.test.ts
```

预期：FAIL，提示 `Cannot find module '../src/errors.js'`。

- [ ] **Step 3: 实现 `errors.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/errors.ts`：

```ts
export class AppError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConfigDirNotFoundError extends AppError {
  constructor(message: string) {
    super(message, 'CONFIG_DIR_NOT_FOUND');
  }
}

export class NoProfilesError extends AppError {
  constructor(message: string) {
    super(message, 'NO_PROFILES');
  }
}

export class ProfileNotFoundError extends AppError {
  constructor(message: string) {
    super(message, 'PROFILE_NOT_FOUND');
  }
}

export class NoBackupError extends AppError {
  constructor(message: string) {
    super(message, 'NO_BACKUP');
  }
}

export class NoCurrentSettingsError extends AppError {
  constructor(message: string) {
    super(message, 'NO_CURRENT_SETTINGS');
  }
}

export class UserCancelledError extends AppError {
  constructor(message: string) {
    super(message, 'USER_CANCELLED');
  }
}

export class InvalidAliasError extends AppError {
  constructor(message: string) {
    super(message, 'INVALID_ALIAS');
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/errors.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/errors.ts packages/cli/test/errors.test.ts
git commit -m "feat(cli): add custom error classes"
```

---

## Task 5: 实现 exit.ts（错误 → 退出码映射）

**Files:**
- Create: `packages/cli/src/exit.ts`
- Test: `packages/cli/test/exit.test.ts`

- [ ] **Step 1: 写失败测试**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/test/exit.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { toExitCode } from '../src/exit.js';
import {
  ConfigDirNotFoundError,
  NoProfilesError,
  ProfileNotFoundError,
  NoBackupError,
  NoCurrentSettingsError,
  UserCancelledError,
  InvalidAliasError,
  AppError,
} from '../src/errors.js';

describe('toExitCode', () => {
  it('returns 0 for null/undefined', () => {
    expect(toExitCode(null)).toBe(0);
    expect(toExitCode(undefined)).toBe(0);
  });

  it('returns 0 for UserCancelledError', () => {
    expect(toExitCode(new UserCancelledError('x'))).toBe(0);
  });

  it('returns 1 for config / state errors', () => {
    expect(toExitCode(new ConfigDirNotFoundError('x'))).toBe(1);
    expect(toExitCode(new NoProfilesError('x'))).toBe(1);
    expect(toExitCode(new NoBackupError('x'))).toBe(1);
    expect(toExitCode(new NoCurrentSettingsError('x'))).toBe(1);
  });

  it('returns 2 for argument errors', () => {
    expect(toExitCode(new InvalidAliasError('x'))).toBe(2);
    expect(toExitCode(new ProfileNotFoundError('x'))).toBe(2);
  });

  it('returns 3 for generic IO/other AppErrors', () => {
    class GenericAppError extends AppError {
      constructor() {
        super('x', 'GENERIC');
      }
    }
    expect(toExitCode(new GenericAppError())).toBe(3);
  });

  it('returns 1 for plain Error', () => {
    expect(toExitCode(new Error('boom'))).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test test/exit.test.ts
```

预期：FAIL，模块找不到。

- [ ] **Step 3: 实现 `exit.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/exit.ts`：

```ts
import {
  AppError,
  ConfigDirNotFoundError,
  InvalidAliasError,
  NoBackupError,
  NoCurrentSettingsError,
  NoProfilesError,
  ProfileNotFoundError,
  UserCancelledError,
} from './errors.js';

export function toExitCode(err: unknown): number {
  if (err == null) return 0;
  if (err instanceof UserCancelledError) return 0;

  if (err instanceof ConfigDirNotFoundError) return 1;
  if (err instanceof NoProfilesError) return 1;
  if (err instanceof NoBackupError) return 1;
  if (err instanceof NoCurrentSettingsError) return 1;

  if (err instanceof ProfileNotFoundError) return 2;
  if (err instanceof InvalidAliasError) return 2;

  if (err instanceof AppError) return 3;
  return 1;
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/exit.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/exit.ts packages/cli/test/exit.test.ts
git commit -m "feat(cli): add exit code mapping"
```

---

## Task 6: 实现 schemas.ts（zod 校验）

**Files:**
- Create: `packages/cli/src/schemas.ts`
- Test: `packages/cli/test/schemas.test.ts`

- [ ] **Step 1: 写失败测试**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/test/schemas.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { SettingsSchema, parseSettings } from '../src/schemas.js';

describe('SettingsSchema', () => {
  it('accepts empty object', () => {
    expect(() => SettingsSchema.parse({})).not.toThrow();
  });

  it('accepts full valid config', () => {
    const cfg = {
      env: {
        ANTHROPIC_BASE_URL: 'https://api.example.com',
        ANTHROPIC_MODEL: 'claude-sonnet-4',
      },
      mcpServers: {
        foo: { command: 'npx', args: ['-y', 'foo'] },
      },
    };
    expect(() => SettingsSchema.parse(cfg)).not.toThrow();
  });

  it('rejects invalid env types', () => {
    expect(() => SettingsSchema.parse({ env: 42 })).toThrow();
  });
});

describe('parseSettings', () => {
  it('returns parsed object for valid JSON', () => {
    const json = '{"env":{"ANTHROPIC_BASE_URL":"https://x"}}';
    const result = parseSettings(json);
    expect(result.env?.ANTHROPIC_BASE_URL).toBe('https://x');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseSettings('not json')).toThrow();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test test/schemas.test.ts
```

预期：FAIL。

- [ ] **Step 3: 实现 `schemas.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/schemas.ts`：

```ts
import { z } from 'zod';

export const SettingsSchema = z
  .object({
    env: z.record(z.string(), z.string()).optional(),
    mcpServers: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type Settings = z.infer<typeof SettingsSchema>;

export function parseSettings(json: string): Settings {
  const raw = JSON.parse(json);
  return SettingsSchema.parse(raw);
}

export function parseSettingsSafe(json: string): Settings | null {
  try {
    return parseSettings(json);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/schemas.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/schemas.ts packages/cli/test/schemas.test.ts
git commit -m "feat(cli): add zod settings schema"
```

---

## Task 7: 实现 config.ts（路径解析）

**Files:**
- Create: `packages/cli/src/config.ts`
- Test: `packages/cli/test/config.test.ts`

- [ ] **Step 1: 写失败测试**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/test/config.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import {
  getConfigDir,
  getSettingsPath,
  getBackupPath,
  profilePath,
  ALIAS_RE,
  validateAlias,
} from '../src/config.js';

describe('path resolution', () => {
  const originalEnv = process.env.CLAUDE_CONFIG_DIR;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalEnv;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  });

  it('uses CLAUDE_CONFIG_DIR when set', () => {
    process.env.CLAUDE_CONFIG_DIR = '/tmp/claude-test';
    expect(getConfigDir()).toBe('/tmp/claude-test');
  });

  it('falls back to ~/.claude', () => {
    process.env.HOME = '/Users/alice';
    expect(getConfigDir()).toBe(path.join('/Users/alice', '.claude'));
  });

  it('expands ~ in CLAUDE_CONFIG_DIR', () => {
    process.env.CLAUDE_CONFIG_DIR = '~/my-claude';
    process.env.HOME = '/Users/bob';
    expect(getConfigDir()).toBe(path.join('/Users/bob', 'my-claude'));
  });
});

describe('derived paths', () => {
  it('getSettingsPath joins configDir + settings.json', () => {
    expect(getSettingsPath()).toMatch(/settings\.json$/);
  });

  it('getBackupPath returns settings.json.bak', () => {
    expect(getBackupPath()).toMatch(/settings\.json\.bak$/);
  });

  it('profilePath joins configDir + settings.json.<alias>', () => {
    expect(profilePath('glm')).toMatch(/settings\.json\.glm$/);
  });
});

describe('ALIAS_RE', () => {
  it.each(['glm', 'kimi', 'glm-v2', 'a.b', 'x_y', '123abc'])(
    'accepts valid alias: %s',
    (alias) => {
      expect(ALIAS_RE.test(alias)).toBe(true);
    },
  );

  it.each(['GLM', '-glm', '.glm', 'glm!', '', 'a'.repeat(65)])(
    'rejects invalid alias: %s',
    (alias) => {
      expect(ALIAS_RE.test(alias)).toBe(false);
    },
  );
});

describe('validateAlias', () => {
  it('returns null for valid alias', () => {
    expect(validateAlias('glm')).toBeNull();
  });

  it('returns error message for invalid alias', () => {
    expect(validateAlias('GLM')).toMatch(/Invalid alias/);
    expect(validateAlias('-glm')).toMatch(/Invalid alias/);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test test/config.test.ts
```

预期：FAIL。

- [ ] **Step 3: 实现 `config.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/config.ts`：

```ts
import path from 'node:path';
import os from 'node:os';
import { InvalidAliasError } from './errors.js';

export type ConfigDir = string & { readonly __brand: 'ConfigDir' };

export const ALIAS_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function toConfigDir(s: string): ConfigDir {
  return s as ConfigDir;
}

export function getConfigDir(): ConfigDir {
  const fromEnv = process.env.CLAUDE_CONFIG_DIR;
  if (fromEnv) return toConfigDir(path.resolve(expandHome(fromEnv)));
  return toConfigDir(path.join(os.homedir(), '.claude'));
}

export function getSettingsPath(): string {
  return path.join(getConfigDir(), 'settings.json');
}

export function getBackupPath(): string {
  return path.join(getConfigDir(), 'settings.json.bak');
}

export function profilePath(alias: string): string {
  return path.join(getConfigDir(), `settings.json.${alias}`);
}

export function validateAlias(alias: string): string | null {
  if (!ALIAS_RE.test(alias)) {
    return `Invalid alias '${alias}'. Must match ${ALIAS_RE} (lowercase, digits, . _ -, start with letter/digit, 1-64 chars).`;
  }
  return null;
}

export function assertAlias(alias: string): void {
  const err = validateAlias(alias);
  if (err) throw new InvalidAliasError(err);
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/config.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/config.ts packages/cli/test/config.test.ts
git commit -m "feat(cli): add config path resolution and alias validation"
```

---

## Task 8: 实现 logger.ts（输出封装）

**Files:**
- Create: `packages/cli/src/logger.ts`

本任务无独立测试（logger 是 thin wrapper，下面模块会用到，行为通过端到端测试覆盖）。

- [ ] **Step 1: 写 `logger.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/logger.ts`：

```ts
import pc from 'picocolors';

const noColor = process.env.NO_COLOR !== undefined || !process.stdout.isTTY;

const c = noColor
  ? {
      red: (s: string) => s,
      green: (s: string) => s,
      yellow: (s: string) => s,
      cyan: (s: string) => s,
      dim: (s: string) => s,
      bold: (s: string) => s,
    }
  : pc;

export const log = {
  info: (msg: string): void => {
    process.stdout.write(`${msg}\n`);
  },
  success: (msg: string): void => {
    process.stdout.write(`${c.green(msg)}\n`);
  },
  warn: (msg: string): void => {
    process.stderr.write(`${c.yellow(msg)}\n`);
  },
  error: (msg: string): void => {
    process.stderr.write(`${c.red(msg)}\n`);
  },
  dim: (msg: string): void => {
    process.stdout.write(`${c.dim(msg)}\n`);
  },
  bold: (msg: string): void => {
    process.stdout.write(`${c.bold(msg)}\n`);
  },
  cyan: (msg: string): void => {
    process.stdout.write(`${c.cyan(msg)}\n`);
  },
};
```

- [ ] **Step 2: 提交**

```bash
git add packages/cli/src/logger.ts
git commit -m "feat(cli): add logger wrapper around picocolors"
```

---

## Task 9: 实现 backup.ts（备份 + 恢复）

**Files:**
- Create: `packages/cli/src/backup.ts`
- Test: `packages/cli/test/backup.test.ts`

- [ ] **Step 1: 写失败测试**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/test/backup.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { backupCurrent, restoreBackup } from '../src/backup.js';
import { NoBackupError } from '../src/errors.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('backupCurrent', () => {
  it('skips silently when settings.json does not exist', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    await backupCurrent(settings, backup);
    await expect(fs.access(backup)).rejects.toThrow();
  });

  it('overwrites existing .bak with current settings', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    await fs.writeFile(settings, '{"new":true}');
    await fs.writeFile(backup, '{"old":true}');

    await backupCurrent(settings, backup);

    const bakContent = await fs.readFile(backup, 'utf8');
    expect(JSON.parse(bakContent)).toEqual({ new: true });
  });

  it('copies exact bytes (no formatting change)', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    const raw = '{"a":1,"b":2}';
    await fs.writeFile(settings, raw);

    await backupCurrent(settings, backup);

    expect(await fs.readFile(backup, 'utf8')).toBe(raw);
  });
});

describe('restoreBackup', () => {
  it('throws NoBackupError when .bak missing', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    await expect(restoreBackup(settings, backup)).rejects.toBeInstanceOf(NoBackupError);
  });

  it('renames .bak to settings.json atomically', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    await fs.writeFile(settings, '{"current":true}');
    await fs.writeFile(backup, '{"previous":true}');

    await restoreBackup(settings, backup);

    expect(await fs.readFile(settings, 'utf8')).toBe('{"previous":true}');
    await expect(fs.access(backup)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test test/backup.test.ts
```

预期：FAIL。

- [ ] **Step 3: 实现 `backup.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/backup.ts`：

```ts
import fs from 'node:fs/promises';
import { NoBackupError } from './errors.js';

export async function backupCurrent(settingsPath: string, backupPath: string): Promise<void> {
  try {
    await fs.copyFile(settingsPath, backupPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw err;
  }
}

export async function restoreBackup(settingsPath: string, backupPath: string): Promise<void> {
  try {
    await fs.rename(backupPath, settingsPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NoBackupError(`No backup found at ${backupPath}.`);
    }
    throw err;
  }
}

export async function isSameContent(a: string, b: string): Promise<boolean> {
  try {
    const [ca, cb] = await Promise.all([fs.readFile(a), fs.readFile(b)]);
    return ca.equals(cb);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/backup.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/backup.ts packages/cli/test/backup.test.ts
git commit -m "feat(cli): add backup and restore functions"
```

---

## Task 10: 实现 scanner.ts（扫描 + active 判定）

**Files:**
- Create: `packages/cli/src/scanner.ts`
- Test: `packages/cli/test/scanner.test.ts`

- [ ] **Step 1: 写失败测试**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/test/scanner.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { listProfiles } from '../src/scanner.js';
import { ConfigDirNotFoundError } from '../src/errors.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('listProfiles', () => {
  it('throws ConfigDirNotFoundError when directory missing', async () => {
    const missing = path.join(tmpDir, 'nope');
    await expect(listProfiles(missing as never)).rejects.toBeInstanceOf(ConfigDirNotFoundError);
  });

  it('returns empty array when no profiles', async () => {
    const result = await listProfiles(tmpDir as never);
    expect(result).toEqual([]);
  });

  it('lists settings.json.* excluding .bak', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.kimi'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.bak'), '{}');

    const result = await listProfiles(tmpDir as never);
    const aliases = result.map((p) => p.alias).sort();

    expect(aliases).toEqual(['glm', 'kimi']);
  });

  it('ignores non-matching files', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');
    await fs.writeFile(path.join(tmpDir, 'random.txt'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');

    const result = await listProfiles(tmpDir as never);
    expect(result.map((p) => p.alias)).toEqual(['glm']);
  });

  it('marks active=true when content matches settings.json', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{"a":1}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.kimi'), '{"a":2}');

    const result = await listProfiles(tmpDir as never);
    const glm = result.find((p) => p.alias === 'glm')!;
    const kimi = result.find((p) => p.alias === 'kimi')!;

    expect(glm.active).toBe(true);
    expect(kimi.active).toBe(false);
  });

  it('marks active=false when settings.json missing', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{"a":1}');

    const result = await listProfiles(tmpDir as never);
    expect(result[0]!.active).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test test/scanner.test.ts
```

预期：FAIL。

- [ ] **Step 3: 实现 `scanner.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/scanner.ts`：

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { ConfigDirNotFoundError } from './errors.js';
import type { ConfigDir } from './config.js';

export interface Profile {
  alias: string;
  path: string;
  active: boolean;
}

async function sha256(filePath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(filePath);
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(buf).digest('hex');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function listProfiles(configDir: ConfigDir): Promise<Profile[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(configDir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ConfigDirNotFoundError(`Config directory not found: ${configDir}`);
    }
    throw err;
  }

  const settingsHash = await sha256(path.join(configDir, 'settings.json'));

  const matches = entries
    .filter((name) => name.startsWith('settings.json.'))
    .filter((name) => !name.endsWith('.bak'))
    .map((name) => name.slice('settings.json.'.length));

  const profiles: Profile[] = [];
  for (const alias of matches) {
    const profileFile = path.join(configDir, `settings.json.${alias}`);
    const hash = await sha256(profileFile);
    profiles.push({
      alias,
      path: profileFile,
      active: hash !== null && hash === settingsHash,
    });
  }

  profiles.sort((a, b) => a.alias.localeCompare(b.alias));
  return profiles;
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/scanner.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/scanner.ts packages/cli/test/scanner.test.ts
git commit -m "feat(cli): add scanner with SHA256 active detection"
```

---

## Task 11: 实现 switcher.ts（原子切换 + 回滚）

**Files:**
- Create: `packages/cli/src/switcher.ts`
- Test: `packages/cli/test/switcher.test.ts`

- [ ] **Step 1: 写失败测试**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/test/switcher.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { switchTo } from '../src/switcher.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('switchTo', () => {
  it('backs up current settings, copies source, replaces atomically', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    const source = path.join(tmpDir, 'settings.json.glm');

    await fs.writeFile(settings, '{"old":true}');
    await fs.writeFile(source, '{"new":true}');

    await switchTo(source, settings, backup);

    expect(JSON.parse(await fs.readFile(settings, 'utf8'))).toEqual({ new: true });
    expect(JSON.parse(await fs.readFile(backup, 'utf8'))).toEqual({ old: true });
  });

  it('works when no current settings.json exists', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    const source = path.join(tmpDir, 'settings.json.glm');
    await fs.writeFile(source, '{"new":true}');

    await switchTo(source, settings, backup);

    expect(JSON.parse(await fs.readFile(settings, 'utf8'))).toEqual({ new: true });
    await expect(fs.access(backup)).rejects.toThrow();
  });

  it('cleans up tmp file when source copy fails', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    await fs.writeFile(settings, '{"old":true}');

    await expect(switchTo('/nonexistent/path', settings, backup)).rejects.toThrow();

    expect(JSON.parse(await fs.readFile(settings, 'utf8'))).toEqual({ old: true });
    const files = await fs.readdir(tmpDir);
    expect(files.filter((f) => f.includes('tmp'))).toEqual([]);
  });

  it('preserves settings.json when rename fails (atomicity)', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    const source = path.join(tmpDir, 'settings.json.glm');

    await fs.writeFile(settings, '{"old":true}');
    await fs.writeFile(source, '{"new":true}');

    const realRename = fs.rename;
    const spy = vi.spyOn(fs, 'rename').mockImplementation(async (src, dst) => {
      if (typeof dst === 'string' && dst === settings) {
        throw new Error('simulated rename failure');
      }
      return realRename(src, dst);
    });

    await expect(switchTo(source, settings, backup)).rejects.toThrow(/simulated/);

    expect(JSON.parse(await fs.readFile(settings, 'utf8'))).toEqual({ old: true });

    spy.mockRestore();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test test/switcher.test.ts
```

预期：FAIL。

- [ ] **Step 3: 实现 `switcher.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/switcher.ts`：

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { backupCurrent } from './backup.js';

export async function switchTo(
  sourcePath: string,
  settingsPath: string,
  backupPath: string,
): Promise<void> {
  await backupCurrent(settingsPath, backupPath);

  const tmpPath = path.join(
    path.dirname(settingsPath),
    `.settings.${crypto.randomUUID()}.tmp`,
  );

  try {
    await fs.copyFile(sourcePath, tmpPath);
    await fs.rename(tmpPath, settingsPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true });
    throw err;
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/switcher.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/switcher.ts packages/cli/test/switcher.test.ts
git commit -m "feat(cli): add atomic switcher with rollback"
```

---

## Task 12: 实现 display.ts（当前配置概要）

**Files:**
- Create: `packages/cli/src/display.ts`
- Test: `packages/cli/test/display.test.ts`

- [ ] **Step 1: 写失败测试**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/test/display.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { summarize } from '../src/display.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('summarize', () => {
  it('returns source=default when no match', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"env":{}}');

    const s = await summarize(tmpDir as never);
    expect(s.source).toBe('default');
    expect(s.hasMcp).toBe(false);
  });

  it('detects alias match by content', async () => {
    const cfg = { env: { ANTHROPIC_BASE_URL: 'https://x' } };
    await fs.writeFile(path.join(tmpDir, 'settings.json'), JSON.stringify(cfg));
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), JSON.stringify(cfg));

    const s = await summarize(tmpDir as never);
    expect(s.source).toBe('glm');
    expect(s.baseUrl).toBe('https://x');
  });

  it('extracts baseUrl, model, hasMcp', async () => {
    const cfg = {
      env: {
        ANTHROPIC_BASE_URL: 'https://api.example.com',
        ANTHROPIC_MODEL: 'claude-sonnet-4',
      },
      mcpServers: { foo: { command: 'npx' } },
    };
    await fs.writeFile(path.join(tmpDir, 'settings.json'), JSON.stringify(cfg));

    const s = await summarize(tmpDir as never);
    expect(s.baseUrl).toBe('https://api.example.com');
    expect(s.model).toBe('claude-sonnet-4');
    expect(s.hasMcp).toBe(true);
  });

  it('returns empty summary when settings.json missing', async () => {
    const s = await summarize(tmpDir as never);
    expect(s.source).toBe('default');
    expect(s.baseUrl).toBeUndefined();
    expect(s.model).toBeUndefined();
    expect(s.hasMcp).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test test/display.test.ts
```

预期：FAIL。

- [ ] **Step 3: 实现 `display.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/display.ts`：

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ConfigDirNotFoundError } from './errors.js';
import type { ConfigDir } from './config.js';

export interface CurrentSummary {
  source: string;
  sourcePath: string;
  baseUrl?: string;
  model?: string;
  hasMcp: boolean;
}

async function sha256(filePath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
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

export async function summarize(configDir: ConfigDir): Promise<CurrentSummary> {
  if (!(await dirExists(configDir))) {
    throw new ConfigDirNotFoundError(`Config directory not found: ${configDir}`);
  }

  const settingsPath = path.join(configDir, 'settings.json');
  const settingsHash = await sha256(settingsPath);

  if (!settingsHash) {
    return { source: 'default', sourcePath: settingsPath, hasMcp: false };
  }

  const entries = await fs.readdir(configDir);
  const aliases = entries
    .filter((n) => n.startsWith('settings.json.') && !n.endsWith('.bak'))
    .map((n) => n.slice('settings.json.'.length));

  for (const alias of aliases) {
    const profileFile = path.join(configDir, `settings.json.${alias}`);
    if ((await sha256(profileFile)) === settingsHash) {
      const content = await fs.readFile(settingsPath, 'utf8');
      const data = safeParse(content);
      return {
        source: alias,
        sourcePath: profileFile,
        baseUrl: data?.env?.ANTHROPIC_BASE_URL,
        model: data?.env?.ANTHROPIC_MODEL,
        hasMcp: data?.mcpServers !== undefined && Object.keys(data.mcpServers).length > 0,
      };
    }
  }

  return { source: 'default', sourcePath: settingsPath, hasMcp: false };
}

function safeParse(json: string): Record<string, any> | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/display.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/display.ts packages/cli/test/display.test.ts
git commit -m "feat(cli): add current config summarizer"
```

---

## Task 13: 实现 ui.ts（交互菜单）

**Files:**
- Create: `packages/cli/src/ui.ts`
- Test: `packages/cli/test/ui.test.ts`

`ui.ts` 关键设计：暴露 `createReadline(input, output)` 函数，命令文件注入 readline 接口；默认调用走 `process.stdin`/`process.stdout`。

- [ ] **Step 1: 写失败测试**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/test/ui.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { pickProfile, promptAlias } from '../src/ui.js';
import type { Profile } from '../src/scanner.js';

function mockReadline(input: string) {
  return Readable.from([input]);
}

describe('pickProfile', () => {
  const profiles: Profile[] = [
    { alias: 'glm', path: '/p/glm', active: false },
    { alias: 'kimi', path: '/p/kimi', active: true },
  ];

  it('returns the selected profile', async () => {
    const result = await pickProfile(profiles, { input: mockReadline('1\n'), output: process.stdout });
    expect(result?.alias).toBe('glm');
  });

  it('returns null on empty input (cancel)', async () => {
    const result = await pickProfile(profiles, { input: mockReadline('\n'), output: process.stdout });
    expect(result).toBeNull();
  });

  it('returns null on invalid input', async () => {
    const result = await pickProfile(profiles, { input: mockReadline('99\n'), output: process.stdout });
    expect(result).toBeNull();
  });
});

describe('promptAlias', () => {
  it('returns trimmed alias', async () => {
    const result = await promptAlias([], { input: mockReadline('  myprofile  \n'), output: process.stdout });
    expect(result).toBe('myprofile');
  });

  it('returns null on empty input', async () => {
    const result = await promptAlias([], { input: mockReadline('\n'), output: process.stdout });
    expect(result).toBeNull();
  });

  it('returns null when input matches an existing alias', async () => {
    const result = await promptAlias(['glm'], { input: mockReadline('glm\n'), output: process.stdout });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test test/ui.test.ts
```

预期：FAIL。

- [ ] **Step 3: 实现 `ui.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/ui.ts`：

```ts
import readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { Profile } from './scanner.js';
import { ALIAS_RE } from './config.js';

export interface ReadlineIO {
  input: Readable;
  output: Writable;
}

function makeRl(io: ReadlineIO): readline.Interface {
  return readline.createInterface({ input: io.input, output: io.output });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export async function pickProfile(
  profiles: Profile[],
  io: ReadlineIO = { input: process.stdin, output: process.stdout },
): Promise<Profile | null> {
  const rl = makeRl(io);
  try {
    if (profiles.length === 0) return null;

    process.stdout.write('\n');
    profiles.forEach((p, i) => {
      const marker = p.active ? '*' : ' ';
      process.stdout.write(`  ${marker} ${i + 1}. ${p.alias}\n`);
    });
    process.stdout.write(`\nSelect profile [1-${profiles.length}] (Enter to cancel): `);

    const answer = (await ask(rl, '')).trim();
    if (!answer) return null;

    const idx = Number.parseInt(answer, 10);
    if (!Number.isFinite(idx) || idx < 1 || idx > profiles.length) return null;
    return profiles[idx - 1] ?? null;
  } finally {
    rl.close();
  }
}

export async function promptAlias(
  existing: string[],
  io: ReadlineIO = { input: process.stdin, output: process.stdout },
): Promise<string | null> {
  const rl = makeRl(io);
  try {
    process.stdout.write('\nAlias name (Enter to cancel): ');
    const answer = (await ask(rl, '')).trim();
    if (!answer) return null;
    if (!ALIAS_RE.test(answer)) {
      process.stderr.write(
        `Invalid alias. Must match ${ALIAS_RE} (lowercase, digits, . _ -, 1-64 chars).\n`,
      );
      return null;
    }
    if (existing.includes(answer)) {
      process.stderr.write(`Alias '${answer}' already exists.\n`);
      return null;
    }
    return answer;
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/ui.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/ui.ts packages/cli/test/ui.test.ts
git commit -m "feat(cli): add interactive menu UI"
```

---

## Task 14: 实现 commands/list.ts

**Files:**
- Create: `packages/cli/src/commands/list.ts`
- Test: `packages/cli/test/commands/list.test.ts`

- [ ] **Step 1: 写失败测试**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/test/commands/list.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/list.js';
import { NoProfilesError, ConfigDirNotFoundError } from '../../src/errors.js';
import { ConfigDir } from '../../src/config.js';

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
});

describe('list command', () => {
  it('throws NoProfilesError when no profiles', async () => {
    await expect(run({ stdout: { write: () => {} } } as never)).rejects.toBeInstanceOf(NoProfilesError);
  });

  it('lists profiles via injected writer', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.kimi'), '{}');

    const writes: string[] = [];
    await run({ stdout: { write: (s: string) => writes.push(s) } } as never);

    const out = writes.join('');
    expect(out).toContain('glm');
    expect(out).toContain('kimi');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test test/commands/list.test.ts
```

预期：FAIL。

- [ ] **Step 3: 实现 `commands/list.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/commands/list.ts`：

```ts
import type { ConfigDir } from '../config.js';
import { getConfigDir } from '../config.js';
import { listProfiles } from '../scanner.js';
import { NoProfilesError } from '../errors.js';

export interface CommandIO {
  stdout: { write(s: string): unknown };
}

export async function run(io: CommandIO): Promise<void> {
  const configDir: ConfigDir = getConfigDir();
  const profiles = await listProfiles(configDir);

  if (profiles.length === 0) {
    throw new NoProfilesError(
      "No profiles found. Create one with: llm-switch save <alias>",
    );
  }

  const lines = ['Available profiles:', ''];
  profiles.forEach((p, i) => {
    const marker = p.active ? '*' : ' ';
    lines.push(`  ${marker} ${i + 1}. ${p.alias}  (${p.path})`);
  });
  lines.push('');
  lines.push('* = currently active');
  io.stdout.write(lines.join('\n') + '\n');
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/commands/list.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/commands/list.ts packages/cli/test/commands/list.test.ts
git commit -m "feat(cli): add list command"
```

---

## Task 15: 实现 commands/switch.ts

**Files:**
- Create: `packages/cli/src/commands/switch.ts`
- Test: `packages/cli/test/commands/switch.test.ts`

- [ ] **Step 1: 写失败测试**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/test/commands/switch.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { run } from '../../src/commands/switch.js';
import {
  ProfileNotFoundError,
  NoCurrentSettingsError,
  UserCancelledError,
  InvalidAliasError,
} from '../../src/errors.js';

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
  it('throws ProfileNotFoundError when alias given but file missing', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');
    const io = mockIO();

    await expect(run({ alias: 'nope', ...io } as never)).rejects.toBeInstanceOf(ProfileNotFoundError);
  });

  it('throws InvalidAliasError for bad alias', async () => {
    const io = mockIO();
    await expect(run({ alias: 'BAD!', ...io } as never)).rejects.toBeInstanceOf(InvalidAliasError);
  });

  it('switches when alias given and profile exists', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{"a":2}');
    const io = mockIO();

    await run({ alias: 'glm', ...io } as never);

    expect(JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8'))).toEqual({ a: 2 });
    expect(io.writes.join('')).toContain('Switched to glm');
  });

  it('throws UserCancelledError when interactive menu cancelled', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');
    const io = mockIO('\n'); // empty = cancel

    await expect(run({ alias: undefined, ...io } as never)).rejects.toBeInstanceOf(UserCancelledError);
  });

  it('throws NoCurrentSettingsError? (n/a here, but verify not thrown)', async () => {
    // No settings.json, no profiles, just interactive cancel
    const io = mockIO('\n');
    await expect(run({ alias: undefined, ...io } as never)).rejects.toBeInstanceOf(UserCancelledError);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test test/commands/switch.test.ts
```

预期：FAIL。

- [ ] **Step 3: 实现 `commands/switch.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/commands/switch.ts`：

```ts
import type { Readable, Writable } from 'node:stream';
import {
  getConfigDir,
  getSettingsPath,
  getBackupPath,
  profilePath,
  assertAlias,
} from '../config.js';
import { listProfiles } from '../scanner.js';
import { switchTo } from '../switcher.js';
import { pickProfile } from '../ui.js';
import {
  ProfileNotFoundError,
  UserCancelledError,
} from '../errors.js';

export interface SwitchIO {
  alias?: string;
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
}

export async function run(io: SwitchIO): Promise<void> {
  const configDir = getConfigDir();
  const settingsPath = getSettingsPath();
  const backupPath = getBackupPath();

  if (io.alias !== undefined) {
    assertAlias(io.alias);
    const source = profilePath(io.alias);
    const profiles = await listProfiles(configDir);
    if (!profiles.find((p) => p.alias === io.alias)) {
      throw new ProfileNotFoundError(
        `Profile '${io.alias}' not found. Run 'llm-switch list' to see available profiles.`,
      );
    }
    await switchTo(source, settingsPath, backupPath);
    io.stdout.write(`Switched to ${io.alias}. Restart Claude Code to apply.\n`);
    return;
  }

  if (!io.isTTY) {
    throw new UserCancelledError(
      'Interactive mode requires a TTY. Use: llm-switch <alias>',
    );
  }

  const profiles = await listProfiles(configDir);
  const chosen = await pickProfile(profiles, { input: io.stdin, output: io.stdout });
  if (!chosen) {
    throw new UserCancelledError('Cancelled.');
  }
  await switchTo(chosen.path, settingsPath, backupPath);
  io.stdout.write(`Switched to ${chosen.alias}. Restart Claude Code to apply.\n`);
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/commands/switch.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/commands/switch.ts packages/cli/test/commands/switch.test.ts
git commit -m "feat(cli): add switch command"
```

---

## Task 16: 实现 commands/restore.ts

**Files:**
- Create: `packages/cli/src/commands/restore.ts`
- Test: `packages/cli/test/commands/restore.test.ts`

- [ ] **Step 1: 写失败测试**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/test/commands/restore.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/restore.js';
import { NoBackupError, NoCurrentSettingsError } from '../../src/errors.js';

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
});

describe('restore command', () => {
  it('throws NoBackupError when .bak missing', async () => {
    const writes: string[] = [];
    const io = { stdout: { write: (s: string) => writes.push(s) } };
    await expect(run(io as never)).rejects.toBeInstanceOf(NoBackupError);
  });

  it('throws NoCurrentSettingsError when both missing', async () => {
    const writes: string[] = [];
    const io = { stdout: { write: (s: string) => writes.push(s) } };
    await fs.writeFile(path.join(tmpDir, 'settings.json.bak'), '{}');
    await expect(run(io as never)).rejects.toBeInstanceOf(NoCurrentSettingsError);
  });

  it('skips when current == backup', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.bak'), '{"a":1}');
    const writes: string[] = [];
    const io = { stdout: { write: (s: string) => writes.push(s) } };

    await run(io as never);

    expect(writes.join('')).toContain('Already at backup state');
  });

  it('restores from backup', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"current":true}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.bak'), '{"previous":true}');
    const writes: string[] = [];
    const io = { stdout: { write: (s: string) => writes.push(s) } };

    await run(io as never);

    expect(JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8'))).toEqual({ previous: true });
    expect(writes.join('')).toContain('Restored from backup');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test test/commands/restore.test.ts
```

预期：FAIL。

- [ ] **Step 3: 实现 `commands/restore.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/commands/restore.ts`：

```ts
import fs from 'node:fs/promises';
import { getSettingsPath, getBackupPath } from '../config.js';
import { restoreBackup, isSameContent } from '../backup.js';
import { NoBackupError, NoCurrentSettingsError } from '../errors.js';

export interface RestoreIO {
  stdout: { write(s: string): unknown };
}

export async function run(io: RestoreIO): Promise<void> {
  const settingsPath = getSettingsPath();
  const backupPath = getBackupPath();

  if (!(await exists(backupPath))) {
    throw new NoBackupError(`No backup found at ${backupPath}.`);
  }
  if (!(await exists(settingsPath))) {
    throw new NoCurrentSettingsError(
      `No current settings.json to restore at ${settingsPath}.`,
    );
  }
  if (await isSameContent(settingsPath, backupPath)) {
    io.stdout.write('Already at backup state. Nothing to do.\n');
    return;
  }

  await restoreBackup(settingsPath, backupPath);
  io.stdout.write('Restored from backup.\n');
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/commands/restore.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/commands/restore.ts packages/cli/test/commands/restore.test.ts
git commit -m "feat(cli): add restore command"
```

---

## Task 17: 实现 commands/save.ts

**Files:**
- Create: `packages/cli/src/commands/save.ts`
- Test: `packages/cli/test/commands/save.test.ts`

- [ ] **Step 1: 写失败测试**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/test/commands/save.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { run } from '../../src/commands/save.js';
import { NoCurrentSettingsError, InvalidAliasError } from '../../src/errors.js';

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
});

function mockIO() {
  const writes: string[] = [];
  return {
    writes,
    stdin: Readable.from(['']),
    stdout: { write: (s: string) => writes.push(s) },
    stderr: { write: (s: string) => writes.push(s) },
    isTTY: false,
  };
}

describe('save command', () => {
  it('throws NoCurrentSettingsError when settings.json missing', async () => {
    const io = mockIO();
    await expect(run({ alias: 'glm', ...io } as never)).rejects.toBeInstanceOf(NoCurrentSettingsError);
  });

  it('throws InvalidAliasError for bad alias', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');
    const io = mockIO();
    await expect(run({ alias: 'BAD!', ...io } as never)).rejects.toBeInstanceOf(InvalidAliasError);
  });

  it('saves current settings to profile path', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    const io = mockIO();

    await run({ alias: 'glm', ...io } as never);

    expect(JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json.glm'), 'utf8'))).toEqual({ a: 1 });
  });

  it('overwrites existing profile (current is truth)', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"new":true}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{"old":true}');
    const io = mockIO();

    await run({ alias: 'glm', ...io } as never);

    expect(JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json.glm'), 'utf8'))).toEqual({ new: true });
    expect(io.writes.join('')).toContain('Overwrote');
  });

  it('prompts for alias interactively when not provided', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    const writes: string[] = [];
    const io = {
      writes,
      stdin: Readable.from(['glm\n']),
      stdout: { write: (s: string) => writes.push(s) },
      stderr: { write: (s: string) => writes.push(s) },
      isTTY: true,
    };

    await run({ alias: undefined, ...io } as never);

    expect(JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json.glm'), 'utf8'))).toEqual({ a: 1 });
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test test/commands/save.test.ts
```

预期：FAIL。

- [ ] **Step 3: 实现 `commands/save.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/commands/save.ts`：

```ts
import fs from 'node:fs/promises';
import type { Readable, Writable } from 'node:stream';
import { getConfigDir, getSettingsPath, profilePath, assertAlias } from '../config.js';
import { listProfiles } from '../scanner.js';
import { promptAlias } from '../ui.js';
import { NoCurrentSettingsError, UserCancelledError } from '../errors.js';

export interface SaveIO {
  alias?: string;
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
}

export async function run(io: SaveIO): Promise<void> {
  const configDir = getConfigDir();
  const settingsPath = getSettingsPath();

  if (!(await exists(settingsPath))) {
    throw new NoCurrentSettingsError(
      `No current settings.json at ${settingsPath}. Nothing to save.`,
    );
  }

  let alias = io.alias;
  if (alias === undefined) {
    if (!io.isTTY) {
      throw new UserCancelledError(
        'Interactive mode requires a TTY. Use: llm-switch save <alias>',
      );
    }
    const profiles = await listProfiles(configDir);
    const result = await promptAlias(profiles.map((p) => p.alias), {
      input: io.stdin,
      output: io.stdout,
    });
    if (!result) throw new UserCancelledError('Cancelled.');
    alias = result;
  } else {
    assertAlias(alias);
  }

  const target = profilePath(alias);
  const existed = await exists(target);
  await fs.copyFile(settingsPath, target);

  if (existed) {
    io.stderr.write(`Overwrote existing profile '${alias}'.\n`);
  }
  io.stdout.write(`Saved current settings as '${alias}'.\n`);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/commands/save.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/commands/save.ts packages/cli/test/commands/save.test.ts
git commit -m "feat(cli): add save command"
```

---

## Task 18: 实现 commands/current.ts

**Files:**
- Create: `packages/cli/src/commands/current.ts`
- Test: `packages/cli/test/commands/current.test.ts`

- [ ] **Step 1: 写失败测试**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/test/commands/current.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/current.js';
import { ConfigDirNotFoundError } from '../../src/errors.js';

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
});

describe('current command', () => {
  it('throws ConfigDirNotFoundError when missing', async () => {
    process.env.CLAUDE_CONFIG_DIR = '/nonexistent/path/12345';
    const io = { stdout: { write: () => {} } };
    await expect(run(io as never)).rejects.toBeInstanceOf(ConfigDirNotFoundError);
  });

  it('prints summary', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({
        env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_MODEL: 'claude-sonnet-4' },
        mcpServers: { foo: {} },
      }),
    );
    const writes: string[] = [];
    const io = { stdout: { write: (s: string) => writes.push(s) } };

    await run(io as never);

    const out = writes.join('');
    expect(out).toContain('Source: default');
    expect(out).toContain('Base URL: https://x');
    expect(out).toContain('Model: claude-sonnet-4');
    expect(out).toContain('MCP servers: yes');
  });

  it('omits missing fields', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');
    const writes: string[] = [];
    const io = { stdout: { write: (s: string) => writes.push(s) } };

    await run(io as never);

    const out = writes.join('');
    expect(out).toContain('Source: default');
    expect(out).not.toContain('Base URL');
    expect(out).not.toContain('Model');
    expect(out).toContain('MCP servers: no');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test test/commands/current.test.ts
```

预期：FAIL。

- [ ] **Step 3: 实现 `commands/current.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/commands/current.ts`：

```ts
import { getConfigDir } from '../config.js';
import { summarize } from '../display.js';

export interface CurrentIO {
  stdout: { write(s: string): unknown };
}

export async function run(io: CurrentIO): Promise<void> {
  const s = await summarize(getConfigDir());
  const lines: string[] = [];
  lines.push(`Source: ${s.source} (${s.sourcePath})`);
  if (s.baseUrl) lines.push(`Base URL: ${s.baseUrl}`);
  if (s.model) lines.push(`Model: ${s.model}`);
  lines.push(`MCP servers: ${s.hasMcp ? 'yes' : 'no'}`);
  io.stdout.write(lines.join('\n') + '\n');
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/commands/current.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/commands/current.ts packages/cli/test/commands/current.test.ts
git commit -m "feat(cli): add current command"
```

---

## Task 19: 实现 cli.ts（commander 装配）

**Files:**
- Create: `packages/cli/src/cli.ts`

本任务无独立单元测试，端到端测试在 Task 20 覆盖。

- [ ] **Step 1: 写 `cli.ts`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/src/cli.ts`：

```ts
#!/usr/bin/env node
import { Command } from 'commander';
import { log } from './logger.js';
import { toExitCode } from './exit.js';
import { AppError } from './errors.js';
import * as listCmd from './commands/list.js';
import * as switchCmd from './commands/switch.js';
import * as restoreCmd from './commands/restore.js';
import * as saveCmd from './commands/save.js';
import * as currentCmd from './commands/current.js';

const program = new Command();
program
  .name('llm-switch')
  .description('Switch Claude Code settings.json profiles from the command line')
  .version('0.1.0');

program
  .command('list')
  .description('List available profiles')
  .action(async () => {
    await listCmd.run({ stdout: process.stdout });
  });

program
  .command('switch [alias]')
  .description('Switch to a profile (interactive if no alias given)')
  .action(async (alias?: string) => {
    await switchCmd.run({
      alias,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: Boolean(process.stdout.isTTY),
    });
  });

program
  .command('restore')
  .description('Restore from the most recent backup')
  .action(async () => {
    await restoreCmd.run({ stdout: process.stdout });
  });

program
  .command('save [alias]')
  .description('Save current settings.json as a named profile')
  .action(async (alias?: string) => {
    await saveCmd.run({
      alias,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      isTTY: Boolean(process.stdout.isTTY),
    });
  });

program
  .command('current')
  .description('Show the current active profile')
  .action(async () => {
    await currentCmd.run({ stdout: process.stdout });
  });

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      log.error(`Error: ${err.message}`);
    } else if (err instanceof Error) {
      log.error(`Unexpected error: ${err.message}`);
    } else {
      log.error('Unexpected error');
    }
    process.exit(toExitCode(err));
  }
}

main();
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm typecheck
```

预期：无错误。

- [ ] **Step 3: 提交**

```bash
git add packages/cli/src/cli.ts
git commit -m "feat(cli): wire up commander with all 5 subcommands"
```

---

## Task 20: 端到端测试（spawn bin）

**Files:**
- Create: `packages/cli/test/cli.test.ts`

- [ ] **Step 1: 写测试**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/cli/test/cli.test.ts`：

```ts
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const BIN = path.resolve(__dirname, '../bin/llm-switch.js');

interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function run(args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [BIN, ...args], {
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

describe('cli e2e', () => {
  let tmpDir: string;

  beforeAll(async () => {
    // ensure dist exists; build synchronously if missing
    try {
      await fs.access(path.resolve(__dirname, '../dist/cli.js'));
    } catch {
      const { execSync } = await import('node:child_process');
      execSync('pnpm build', { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    }
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-e2e-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('prints help with --help', async () => {
    const r = await run(['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('llm-switch');
    expect(r.stdout).toContain('switch');
    expect(r.stdout).toContain('list');
  });

  it('list exits 1 when no profiles', async () => {
    const r = await run(['list'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('No profiles found');
  });

  it('list prints profiles', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.kimi'), '{}');

    const r = await run(['list'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('glm');
    expect(r.stdout).toContain('kimi');
  });

  it('switch <alias> succeeds', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{"a":2}');

    const r = await run(['switch', 'glm'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Switched to glm');

    const after = await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8');
    expect(JSON.parse(after)).toEqual({ a: 2 });

    const bak = await fs.readFile(path.join(tmpDir, 'settings.json.bak'), 'utf8');
    expect(JSON.parse(bak)).toEqual({ a: 1 });
  });

  it('switch <alias> exits 2 when alias missing', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');

    const r = await run(['switch', 'nope'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("not found");
  });

  it('switch exits 0 with user cancel via stdin close (no TTY)', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');

    const r = await run(['switch'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    // No TTY => UserCancelledError => exit 0
    expect(r.code).toBe(0);
  });

  it('restore exits 1 with no .bak', async () => {
    const r = await run(['restore'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('No backup');
  });

  it('save <alias> succeeds', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');

    const r = await run(['save', 'glm'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(0);

    const profile = await fs.readFile(path.join(tmpDir, 'settings.json.glm'), 'utf8');
    expect(JSON.parse(profile)).toEqual({ a: 1 });
  });

  it('current prints summary', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://x' } }),
    );

    const r = await run(['current'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Source: default');
    expect(r.stdout).toContain('Base URL: https://x');
  });
});
```

- [ ] **Step 2: 运行测试（会自动构建 dist）**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
pnpm test test/cli.test.ts
```

预期：全部 PASS。

- [ ] **Step 3: 提交**

```bash
git add packages/cli/test/cli.test.ts
git commit -m "test(cli): add end-to-end cli spawn tests"
```

---

## Task 21: 完整测试 + 构建验证

**Files:** 无新增

- [ ] **Step 1: 运行所有测试**

```bash
cd /Users/xavier/Projects/Github/llm-switch
pnpm test
```

预期：所有测试 PASS。

- [ ] **Step 2: 运行 typecheck**

```bash
cd packages/cli
pnpm typecheck
```

预期：无错误。

- [ ] **Step 3: 构建**

```bash
pnpm build
```

预期：`packages/cli/dist/cli.js` 生成，包含 shebang。

- [ ] **Step 4: 手动 smoke test**

```bash
node packages/cli/bin/llm-switch.js --help
```

预期：输出帮助信息，exit 0。

```bash
mkdir -p /tmp/llm-switch-smoke
CLAUDE_CONFIG_DIR=/tmp/llm-switch-smoke echo '{"a":1}' > /tmp/llm-switch-smoke/settings.json
echo '{"a":2}' > /tmp/llm-switch-smoke/settings.json.glm
CLAUDE_CONFIG_DIR=/tmp/llm-switch-smoke node packages/cli/bin/llm-switch.js switch glm
CLAUDE_CONFIG_DIR=/tmp/llm-switch-smoke node packages/cli/bin/llm-switch.js current
```

预期：
- `switch glm` 打印 `Switched to glm. Restart Claude Code to apply.`
- `current` 打印 `Source: glm (...)`、`MCP servers: no`

- [ ] **Step 5: 清理 smoke test 目录**

```bash
rm -rf /tmp/llm-switch-smoke
```

- [ ] **Step 6: 提交（如有 dist 改动则忽略）**

```bash
git status
# 若 dist 不在 .gitignore 里，加入：
# echo 'packages/cli/dist/' >> .gitignore
# git add .gitignore
git diff --quiet || git add -A && git commit -m "chore: post-build housekeeping" || true
```

---

## Task 22: Claude Code 插件包

**Files:**
- Create: `packages/claude-code-plugin/package.json`
- Create: `packages/claude-code-plugin/.claude-plugin/plugin.json`
- Create: `packages/claude-code-plugin/commands/switch-config.md`

- [ ] **Step 1: 写 `packages/claude-code-plugin/package.json`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/claude-code-plugin/package.json`：

```json
{
  "name": "llm-switch-claude-code-plugin",
  "version": "0.1.0",
  "description": "Claude Code plugin wrapper around the llm-switch CLI",
  "private": true
}
```

- [ ] **Step 2: 写 `packages/claude-code-plugin/.claude-plugin/plugin.json`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/claude-code-plugin/.claude-plugin/plugin.json`：

```json
{
  "name": "llm-switch",
  "version": "0.1.0",
  "description": "Switch Claude Code settings.json profiles via the llm-switch CLI",
  "commands": ["./commands/switch-config.md"]
}
```

- [ ] **Step 3: 写 `packages/claude-code-plugin/commands/switch-config.md`**

写入 `/Users/xavier/Projects/Github/llm-switch/packages/claude-code-plugin/commands/switch-config.md`：

````markdown
---
description: Switch Claude Code settings.json profile
allowed-tools: Bash
---

Switch the active Claude Code settings.json by invoking the `llm-switch` CLI.

If `llm-switch` is not installed, instruct the user to install it first:

> llm-switch is not installed. Install with: `npm i -g llm-switch`

Then run: `llm-switch $ARGUMENTS`

If `$ARGUMENTS` is empty, the CLI will open an interactive menu.
````

- [ ] **Step 4: 验证 monorepo 安装不破坏**

```bash
cd /Users/xavier/Projects/Github/llm-switch
pnpm install
```

预期：无错误。

- [ ] **Step 5: 提交**

```bash
git add packages/claude-code-plugin/
git commit -m "feat(plugin): add claude code plugin wrapper"
```

---

## Task 23: 仓库根 README

**Files:**
- Create: `README.md`

- [ ] **Step 1: 写 README**

写入 `/Users/xavier/Projects/Github/llm-switch/README.md`：

````markdown
# llm-switch

Switch Claude Code `settings.json` profiles from the command line.

## What it does

If you maintain multiple `settings.json.<alias>` files (e.g. `settings.json.glm`, `settings.json.kimi`) in `~/.claude/`, `llm-switch` lets you switch the active `settings.json` with one command. Backups are automatic.

## Install

```bash
npm i -g llm-switch
```

## Usage

```bash
llm-switch list                 # show available profiles
llm-switch switch               # interactive menu
llm-switch switch glm           # switch directly
llm-switch save glm-v2          # save current settings as new profile
llm-switch restore              # restore previous backup
llm-switch current              # show active profile
```

Set `CLAUDE_CONFIG_DIR` to override the default `~/.claude`.

## Claude Code plugin

The `packages/claude-code-plugin/` directory is a Claude Code plugin. Symlink or copy it into `~/.claude/plugins/llm-switch/` to use `/switch-config` inside Claude Code.

## Development

```bash
pnpm install
pnpm test
pnpm build
```

## License

MIT
````

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Task 24: 最终全量验证

**Files:** 无新增

- [ ] **Step 1: 全量测试**

```bash
cd /Users/xavier/Projects/Github/llm-switch
pnpm test
```

预期：所有测试 PASS。

- [ ] **Step 2: 全量构建**

```bash
pnpm build
```

预期：无错误。

- [ ] **Step 3: 检查 git 状态**

```bash
git status
git log --oneline
```

预期：所有改动已提交，工作目录干净。

- [ ] **Step 4: 列出最终文件结构**

```bash
find . -type f \
  -not -path './node_modules/*' \
  -not -path '*/node_modules/*' \
  -not -path '*/dist/*' \
  -not -name 'pnpm-lock.yaml' \
  | sort
```

预期：与"文件结构"章节一致。

---

## 完成标准

- ✅ 所有 24 个 Task 的 checkbox 已勾选
- ✅ `pnpm test` 通过（单元 + 端到端）
- ✅ `pnpm build` 产物 `dist/cli.js` 可独立运行
- ✅ README 描述完整
- ✅ 插件文件齐全
- ✅ 所有改动已 commit

可进入发布阶段（`pnpm publish` 在 `packages/cli/`，插件单独分发）。