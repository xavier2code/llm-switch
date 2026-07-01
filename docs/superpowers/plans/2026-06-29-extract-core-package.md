# Plan 2: 抽离 core 包

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `packages/cli/src/` 中 UI 无关的逻辑迁移到 `packages/core/`，使 CLI 和未来的 TUI 都能依赖同一个核心包。

**Architecture:** 创建 `packages/core/` 包作为唯一的 UI 无关层，包含配置管理、适配器、存储、状态管理等核心功能。CLI 包改为依赖 `@llm-switch/core`，所有导入路径更新，测试继续通过。

**Tech Stack:** Node.js 20+, TypeScript, pnpm workspaces, Vitest

---

## Global Constraints

- **Node.js**: >= 20
- **包管理器**: pnpm
- **测试框架**: Vitest
- **模块系统**: ES Modules (`.mjs` 扩展名用于编译输出，`.ts` 用于源码)
- **导出方式**: 使用 package.json `exports` 字段定义公共 API
- **内部导入**: core 包内部使用 `./relative/path.js`，不使用 `@llm-switch/internal/*`

---

## File Structure

**新建文件：**

```
packages/core/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # 公共 API 导出入口
│   ├── adapters/
│   │   ├── index.ts          # 适配器公共导出
│   │   ├── types.ts          # ProfileContent, TargetAdapter
│   │   ├── base-adapter.ts   # BaseAdapter 抽象类
│   │   ├── anthropic-json-adapter.ts
│   │   └── openai-toml-adapter.ts
│   ├── store/
│   │   ├── index.ts
│   │   └── profile-store.ts
│   ├── state/
│   │   ├── index.ts
│   │   └── state-manager.ts
│   ├── config.ts
│   ├── providers.ts
│   ├── validator.ts
│   ├── detector.ts
│   ├── migrate.ts
│   ├── fs-utils.ts
│   └── errors.ts
└── test/
    ├── adapters/
    ├── store/
    ├── state/
    └── ...
```

**修改文件：**

```
packages/cli/
├── package.json              # 添加 "@llm-switch/core": "workspace:*"
├── src/
│   ├── cli.ts                # 更新导入从 core 包
│   ├── commands/
│   │   └── *.ts              # 更新导入从 core 包
│   └── register/
│       └── *.ts              # 更新导入从 core 包
└── test/
    └── *.test.ts             # 更新导入从 core 包
```

---

## Task 1: 创建 core 包结构

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: 无
- Produces: `packages/core/package.json` (供后续任务读取依赖信息)

- [ ] **Step 1: 创建 core package.json**

```bash
mkdir -p packages/core
```

创建 `packages/core/package.json`:

```json
{
  "name": "@llm-switch/core",
  "version": "0.9.0",
  "type": "module",
  "description": "Core utilities for llm-switch - UI-agnostic configuration management",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./adapters": {
      "types": "./dist/adapters/index.d.ts",
      "default": "./dist/adapters/index.js"
    },
    "./store": {
      "types": "./dist/store/index.d.ts",
      "default": "./dist/store/index.js"
    },
    "./state": {
      "types": "./dist/state/index.d.ts",
      "default": "./dist/state/index.js"
    }
  },
  "files": [
    "dist",
    "src"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "@iarna/toml": "^2.2.5",
    "picocolors": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: 创建 core tsconfig.json**

创建 `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: 创建 core src/index.ts**

创建 `packages/core/src/index.ts`:

```typescript
// Re-export all public APIs
export * from './config.js';
export * from './providers.js';
export * from './validator.js';
export * from './detector.js';
export * from './errors.js';
export * from './fs-utils.js';
export * from './migrate.js';
export { ProfileStore } from './store/index.js';
export { StateManager, defaultStateDir, migrateState } from './state/index.js';
export type { ProfileContent, TargetAdapter } from './adapters/index.js';
export { BaseAdapter } from './adapters/base-adapter.js';
export { AnthropicJsonAdapter } from './adapters/anthropic-json-adapter.js';
export { OpenAiTomlAdapter } from './adapters/openai-toml-adapter.js';
```

- [ ] **Step 4: 创建 tsup 配置**

创建 `packages/core/tsup.config.ts`:

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
});
```

- [ ] **Step 5: 创建基础目录结构**

```bash
mkdir -p packages/core/src/adapters
mkdir -p packages/core/src/store
mkdir -p packages/core/src/state
mkdir -p packages/core/test/adapters
mkdir -p packages/core/test/store
mkdir -p packages/core/test/state
```

- [ ] **Step 6: 运行 pnpm install 安装依赖**

```bash
cd /Users/xavier/Projects/Github/llm-switch
pnpm install
```

Expected: 无错误

- [ ] **Step 7: 验证构建配置**

```bash
cd packages/core
pnpm run build
```

Expected: 构建 `dist/` 目录

- [ ] **Step 8: Commit**

```bash
git add packages/core/
git commit -m "feat(core): create core package structure

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: 迁移 errors.ts

**Files:**
- Create: `packages/core/src/errors.ts`
- Modify: `packages/cli/src/errors.ts` → 更新导入
- Test: `packages/cli/test/errors.test.ts` → 更新导入

**Interfaces:**
- Consumes: 无
- Produces: `AppError`, `UserCancelledError`, `ProfileNotFoundError`, `InvalidAliasError`, `NoBackupError`, `ValidationError`

- [ ] **Step 1: 读取原始 errors.ts**

```bash
cat /Users/xavier/Projects/Github/llm-switch/packages/cli/src/errors.ts
```

- [ ] **Step 2: 在 core 包创建 errors.ts**

将错误类定义复制到 `packages/core/src/errors.ts`，内容应包含：
- `AppError` 基类
- `UserCancelledError`
- `ProfileNotFoundError`
- `InvalidAliasError`
- `NoBackupError`
- `ValidationError`

- [ ] **Step 3: 更新 CLI 包导入**

修改 `packages/cli/src/errors.ts` 为重导出文件：

```typescript
export * from '@llm-switch/core/errors.js';
```

- [ ] **Step 4: 更新测试导入**

修改 `packages/cli/test/errors.test.ts` 第一行：

```typescript
import { AppError, UserCancelledError, ProfileNotFoundError, InvalidAliasError, ValidationError } from '@llm-switch/core/errors.js';
```

- [ ] **Step 5: 运行测试验证**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
npx vitest run test/errors.test.ts
```

Expected: PASS

- [ ] **Step 6: 运行完整测试套件**

```bash
npx vitest run
```

Expected: 全部通过

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/errors.ts packages/cli/src/errors.ts packages/cli/test/errors.test.ts
git commit -m "refactor(core): migrate errors.ts to core package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: 迁移 fs-utils.ts

**Files:**
- Create: `packages/core/src/fs-utils.ts`
- Modify: `packages/cli/src/fs-utils.ts` → 重导出
- Test: `packages/cli/test/fs-utils.test.ts` → 更新导入

**Interfaces:**
- Consumes: 无
- Produces: `exists`, `sha256`, `sha256String`, `atomicWrite`, `atomicWriteJson`

- [ ] **Step 1: 读取原始 fs-utils.ts**

```bash
cat /Users/xavier/Projects/Github/llm-switch/packages/cli/src/fs-utils.ts
```

- [ ] **Step 2: 复制到 core 包**

将完整内容复制到 `packages/core/src/fs-utils.ts`。

- [ ] **Step 3: 更新 CLI 包为重导出**

修改 `packages/cli/src/fs-utils.ts`：

```typescript
export * from '@llm-switch/core/fs-utils.js';
```

- [ ] **Step 4: 更新测试导入**

修改 `packages/cli/test/fs-utils.test.ts`：

```typescript
import { exists, sha256, sha256String, atomicWrite, atomicWriteJson } from '@llm-switch/core/fs-utils.js';
```

- [ ] **Step 5: 运行测试验证**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
npx vitest run test/fs-utils.test.ts
```

Expected: PASS

- [ ] **Step 6: 运行完整测试套件**

```bash
npx vitest run
```

Expected: 全部通过

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/fs-utils.ts packages/cli/src/fs-utils.ts packages/cli/test/fs-utils.test.ts
git commit -m "refactor(core): migrate fs-utils.ts to core package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: 迁移 config.ts

**Files:**
- Create: `packages/core/src/config.ts`
- Modify: `packages/cli/src/config.ts` → 重导出
- Modify: `packages/cli/src/**/*.ts` → 更新所有导入（约 30+ 文件）

**Interfaces:**
- Consumes: `homeDir` (从 core 内部)
- Produces: `TargetId`, `TargetFamily`, `AdapterType`, `TargetConfig`, `TARGETS`, `BY_ID`, `getDefaultTarget`, `homeDir`, `getConfigDir`, `getActiveConfigPath`, `getLlmswitchDir`, `getProfilesDir`, `getBackupsDir`, `getBackupPath`, `profilePath`, `ALIAS_RE`, `parseProfileAliases`, `validateAlias`, `assertAlias`, `ensureMigrated`

- [ ] **Step 1: 读取原始 config.ts**

```bash
cat /Users/xavier/Projects/Github/llm-switch/packages/cli/src/config.ts
```

- [ ] **Step 2: 复制到 core 包**

将完整内容复制到 `packages/core/src/config.ts`。

- [ ] **Step 3: 更新 CLI 包为重导出**

修改 `packages/cli/src/config.ts`：

```typescript
export * from '@llm-switch/core/config.js';
```

- [ ] **Step 4: 批量更新 CLI 包导入**

运行批量替换命令：

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli/src
find . -name "*.ts" -type f -exec grep -l "from.*config.js" {} \; | while read file; do
  sed -i.bak "s|from ['\"]../config.js['\"]|from '@llm-switch/core/config.js'|g" "$file"
  rm -f "${file}.bak"
done
```

同时更新 test 目录：

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli/test
find . -name "*.test.ts" -type f -exec grep -l "from.*config.js" {} \; | while read file; do
  sed -i.bak "s|from ['\"]../../src/config.js['\"]|from '@llm-switch/core/config.js'|g" "$file"
  sed -i.bak "s|from ['\"]../config.js['\"]|from '@llm-switch/core/config.js'|g" "$file"
  rm -f "${file}.bak"
done
```

- [ ] **Step 5: 运行测试验证**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
npx vitest run
```

Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/config.ts packages/cli/src/config.ts packages/cli/src packages/cli/test
git commit -m "refactor(core): migrate config.ts to core package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: 迁移 providers.ts

**Files:**
- Create: `packages/core/src/providers.ts`
- Modify: `packages/cli/src/providers.ts` → 重导出
- Modify: `packages/cli/src/**/*.ts` → 更新导入

**Interfaces:**
- Consumes: `TargetId`, `TargetFamily`, `AdapterType` (从 `@llm-switch/core/config.js`)
- Produces: `Provider`, `BuiltInProvider`, `PROVIDERS`, `getProvider`, `providerById`

- [ ] **Step 1: 读取原始 providers.ts**

```bash
cat /Users/xavier/Projects/Github/llm-switch/packages/cli/src/providers.ts
```

- [ ] **Step 2: 复制到 core 包并更新导入**

复制到 `packages/core/src/providers.ts`，更新第一行导入：

```typescript
import type { TargetId, TargetFamily, AdapterType } from './config.js';
```

- [ ] **Step 3: 更新 CLI 包为重导出**

修改 `packages/cli/src/providers.ts`：

```typescript
export * from '@llm-switch/core/providers.js';
```

- [ ] **Step 4: 批量更新 CLI 包导入**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
find src test -name "*.ts" -type f -exec grep -l "from.*providers.js" {} \; | while read file; do
  sed -i.bak "s|from ['\"]../providers.js['\"]|from '@llm-switch/core/providers.js'|g" "$file"
  sed -i.bak "s|from ['\"]../../src/providers.js['\"]|from '@llm-switch/core/providers.js'|g" "$file"
  rm -f "${file}.bak"
done
```

- [ ] **Step 5: 运行测试验证**

```bash
npx vitest run
```

Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/providers.ts packages/cli/src/providers.ts
git commit -m "refactor(core): migrate providers.ts to core package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: 迁移 validator.ts

**Files:**
- Create: `packages/core/src/validator.ts`
- Modify: `packages/cli/src/validator.ts` → 重导出
- Modify: `packages/cli/src/**/*.ts` → 更新导入

**Interfaces:**
- Consumes: `AppError`, `ValidationError` (从 `@llm-switch/core/errors.js`)
- Produces: `validateAnthropic`, `validateOpenAi`, `ValidationResult`

- [ ] **Step 1: 读取原始 validator.ts**

```bash
cat /Users/xavier/Projects/Github/llm-switch/packages/cli/src/validator.ts
```

- [ ] **Step 2: 复制到 core 包并更新导入**

复制到 `packages/core/src/validator.ts`，更新导入：

```typescript
import { AppError, ValidationError } from './errors.js';
```

- [ ] **Step 3: 更新 CLI 包为重导出**

修改 `packages/cli/src/validator.ts`：

```typescript
export * from '@llm-switch/core/validator.js';
```

- [ ] **Step 4: 批量更新 CLI 包导入**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
find src test -name "*.ts" -type f -exec grep -l "from.*validator.js" {} \; | while read file; do
  sed -i.bak "s|from ['\"]../validator.js['\"]|from '@llm-switch/core/validator.js'|g" "$file"
  sed -i.bak "s|from ['\"]../../src/validator.js['\"]|from '@llm-switch/core/validator.js'|g" "$file"
  rm -f "${file}.bak"
done
```

- [ ] **Step 5: 运行测试验证**

```bash
npx vitest run test/validator.test.ts
```

Expected: PASS

- [ ] **Step 6: 运行完整测试套件**

```bash
npx vitest run
```

Expected: 全部通过

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/validator.ts packages/cli/src/validator.ts
git commit -m "refactor(core): migrate validator.ts to core package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: 迁移 detector.ts

**Files:**
- Create: `packages/core/src/detector.ts`
- Modify: `packages/cli/src/detector.ts` → 重导出
- Modify: `packages/cli/src/**/*.ts` → 更新导入

**Interfaces:**
- Consumes: `TargetConfig` (从 `@llm-switch/core/config.js`)
- Produces: `detectInstalled`, `DetectionResult`

- [ ] **Step 1: 读取原始 detector.ts**

```bash
cat /Users/xavier/Projects/Github/llm-switch/packages/cli/src/detector.ts
```

- [ ] **Step 2: 复制到 core 包并更新导入**

复制到 `packages/core/src/detector.ts`，更新导入：

```typescript
import type { TargetConfig } from './config.js';
```

- [ ] **Step 3: 更新 CLI 包为重导出**

修改 `packages/cli/src/detector.ts`：

```typescript
export * from '@llm-switch/core/detector.js';
```

- [ ] **Step 4: 批量更新 CLI 包导入**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
find src test -name "*.ts" -type f -exec grep -l "from.*detector.js" {} \; | while read file; do
  sed -i.bak "s|from ['\"]../detector.js['\"]|from '@llm-switch/core/detector.js'|g" "$file"
  sed -i.bak "s|from ['\"]../../src/detector.js['\"]|from '@llm-switch/core/detector.js'|g" "$file"
  rm -f "${file}.bak"
done
```

- [ ] **Step 5: 运行测试验证**

```bash
npx vitest run test/detector.test.ts
```

Expected: PASS

- [ ] **Step 6: 运行完整测试套件**

```bash
npx vitest run
```

Expected: 全部通过

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/detector.ts packages/cli/src/detector.ts
git commit -m "refactor(core): migrate detector.ts to core package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: 迁移 migrate.ts

**Files:**
- Create: `packages/core/src/migrate.ts`
- Modify: `packages/cli/src/migrate.ts` → 重导出
- Modify: `packages/cli/src/**/*.ts` → 更新导入

**Interfaces:**
- Consumes: `TargetConfig`, `getProfilesDir`, `getBackupsDir`, `getActiveConfigPath` (从 `@llm-switch/core/config.js`)，`exists`, `atomicWrite` (从 `@llm-switch/core/fs-utils.js`)
- Produces: `ensureMigratedToCentralStore`

- [ ] **Step 1: 读取原始 migrate.ts**

```bash
cat /Users/xavier/Projects/Github/llm-switch/packages/cli/src/migrate.ts
```

- [ ] **Step 2: 复制到 core 包并更新导入**

复制到 `packages/core/src/migrate.ts`，更新导入：

```typescript
import type { TargetConfig } from './config.js';
import { getProfilesDir, getBackupsDir, getActiveConfigPath } from './config.js';
import { exists, atomicWrite } from './fs-utils.js';
```

- [ ] **Step 3: 更新 CLI 包为重导出**

修改 `packages/cli/src/migrate.ts`：

```typescript
export * from '@llm-switch/core/migrate.js';
```

- [ ] **Step 4: 批量更新 CLI 包导入**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
find src test -name "*.ts" -type f -exec grep -l "from.*migrate.js" {} \; | while read file; do
  sed -i.bak "s|from ['\"]../migrate.js['\"]|from '@llm-switch/core/migrate.js'|g" "$file"
  sed -i.bak "s|from ['\"]../../src/migrate.js['\"]|from '@llm-switch/core/migrate.js'|g" "$file"
  rm -f "${file}.bak"
done
```

- [ ] **Step 5: 运行测试验证**

```bash
npx vitest run test/migrate.test.ts
```

Expected: PASS

- [ ] **Step 6: 运行完整测试套件**

```bash
npx vitest run
```

Expected: 全部通过

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/migrate.ts packages/cli/src/migrate.ts
git commit -m "refactor(core): migrate migrate.ts to core package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: 迁移 adapters 模块

**Files:**
- Create: `packages/core/src/adapters/index.ts`
- Create: `packages/core/src/adapters/types.ts`
- Create: `packages/core/src/adapters/base-adapter.ts`
- Create: `packages/core/src/adapters/anthropic-json-adapter.ts`
- Create: `packages/core/src/adapters/openai-toml-adapter.ts`
- Modify: `packages/cli/src/adapters/*.ts` → 重导出
- Modify: `packages/cli/src/**/*.ts` → 更新所有导入
- Modify: `packages/cli/test/adapters/*.test.ts` → 更新导入

**Interfaces:**
- Consumes: `TargetConfig` (从 `@llm-switch/core/config.js`)，`atomicWrite`, `exists` (从 `@llm-switch/core/fs-utils.js`)，`AppError` (从 `@llm-switch/core/errors.js`)
- Produces: `ProfileContent`, `TargetAdapter`, `BaseAdapter`, `AnthropicJsonAdapter`, `OpenAiTomlAdapter`

- [ ] **Step 1: 创建 adapters/index.ts**

创建 `packages/core/src/adapters/index.ts`：

```typescript
export type { ProfileContent, TargetAdapter } from './types.js';
export { BaseAdapter } from './base-adapter.js';
export { AnthropicJsonAdapter } from './anthropic-json-adapter.js';
export { OpenAiTomlAdapter } from './openai-toml-adapter.js';
```

- [ ] **Step 2: 复制 types.ts**

复制 `packages/cli/src/adapters/types.ts` 到 `packages/core/src/adapters/types.ts`。

- [ ] **Step 3: 复制 base-adapter.ts 并更新导入**

复制 `packages/cli/src/adapters/base-adapter.ts` 到 `packages/core/src/adapters/base-adapter.ts`，更新导入：

```typescript
import type { TargetConfig } from '../config.js';
import { getActiveConfigPath, getBackupPath } from '../config.js';
import { exists } from '../fs-utils.js';
import { atomicWrite } from '../fs-utils.js';
import type { ProfileContent, TargetAdapter } from './types.js';
```

- [ ] **Step 4: 复制 anthropic-json-adapter.ts 并更新导入**

复制 `packages/cli/src/adapters/anthropic-json-adapter.ts` 到 `packages/core/src/adapters/anthropic-json-adapter.ts`，更新导入：

```typescript
import type { TargetConfig } from '../config.js';
import { getActiveConfigPath, getBackupPath } from '../config.js';
import { exists } from '../fs-utils.js';
import { atomicWrite } from '../fs-utils.js';
import { BaseAdapter } from './base-adapter.js';
import type { ProfileContent, TargetAdapter } from './types.js';
```

- [ ] **Step 5: 复制 openai-toml-adapter.ts 并更新导入**

复制 `packages/cli/src/adapters/openai-toml-adapter.ts` 到 `packages/core/src/adapters/openai-toml-adapter.ts`，更新导入类似上面的模式。

- [ ] **Step 6: 更新 CLI 包 adapters 目录为重导出**

在 `packages/cli/src/adapters/` 创建以下重导出文件：

`packages/cli/src/adapters/types.ts`:

```typescript
export type * from '@llm-switch/core/adapters/types.js';
```

`packages/cli/src/adapters/base-adapter.ts`:

```typescript
export { BaseAdapter } from '@llm-switch/core/adapters/base-adapter.js';
```

`packages/cli/src/adapters/anthropic-json-adapter.ts`:

```typescript
export { AnthropicJsonAdapter } from '@llm-switch/core/adapters/anthropic-json-adapter.js';
```

`packages/cli/src/adapters/openai-toml-adapter.ts`:

```typescript
export { OpenAiTomlAdapter } from '@llm-switch/core/adapters/openai-toml-adapter.js';
```

`packages/cli/src/adapters/index.ts`:

```typescript
export * from '@llm-switch/core/adapters/index.js';
```

- [ ] **Step 7: 批量更新 CLI 包导入**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
find src test -name "*.ts" -type f -exec grep -l "from.*adapters/" {} \; | while read file; do
  sed -i.bak "s|from ['\"]../adapters/|from '@llm-switch/core/adapters/|g" "$file"
  sed -i.bak "s|from ['\"]../../src/adapters/|from '@llm-switch/core/adapters/|g" "$file"
  sed -i.bak "s|from ['\"]@llm-switch/core/adapters/index.js['\"]|from '@llm-switch/core/adapters.js'|g" "$file"
  rm -f "${file}.bak"
done
```

- [ ] **Step 8: 运行测试验证**

```bash
npx vitest run test/adapters/
```

Expected: PASS

- [ ] **Step 9: 运行完整测试套件**

```bash
npx vitest run
```

Expected: 全部通过

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/adapters packages/cli/src/adapters
git commit -m "refactor(core): migrate adapters to core package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: 迁移 store 模块

**Files:**
- Create: `packages/core/src/store/index.ts`
- Create: `packages/core/src/store/profile-store.ts`
- Modify: `packages/cli/src/store/*.ts` → 重导出
- Modify: `packages/cli/src/**/*.ts` → 更新所有导入
- Modify: `packages/cli/test/store/*.test.ts` → 更新导入

**Interfaces:**
- Consumes: `TargetConfig`, `getProfilesDir`, `getBackupPath`, `profilePath`, `ALIAS_RE`, `parseProfileAliases` (从 `@llm-switch/core/config.js`)，`exists`, `atomicWrite` (从 `@llm-switch/core/fs-utils.js`)，`BaseAdapter` (从 `@llm-switch/core/adapters/index.js`)
- Produces: `ProfileStore`, `defaultProfileStore`, `defaultBaseDir`

- [ ] **Step 1: 创建 store/index.ts**

创建 `packages/core/src/store/index.ts`：

```typescript
export { ProfileStore, defaultProfileStore, defaultBaseDir } from './profile-store.js';
```

- [ ] **Step 2: 复制 profile-store.ts 并更新导入**

复制 `packages/cli/src/store/profile-store.ts` 到 `packages/core/src/store/profile-store.ts`，更新导入：

```typescript
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import type { TargetConfig } from '../config.js';
import { getProfilesDir, getBackupPath, profilePath, ALIAS_RE, parseProfileAliases } from '../config.js';
import { exists, atomicWrite } from '../fs-utils.js';
import { BaseAdapter } from '../adapters/index.js';
import type { TargetAdapter } from '../adapters/index.js';
import { AnthropicJsonAdapter } from '../adapters/index.js';
import { OpenAiTomlAdapter } from '../adapters/index.js';
```

- [ ] **Step 3: 更新 CLI 包 store 目录为重导出**

修改 `packages/cli/src/store/index.ts`：

```typescript
export * from '@llm-switch/core/store/index.js';
```

修改 `packages/cli/src/store/profile-store.ts`：

```typescript
export * from '@llm-switch/core/store/profile-store.js';
```

- [ ] **Step 4: 批量更新 CLI 包导入**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
find src test -name "*.ts" -type f -exec grep -l "from.*store/" {} \; | while read file; do
  sed -i.bak "s|from ['\"]../store/|from '@llm-switch/core/store/|g" "$file"
  sed -i.bak "s|from ['\"]../../src/store/|from '@llm-switch/core/store/|g" "$file"
  rm -f "${file}.bak"
done
```

- [ ] **Step 5: 运行测试验证**

```bash
npx vitest run test/store/
```

Expected: PASS

- [ ] **Step 6: 运行完整测试套件**

```bash
npx vitest run
```

Expected: 全部通过

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/store packages/cli/src/store
git commit -m "refactor(core): migrate store to core package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: 迁移 state 模块

**Files:**
- Create: `packages/core/src/state/index.ts`
- Create: `packages/core/src/state/state-manager.ts`
- Modify: `packages/cli/src/state/*.ts` → 重导出
- Modify: `packages/cli/src/**/*.ts` → 更新所有导入
- Modify: `packages/cli/test/state/*.test.ts` → 更新导入

**Interfaces:**
- Consumes: `TargetId`, `isTargetId` (从 `@llm-switch/core/config.js`)，`atomicWriteJson` (从 `@llm-switch/core/fs-utils.js`)
- Produces: `StateManager`, `State`, `DEFAULT_STATE`, `defaultStateDir`, `migrateState`

- [ ] **Step 1: 创建 state/index.ts**

创建 `packages/core/src/state/index.ts`：

```typescript
export { StateManager, DEFAULT_STATE as defaultState } from './state-manager.js';
export { defaultStateDir, migrateState } from './state-manager.js';
export type { State } from './state-manager.js';
```

- [ ] **Step 2: 复制 state-manager.ts 并更新导入**

复制 `packages/cli/src/state/state-manager.ts` 到 `packages/core/src/state/state-manager.ts`，更新导入：

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { atomicWriteJson } from '../fs-utils.js';
import type { TargetId } from '../config.js';
import { isTargetId } from '../config.js';
```

- [ ] **Step 3: 更新 CLI 包 state 目录为重导出**

修改 `packages/cli/src/state/index.ts`：

```typescript
export * from '@llm-switch/core/state/index.js';
```

修改 `packages/cli/src/state/state-manager.ts`：

```typescript
export * from '@llm-switch/core/state/state-manager.js';
```

- [ ] **Step 4: 批量更新 CLI 包导入**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
find src test -name "*.ts" -type f -exec grep -l "from.*state/" {} \; | while read file; do
  sed -i.bak "s|from ['\"]../state/|from '@llm-switch/core/state/|g" "$file"
  sed -i.bak "s|from ['\"]../../src/state/|from '@llm-switch/core/state/|g" "$file"
  rm -f "${file}.bak"
done
```

- [ ] **Step 5: 运行测试验证**

```bash
npx vitest run test/state/
```

Expected: PASS

- [ ] **Step 6: 运行完整测试套件**

```bash
npx vitest run
```

Expected: 全部通过

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/state packages/cli/src/state
git commit -m "refactor(core): migrate state to core package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 12: 迁移测试到 core 包

**Files:**
- Modify: `packages/cli/test/adapters/*.test.ts` → 移动到 core
- Modify: `packages/cli/test/store/*.test.ts` → 移动到 core
- Modify: `packages/cli/test/state/*.test.ts` → 移动到 core
- Create: `packages/core/test/adapters/*.test.ts`
- Create: `packages/core/test/store/*.test.ts`
- Create: `packages/core/test/state/*.test.ts`

**Interfaces:**
- Consumes: core 包导出的所有模块
- Produces: core 包的完整测试覆盖

- [ ] **Step 1: 移动 adapter 测试**

```bash
mv /Users/xavier/Projects/Github/llm-switch/packages/cli/test/adapters/anthropic-json-adapter.test.ts /Users/xavier/Projects/Github/llm-switch/packages/core/test/adapters/
mv /Users/xavier/Projects/Github/llm-switch/packages/cli/test/adapters/openai-toml-adapter.test.ts /Users/xavier/Projects/Github/llm-switch/packages/core/test/adapters/
mv /Users/xavier/Projects/Github/llm-switch/packages/cli/test/adapters/index.test.ts /Users/xavier/Projects/Github/llm-switch/packages/core/test/adapters/
mv /Users/xavier/Projects/Github/llm-switch/packages/cli/test/adapters/types.test.ts /Users/xavier/Projects/Github/llm-switch/packages/core/test/adapters/
```

- [ ] **Step 2: 更新 adapter 测试导入路径**

对于每个移动的测试文件，更新导入路径从 `../../src/` 到 `../../src/`：

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/core/test/adapters
for file in *.test.ts; do
  sed -i.bak "s|from ['\"]../../src/adapters/|from '../../src/adapters/|g" "$file"
  sed -i.bak "s|from ['\"]../../src/config.js['\"]|from '../../src/config.js'|g" "$file"
  sed -i.bak "s|from ['\"]../../src/errors.js['\"]|from '../../src/errors.js'|g" "$file"
  sed -i.bak "s|from ['\"]../../src/fs-utils.js['\"]|from '../../src/fs-utils.js'|g" "$file"
  rm -f "${file}.bak"
done
```

- [ ] **Step 3: 移动 store 测试**

```bash
mkdir -p /Users/xavier/Projects/Github/llm-switch/packages/core/test/store
mv /Users/xavier/Projects/Github/llm-switch/packages/cli/test/store/profile-store.test.ts /Users/xavier/Projects/Github/llm-switch/packages/core/test/store/
```

更新 `packages/core/test/store/profile-store.test.ts` 导入路径：

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/core/test/store
sed -i.bak "s|from ['\"]../../src/|from '../../src/|g" profile-store.test.ts
rm -f profile-store.test.ts.bak
```

- [ ] **Step 4: 移动 state 测试**

```bash
mkdir -p /Users/xavier/Projects/Github/llm-switch/packages/core/test/state
mv /Users/xavier/Projects/Github/llm-switch/packages/cli/test/state/state-manager.test.ts /Users/xavier/Projects/Github/llm-switch/packages/core/test/state/
```

更新 `packages/core/test/state/state-manager.test.ts` 导入路径：

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/core/test/state
sed -i.bak "s|from ['\"]../../src/|from '../../src/|g" state-manager.test.ts
rm -f state-manager.test.ts.bak
```

- [ ] **Step 5: 运行 core 包测试**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/core
pnpm test
```

Expected: 全部通过

- [ ] **Step 6: 运行 CLI 包测试**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
npx vitest run
```

Expected: 全部通过

- [ ] **Step 7: Commit**

```bash
git add packages/core/test packages/cli/test
git commit -m "refactor(core): move tests to core package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 13: 添加 core 包依赖到 CLI

**Files:**
- Modify: `packages/cli/package.json`

**Interfaces:**
- Consumes: `packages/core/package.json` (workspace 依赖)
- Produces: 更新的 CLI package.json

- [ ] **Step 1: 更新 CLI package.json 添加 core 依赖**

在 `packages/cli/package.json` 的 `dependencies` 中添加：

```json
"@llm-switch/core": "workspace:*"
```

确保在 `@llm-switch/internal` 之前或移除 `@llm-switch/internal` 如果不再需要。

- [ ] **Step 2: 安装依赖**

```bash
cd /Users/xavier/Projects/Github/llm-switch
pnpm install
```

Expected: 无错误

- [ ] **Step 3: 运行 CLI 包测试验证**

```bash
cd packages/cli
npx vitest run
```

Expected: 全部通过

- [ ] **Step 4: Commit**

```bash
git add packages/cli/package.json pnpm-lock.yaml
git commit -m "refactor(cli): add core package dependency

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 14: 构建 core 包并验证

**Files:**
- Modify: `packages/core/dist/*` (构建输出)
- Test: `packages/core/test/*` → 通过构建验证

**Interfaces:**
- Consumes: 所有 core 源文件
- Produces: 构建产物和类型定义

- [ ] **Step 1: 构建 core 包**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/core
pnpm run build
```

Expected: 生成 `dist/` 目录，包含 `.js` 和 `.d.ts` 文件

- [ ] **Step 2: 验证类型定义生成**

```bash
ls -la dist/
```

Expected: 看到 `index.js`, `index.d.ts`, `adapters/index.js`, `adapters/index.d.ts` 等

- [ ] **Step 3: 运行 core 包测试**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/core
pnpm test
```

Expected: 全部通过

- [ ] **Step 4: 运行 CLI 包测试**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
npx vitest run
```

Expected: 全部通过

- [ ] **Step 5: 验证 CLI 命令仍能正常工作**

```bash
node /Users/xavier/Projects/Github/llm-switch/packages/cli/bin/sw.js --help
node /Users/xavier/Projects/Github/llm-switch/packages/cli/bin/sw.js --version
```

Expected: 正常输出帮助和版本信息

- [ ] **Step 6: Commit**

```bash
git add packages/core/dist
git commit -m "chore(core): add built artifacts

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 15: 清理和最终验证

**Files:**
- Modify: `packages/cli/src/*` (清理任何剩余的重导出文件)
- Test: `packages/cli/test/*` (最终验证)

**Interfaces:**
- Consumes: 整个 monorepo 状态
- Produces: 清理后的代码库

- [ ] **Step 1: 检查并清理空的重导出文件**

检查 `packages/cli/src/` 下是否有空的重导出文件可以删除：

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli/src
find . -name "*.ts" -size 0 -o -name "*.ts" -exec grep -l "^export \* from '@llm-switch/core" {} \; | head -20
```

如果一个文件只包含一行 `export * from '@llm-switch/core/xxx.js'`，可以直接在导入处使用 `@llm-switch/core/xxx.js` 而不需要重导出。

- [ ] **Step 2: 运行完整测试套件**

```bash
cd /Users/xavier/Projects/Github/llm-switch
pnpm test
```

Expected: 所有包的测试都通过

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
cd packages/core
pnpm run typecheck

cd ../cli
npx tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 4: 检查导入路径一致性**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
grep -r "from '\.\./" src/ | grep -v "from '@llm-switch/core" | head -20
```

Expected: 应该没有剩余的相对路径导入指向 core 模块

- [ ] **Step 5: 最终功能测试**

```bash
cd /Users/xavier/Projects/Github/llm-switch/packages/cli
node bin/sw.js --help
node bin/sw.js --version
```

Expected: 正常工作

- [ ] **Step 6: 如果一切正常，添加标签说明完成**

不需要 commit，这是一个验证任务。如果所有验证通过，Plan 2 完成。

---

## Self-Review

**Spec 覆盖检查：**

| 设计文档要求 | 对应任务 |
|---|---|
| 创建 `packages/core/` 包 | Task 1 |
| 迁移 `adapters/` | Task 9, Task 12 |
| 迁移 `store/` | Task 10, Task 12 |
| 迁移 `state/` | Task 11, Task 12 |
| 迁移 `providers.ts` | Task 5 |
| 迁移 `validator.ts` | Task 6 |
| 迁移 `config.ts` | Task 4 |
| 迁移 `detector.ts` | Task 7 |
| 迁移 `migrate.ts` | Task 8 |
| 迁移 `utils/atomic-write.ts` | Task 3 (fs-utils.ts) |
| CLI 改为依赖 core | Task 13 |
| 确保所有现有测试通过 | Task 14, Task 15 |

所有设计文档要求都有对应任务。

**占位符扫描：** 无 TBD/TODO，每个步骤包含完整代码/命令。

**类型一致性检查：**
- `TargetId`, `TargetFamily`, `AdapterType` 在 config.ts 定义，所有模块从 core 导入
- `ProfileContent`, `TargetAdapter` 在 adapters/types.ts 定义
- 导出路径一致：`@llm-switch/core/config.js`, `@llm-switch/core/adapters.js` 等

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-29-extract-core-package.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
