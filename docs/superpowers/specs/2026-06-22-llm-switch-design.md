# llm-switch 设计文档

**日期**：2026-06-22
**状态**：待用户审核

## 目标

提供一个 Node.js CLI 工具 `llm-switch`，用于在 Claude Code 的全局配置目录中扫描多个备选 `settings.json.<别名>` 配置文件，并一键切换当前的 `settings.json`。同时附带一个 Claude Code 插件，作为 CLI 的薄封装入口。

解决痛点：用户在不同 LLM 提供商（GLM、Kimi、Anthropic 官方等）之间切换 Claude Code 时，需要手动 `cp` 文件。

## 用户故事

1. 作为用户，我在 `~/.claude/` 下维护了 `settings.json.glm` 和 `settings.json.kimi` 两份备选配置，运行 `llm-switch` 后看到列表，输入 `1` 即把当前配置切换到 GLM，无需手动 `cp`。
2. 作为用户，我刚切到了 GLM 想切回去，运行 `llm-switch restore` 就能回到切换前的状态。
3. 作为用户，我在 GLM 配置下微调了几项，想保留为新 profile，运行 `llm-switch save glm-v2` 即生成 `settings.json.glm-v2`。

## 范围

### 包含
- 独立 CLI：`llm-switch`（npm 全局包）
- 5 个子命令：`list`、`switch`、`restore`、`save`、`current`
- 切换前的自动备份（保留最近一份 `.bak`）
- 交互式菜单（编号选择）
- Claude Code 插件：薄封装调用 CLI
- macOS / Linux / Windows 三平台

### 不包含
- 自动重启 Claude Code（切换后由用户手动重启）
- 配置文件的字段级合并/编辑（只做整体切换）
- Web UI / TUI（仅命令行）
- 配置文件历史版本管理（只保留最新一份 `.bak`）

## 架构

### 项目布局（monorepo）

```
llm-switch/                              # monorepo 根
├── package.json                         # workspaces: ["packages/*"]
├── pnpm-workspace.yaml                  # 用 pnpm（速度快、磁盘省）
├── packages/
│   ├── cli/                             # 核心 CLI（npm 包名 llm-switch）
│   │   ├── package.json                 # bin: { "llm-switch": "bin/llm-switch.js" }
│   │   ├── tsconfig.json                # strict, target ES2022, module NodeNext
│   │   ├── tsup.config.ts               # entry src/cli.ts → dist/cli.js（ESM + shebang）
│   │   ├── vitest.config.ts
│   │   ├── bin/
│   │   │   └── llm-switch.js            # #!/usr/bin/env node + require('../dist/cli.js')
│   │   ├── src/
│   │   │   ├── config.ts                # 路径解析
│   │   │   ├── scanner.ts               # 扫描 + 激活判定
│   │   │   ├── backup.ts                # 单文件备份 + 恢复
│   │   │   ├── switcher.ts              # 切换（原子替换）
│   │   │   ├── ui.ts                    # 编号菜单
│   │   │   ├── display.ts               # 当前配置概要
│   │   │   ├── errors.ts                # 自定义错误类
│   │   │   ├── exit.ts                  # 错误 → 退出码映射
│   │   │   ├── schemas.ts               # zod schema（settings.json 形状）
│   │   │   ├── cli.ts                   # commander 装配
│   │   │   └── commands/
│   │   │       ├── list.ts
│   │   │       ├── switch.ts
│   │   │       ├── restore.ts
│   │   │       ├── save.ts
│   │   │       └── current.ts
│   │   └── test/
│   │       ├── *.test.ts                # 与 src 一一对应
│   │       └── commands/*.test.ts
│   └── claude-code-plugin/              # Claude Code 插件
│       ├── package.json                 # name: llm-switch-plugin
│       ├── .claude-plugin/
│       │   └── plugin.json              # name, version, description
│       └── commands/
│           └── switch-config.md         # 内容调起 llm-switch
└── docs/superpowers/specs/
    └── 2026-06-22-llm-switch-design.md  # 本文档
```

### 依赖方向

```
commands/* → switcher / backup / scanner / display / ui
switcher   → backup
其它模块    → config（仅 config 解析路径）
```

无循环依赖。每个模块可在测试中独立喂临时目录。

### 数据流（以 `llm-switch switch glm` 为例）

1. `bin/llm-switch.js` → `dist/cli.js`（tsup 产物）
2. `cli.ts` 用 commander 解析 argv，分发到 `commands/switch.ts`
3. `commands/switch.ts`：
   - 调用 `config.getSettingsPath()` 拿到 `~/.claude/settings.json`
   - 直接进入切换流程（带参数，跳过菜单）
4. `switcher.switchTo('settings.json.glm', settingsPath, backupPath)`：
   - `backup.backupCurrent()` → 当前 settings.json 写入 `.bak`
   - `fs.copyFile(src, tmp)`
   - `fs.rename(tmp, settingsPath)`（原子替换）
5. 打印 `Switched to glm. Restart Claude Code to apply.`

### 关键设计原则

- **原子替换**：用 `fs.rename` 而非 `copyFile + overwrite`，避免半截失败
- **纯函数 + IO 分离**：`scanner`、`backup` 的核心逻辑为纯函数，IO 在外层
- **插件是薄壳**：插件不重复实现任何逻辑，只检测 CLI 是否安装并调用
- **TTY 检测**：管道环境下自动报错，避免 hang

## 技术栈

| 项 | 选择 | 理由 |
|---|---|---|
| 语言 | TypeScript 5.x | 类型安全、与 Claude Code 生态一致 |
| 打包 | tsup | 零配置 ESM 产物、shebang 注入、单文件输出 |
| 子命令 | commander | Node CLI 事实标准、API 稳定 |
| 校验 | zod | 运行时校验 + TS 类型推导一套搞定 |
| 颜色 | picocolors | 极小（<2KB）、tsup 自动 tree-shake |
| 测试 | vitest | 原生 TS、原生 ESM、watch 模式 |
| 包管理 | pnpm workspaces | 速度快、磁盘省、monorepo 标配 |
| Node 版本 | >= 20 | 原生 fetch、`fs/promises` 稳定 |

## 模块接口

### `src/config.ts`
```ts
export type ConfigDir = string & { readonly __brand: 'ConfigDir' };

export function getConfigDir(): ConfigDir;
// 解析 CLAUDE_CONFIG_DIR || ~/.claude，~ 展开

export function getSettingsPath(): string;
// {configDir}/settings.json

export function getBackupPath(): string;
// {configDir}/settings.json.bak
```

### `src/scanner.ts`
```ts
export interface Profile {
  alias: string;
  path: string;
  active: boolean;
}

export function listProfiles(configDir: ConfigDir): Promise<Profile[]>;
// 扫描 {settings.json.*} 排除 .bak，通过 SHA256 判定 active
```

### `src/backup.ts`
```ts
export async function backupCurrent(settingsPath: string, backupPath: string): Promise<void>;
// settings.json 不存在则跳过；存在则覆盖 .bak

export async function restoreBackup(settingsPath: string, backupPath: string): Promise<void>;
// .bak 不存在抛 NoBackupError；否则 rename .bak → settings.json
```

### `src/switcher.ts`
```ts
export async function switchTo(
  sourcePath: string,
  settingsPath: string,
  backupPath: string
): Promise<void>;
// 流程：backup → copyToTmp → rename，任一失败回滚（删 tmp）
```

### `src/ui.ts`
```ts
export function pickProfile(profiles: Profile[]): Promise<Profile | null>;
// readline 编号菜单，空回车或 Ctrl-C → null

export function promptAlias(existing: string[]): Promise<string | null>;
// 询问别名，校验非空、不与 existing 冲突
```

### `src/display.ts`
```ts
export interface CurrentSummary {
  source: string;                 // 匹配到的 alias；若无匹配则为字面量 'default'
  sourcePath: string;             // 匹配时为 settings.json.<alias>，否则为 settings.json
  baseUrl?: string;               // env.ANTHROPIC_BASE_URL
  model?: string;                 // env.ANTHROPIC_MODEL
  hasMcp: boolean;
}

export function summarize(configDir: ConfigDir): Promise<CurrentSummary>;
// 通过 hash 匹配 settings.json 与某个 settings.json.<alias>
```

### 别名规则

`alias` 必须匹配正则 `/^[a-z0-9][a-z0-9._-]{0,63}$/`，即：
- 首字符：小写字母或数字
- 后续字符：小写字母、数字、`.`、`_`、`-`
- 长度：1-64
- 校验失败则报错并退出码 2（参数错误）

该规则同时适用于 `settings.json.<alias>` 文件名与 `save <alias>` / `switch <alias>` 参数。

### `src/errors.ts`
```ts
export class AppError extends Error {
  constructor(message: string, public readonly code: string);
}
export class ConfigDirNotFoundError extends AppError {}
export class NoProfilesError extends AppError {}
export class ProfileNotFoundError extends AppError {}
export class NoBackupError extends AppError {}
export class NoCurrentSettingsError extends AppError {}
export class UserCancelledError extends AppError {}
```

### `src/exit.ts`
```ts
export function toExitCode(err: unknown): number;
// 成功 0；用户取消 0；配置错 1；参数错 2；IO 错 3
```

## 子命令行为

### `llm-switch list`
- 扫描 `settings.json.*`（排除 `.bak`）
- 输出表格：编号 / 别名 / 路径 / 激活状态
- 退出码：成功 0；配置目录不存在 1

### `llm-switch switch [alias]`
- 无参数 → 调用 `ui.pickProfile`，编号选择
- 有参数 → 直接切换到 `settings.json.<alias>`
- 切换流程：备份 → 原子替换 → 打印成功消息
- 退出码：成功 0；用户取消 0；源不存在 2；IO 错 3

### `llm-switch restore`
- `.bak` → `settings.json`（rename）
- `.bak` 不存在 → 报错
- 当前与 `.bak` 内容相同 → 提示已处于备份态，正常退出
- 退出码：成功 0；无备份 1

### `llm-switch save <alias>`
- 当前 `settings.json` → `settings.json.<alias>`
- 目标存在则强制覆盖，stderr 提示
- 退出码：成功 0；当前 settings 不存在 1

### `llm-switch current`
- 打印当前配置概要：来源 / base URL / model / MCP
- 任一字段缺失则该行不打印
- 退出码：成功 0；配置目录不存在 1

## 错误处理

| 错误类型 | 触发条件 | 退出码 |
|---|---|---|
| `ConfigDirNotFoundError` | `CLAUDE_CONFIG_DIR` 不存在或 `~/.claude` 不存在 | 1 |
| `NoProfilesError` | 扫描无候选 | 1 |
| `ProfileNotFoundError` | `switch <alias>` 但文件不存在 | 2 |
| `NoBackupError` | `restore` 但 `.bak` 不存在 | 1 |
| `NoCurrentSettingsError` | `save` / `restore` / `current` 但 `settings.json` 不存在 | 1 |
| `IOError` | 文件系统异常 | 3 |
| `UserCancelledError` | Ctrl-C 或空回车 | 0 |

### 切换中途失败的恢复保证

`switcher.switchTo` 三步必须保证原子性：

```
1. backupCurrent()        失败 → 直接抛错，未改动 settings.json
2. copyToTmp(src, tmp)    失败 → .bak 已更新但 settings.json 没动，下一次切换正常走
3. rename(tmp, settings)  失败 → 删 tmp，下一次切换用最新 .bak
```

关键不变量：**settings.json 永远不会是半截状态**。最坏情况是 `.bak` 更新过、settings.json 仍是旧内容——用户手动 `cp .bak settings.json` 即可恢复。

## Claude Code 插件

`packages/claude-code-plugin/commands/switch-config.md` 内容：

````markdown
---
description: Switch Claude Code configuration profile
allowed-tools: Bash
---

Switch the active Claude Code settings.json by invoking the llm-switch CLI.

!`command -v llm-switch >/dev/null 2>&1 && echo "llm-switch available" || echo "llm-switch NOT installed. Run: npm i -g llm-switch"`

Run: `llm-switch $ARGUMENTS`
````

插件行为：
- `$ARGUMENTS` 透传给 CLI（如 `/switch-config glm` 等价 `llm-switch glm`）
- 不带参数则进入交互菜单
- CLI 缺失时给出安装提示

## 测试策略

### 框架
- vitest，原生 TS + ESM
- CI 输出覆盖率报告，不设门槛

### 测试结构
- 单元测试与源码一一对应：`src/scanner.ts` → `test/scanner.test.ts`
- `ui.ts` 通过注入 `readline.Interface` 抽象测，用 `Readable.from(['2\n'])` 喂输入
- 端到端：`test/cli.test.ts` 用 `child_process.spawn` 启动 `bin/llm-switch.js`

### 隔离模式
每个测试用例 `os.tmpdir() + crypto.randomUUID()` 建独立目录，`afterEach` 清理。

### 关键测试场景
| 模块 | 场景 |
|---|---|
| scanner | `.bak` 不进入列表；SHA256 一致时 active=true |
| backup | settings 不存在时跳过；存在时覆盖 .bak |
| switcher | 全流程正确；中途失败时 tmp 清理、settings 未损坏 |
| commands/switch | 无 TTY 报错而非 hang；用户取消退出码 0、无副作用 |
| commands/list | 空目录提示 |
| cli (e2e) | 5 个子命令各 1 条 happy path + 1 条 error path |

### 不测
- Claude Code 重启后是否生效（手动 smoke test）
- 颜色输出（CI 通常关掉）

## 分发与安装

### CLI
```bash
npm i -g llm-switch
```
- pnpm 构建 `dist/`，`prepublishOnly` 自动跑 `npm run build`
- `package.json` 的 `bin` 指向 `bin/llm-switch.js`（该文件只有一行 require）

### 插件
- **手动安装**（明确步骤）：用户 clone 仓库后，把 `packages/claude-code-plugin/` 软链到 `~/.claude/plugins/llm-switch/`，或在 Claude Code 的 plugins 目录直接放置
- **通过 Claude Code 的插件市场**（如该机制可用）：把插件提交到 Claude Code 插件注册中心。本文档不假设该机制存在，作为可选路径单独说明

## 后续可能扩展（**不在本次范围**）

- 多份备份历史（带 `--keep N` 参数）
- 配置文件字段级合并
- 通过别名直接传参（`llm-switch glm` 已支持；进一步优化菜单体验如 fuzzy finder）
- Hook：切换后自动通知 Claude Code reload
- 自动检测 provider 类型（无需手动命名）

## 待用户确认

本文档需用户审核通过后，再进入 `writing-plans` 阶段生成实施计划。