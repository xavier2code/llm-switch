# 优化建议清单

本文件整理当前仓库(`llm-switch`)仍可改进的项，按「收益/风险」分级。每条都给出
对应文件与建议方向，便于逐项推进。所有路径相对于仓库根。

> 状态：仅作建议，**未修改代码**。每条标注「建议优先级」，落地时按 P0 → P3 顺序
> 推进即可。

---

## P0 — 安全与数据正确性

### P0-1 `sw switch <alias>` 自动创建分支可能丢失当前 active 配置

- 位置：`packages/cli/src/commands/switch.ts:21-39`、`:74-95`
- 问题：alias 路径走 `autoCreateProfile` 时直接 `writeActive` 覆盖；`autoCreateProfile`
  的"从 active 复制"分支读取的就是 active，`writeActive` 内部的隐式备份会把
  **新内容**写进 `*.bak`，旧 active 不可恢复。
- 建议：
  - 在 `switch` alias 路径进入循环前，对每个 target 先做一次显式 `backupCurrent`
    （或要求 `--force` 才允许 auto-create 覆盖）；
  - 或把 auto-create 行为抽到 `store.copyProfileTo(otherTarget, alias)`，
    `switch` 不再依赖 `writeActive` 内部的隐式备份。

### P0-2 `writeActive` 原子写的失败回滚不完整

- 位置：
  - `packages/cli/src/adapters/anthropic-json-adapter.ts:54-71`
  - `packages/cli/src/adapters/openai-toml-adapter.ts:29-43`
- 问题：`try` 范围只覆盖到 `rename` 之前；`writeFile` 成功但 `chmod`/`rename` 之前
  进程被 SIGKILL 时会留下临时文件，下次启动可能误读。
- 建议：
  - 启动时清理 `.config.*.tmp` / `.settings.*.tmp`（放到 `ensureMigrated`
    或一个 `cleanupStaleTmp` 工具）；
  - 把 `try` 范围扩到 `chmod` 之后。

### P0-3 `restoreBackup` 缺少 fsync

- 位置：`packages/cli/src/backup.ts:17-23`
- 问题：直接 `fs.rename`，不保证数据落盘。
- 建议：用 `fs.open` + `fh.sync()` + `fs.close` + `fs.rename` 显式落盘（CLI 场景
  下影响小，但与 P0-2 一起改可共用一个 `atomicWrite` 工具）。

---

## P1 — 一致性 / 健壮性

### P1-1 迁移逻辑回滚不完整

- 位置：
  - `packages/cli/src/migrate.ts:13-36`（`ensureMigratedToCentralStore`）
  - `packages/cli/src/config.ts:198-225`（`ensureMigrated`）
- 问题：
  - `migrate.ts` 中途失败不回滚，可能让中心 store 与旧 store 一半一半；
  - `config.ts` 的 `ensureMigrated` 在 `rename` 失败时 `rm(llmswitchDir, { recursive: true })`
    会把已经成功迁移的条目也清掉。
- 建议：
  - `migrate.ts` 改为单次 `fs.cp(oldDir, newDir, { recursive: true })` + 校验；
  - `config.ts` 的回滚改为只清理 `profiles/` 与 `backups/` 子目录中尚未迁移完成的文件。

### P1-2 `ensureMigrated` 对"目录已存在"判断过宽

- 位置：`packages/cli/src/config.ts:201`
- 问题：仅检查 `llm-switch/` 存在即跳过；若用户只手动建了空目录，profiles/backups
  子目录可能未建。
- 建议：检查 `profiles/` 与 `backups/` 存在性，或显式 `mkdir({ recursive: true })`
  两个子目录（幂等）。

### P1-3 `display.summarize` 解析失败被吞

- 位置：`packages/cli/src/display.ts`、`packages/cli/src/commands/current.ts`
- 问题：`sw current` 在 settings.json 损坏时可能静默成功但输出空字段。
- 建议：解析失败时打一行 warning 并退到基础信息（路径、MCP yes/no）。

### P1-4 `state.json` 写不原子

- 位置：`packages/cli/src/state/state-manager.ts:33-37`
- 问题：直接 `writeFile` 覆盖；`init` 与 `switch` 并发可能损坏 state。
- 建议：抽 `atomicWriteJson(path, obj)` 工具（与 P0-2 共用），state.json 走 tmp + rename。

---

## P2 — CLI 体验

### P2-1 `sw switch <alias>` 不提示 auto-create 来源

- 位置：`packages/cli/src/commands/switch.ts:21-39`、`:74-95`
- 问题：`Auto-created ...` 写到 stderr，且只在触发时打一行；用户不容易看到"自己
  隐式创建了某 profile"。
- 建议：
  - 加 `--dry-run`：打印将要做的事（含 auto-create 来源）；
  - 把"auto-create from X"挪到 stdout；
  - 行为日志与 `sw list` 输出对齐，避免出现不期望的 profile。

### P2-2 `save` 的 overwrite 提示对每个 target 重复询问

- 位置：`packages/cli/src/commands/save.ts:50-61`
- 问题：多 target 场景下每个 target 都问一次 Overwrite。
- 建议：合并为一次"对所有选中 target 应用吗?"，或只在第一个 target 询问，
  其余沿用。

### P2-3 `create` 缺少非交互模式

- 位置：`packages/cli/src/commands/create.ts`
- 问题：当前非 TTY 场景直接退出 0；CI/脚本无法批量创建 profile。
- 建议：加 `--provider/--alias/--base-url/--model/--api-key`；key 推荐
  `--api-key-env <NAME>`，避免 shell history 泄露。

### P2-4 `init` 的警告缺少后续引导

- 位置：`packages/cli/src/commands/init.ts:88-93`
- 问题：仅打"active config not found" warning。
- 建议：附上"Run `<binary>` once to generate it"与检测到的 binary 路径。

### P2-5 `switch` 在 alias 路径下未做交集检查

- 位置：`packages/cli/src/commands/switch.ts:23-39`
- 问题：TTY 选取走交集（`:97-101`），alias 路径却对每个 target 单独处理，
  行为不对称；auto-create 后部分 target 出现用户没预期的 profile。
- 建议：在 alias 路径下也跑一次交集预检：若该 alias 在多数 target 缺失，
  走交集时是否确认 auto-create。

---

## P3 — 代码组织

### P3-1 `cli.ts` 过于集中（356 行）

- 位置：`packages/cli/src/cli.ts`
- 问题：子命令注册、帮助文本、provider 表、`resolveTargets` 都在同一文件。
- 建议：把每个子命令的 `program.command(...).action(...)` 抽到
  `src/commands/<name>/register.ts`，在 `cli.ts` 只 `registerXxx(program, ctx)`。

### P3-2 两个 adapter 的 `writeActive` 模板重复

- 位置：
  - `packages/cli/src/adapters/anthropic-json-adapter.ts:54-71`
  - `packages/cli/src/adapters/openai-toml-adapter.ts:29-43`
- 建议：抽 `atomicWrite(filePath, content, { tmpPrefix, mode })` 工具，两个 adapter
  共用。

### P3-3 `ProfileStore.listProfiles` 重复序列化

- 位置：`packages/cli/src/store/profile-store.ts:46-65`
- 问题：每个 profile 调一次 `serialize`，active 又调一次。
- 建议：把"读 + 序列化"合并到 adapter（`readProfileRaw` 返回 `{ raw, content }`），
  store 内做 hash 缓存；或加 `serializeCache` 参数。

### P3-4 `config.ts` 单文件过满（230 行）

- 位置：`packages/cli/src/config.ts`
- 建议：拆 `paths.ts`（路径推导）、`alias.ts`（校验）、`migrations/legacy-flat.ts`
  （旧版迁移），`config.ts` 只剩常量。

---

## P4 — 测试 / 质量

### P4-1 `switch` 关键路径覆盖偏弱

- 位置：`packages/cli/test/commands/switch.test.ts`
- 现状：`LF:47 LH:38`（80.8%）。未覆盖：
  - `autoCreateProfile` 的"从 active 复制"分支（正是 P0-1 所在的 bug）；
  - `pickProfileFromIntersection` 多 target 实际过滤；
  - active 写失败的回滚。
- 建议：补 case "已有 active + alias 不存在 → autoCreateProfile 走 active 分支"
  并断言 `*.bak` 持有旧 active。

### P4-2 `save` 非交互 overwrite 分支未测

- 位置：`packages/cli/test/commands/save.test.ts`
- 现状：`LF:68 LH:57`（83.8%），`BRF:14 BRH:11`（78.6%）。
- 建议：补 "exists + 非 TTY + 无 --force" 用例，明确退出码与错误信息。

### P4-3 `create` 的 failure submenu 分支未覆盖

- 位置：`packages/cli/test/commands/create.test.ts`
- 现状：`LF:195 LH:193`，但 submenu 的 `newkey`/`edit` 分支覆盖率低。
- 建议：补 `newkey` / `edit` / 多 family 多 target 的端到端 case。

### P4-4 缺少 `cli.ts` 端到端 smoke test

- 位置：`packages/cli/vitest.config.ts` 显式 `exclude: ['src/cli.ts']`。
- 建议：至少覆盖 `sw --version`、`sw --help`、无效子命令退出码；防止 commander
  注册破坏回归。可以用 `child_process` spawn `bin/sw.js` 或 `dist/cli.js`。

---

## P5 — 文档 / 运维

### P5-1 README 与实际行为存在小偏差

- 位置：`README.md` 中关于 `save` overwrite 段。
- 现状：README 表述"非 TTY overwrite cancel exits 0"与 `save.ts:53-58` 抛
  `UserCancelledError`（被 `main` 当 0 处理）一致，但建议显式写一句"非 TTY
  overwrite cancel exits 0"，避免读者绕弯。
- 建议：在 README 的 "Save overwrite behavior" 段补一行明确说明。

### P5-2 发布流程中 "Plugin sync" 未脚本化

- 位置：`CLAUDE.md` 发布清单第 7 步。
- 建议：加 `pnpm -F llm-switch sync-plugin-version`（读 CLI version → 写
  `packages/claude-code-plugin/package.json` 与 `.claude-plugin/plugin.json`），
  在 `prepublishOnly` 里跑一次。

### P5-3 `bin/llm-switch.js` 与 `bin/sw.js` 是否都必要？

- 位置：`packages/cli/bin/`
- 说明：`tsup` 已为 `dist/cli.js` 注入 shebang，理论上只需一个 bin。建议
  合并为单一 bin，或在 `prepublishOnly` 中检查两者一致。

### P5-4 Dependabot / Renovate 配置

- 位置：`.github/`
- 建议：补 Dependabot（或 Renovate）自动 PR 流程，并在 README "Security" 段
  说明自动升级策略。

---

## 推荐落地顺序

如果只能挑 3 件事先做：

1. **P0-1** `sw switch` auto-create 数据丢失 —— 影响用户配置安全，改动面小。
2. **P0-2 + P3-2 + P1-4** 抽 `atomicWrite` 工具，统一两个 adapter + state.json
   的写入 —— 修一致性、消重。
3. **P4-4** 加 `cli.ts` 端到端 smoke test —— 排除 commander 注册回归风险。

其余条目按团队节奏分批处理即可。

---

## 新整理项（补充）

以下基于最近一次代码走查补充，与上文可能有少量重叠，按主题分类便于并行推进。

### 性能

| 位置 | 问题 | 建议 |
| --- | --- | --- |
| `packages/cli/src/detector.ts:12-34` | `execFileSync` 同步串行检测 3 个工具 | 改为 `execFile` + `Promise.all` 异步并行 |
| `packages/cli/src/migrate.ts:28-33` | 旧 profile 串行复制 | 用 `Promise.all(entries.map(...))` 并发 |
| `packages/cli/src/store/profile-store.ts:42-60` | `listProfiles` 重复序列化所有 profile 算 SHA | 缓存 active 序列化结果，或比较文件 hash |
| `packages/cli/src/commands/switch.ts:83-95` | `autoCreateProfile` 写完后又读盘 | 写完后直接返回 content，避免二次读取 |
| `packages/cli/src/commands/create.ts:130-138` | 多 family API 校验串行 | 独立 family 可 `Promise.all` 并行 |
| `packages/cli/src/backup.ts:31-38` | `isSameContent` 全量读入内存 | 大文件用 SHA 流式比较或复用已有 hash |

### 代码质量

- **Adapter 重复逻辑**：`anthropic-json-adapter.ts` 与 `openai-toml-adapter.ts` 约 80% 逻辑重复（`readActive`/`writeActive`/`readProfile`/`writeProfile`/tmp-rename）。建议抽基类或文件 IO 工具，每个 adapter 只实现 `serialize`/`deserialize` 与扩展名。
- **死代码**：`backup.ts:5` 的 `backupCurrent` 未被引用，可删除或改为统一入口。
- **未接入功能**：`commands/init.ts:98-113` 的 `maybeRunInitWizard` 未在 `cli.ts` 调用。
- **类型断言**：`config.ts:59-63`、`providers.ts:60-64` 用 `as Record<...>` 建查找表，建议用 typed reducer 或 `satisfies`。
- **异常类型**：`store/profile-store.ts:38` 用普通 `Error` 抛“profile 不存在”，建议统一用 `ProfileNotFoundError`。
- **Logger**：`logger.ts` 只暴露 `error`，命令直接写 `stdout`/`stderr`。建议扩展 `info`/`warn` 并统一输出。

### 健壮性 / 错误处理

- `validator.ts:77-100`：`validateOpenAi` 缺少 try/catch，网络/中断错误会裸抛。应像 `validateAnthropic` 一样包成 `ValidationError`。
- Adapter 解析：`anthropic-json-adapter.ts:39-57` / `openai-toml-adapter.ts:38-55` 中 `JSON.parse`/`TOML.parse` 出错会直接崩溃，应捕获并返回 `null` 或 domain error。
- `backup.ts:31-38`：`isSameContent` 吞掉所有异常，会掩盖权限错误。只应吞 `ENOENT`。
- `state/state-manager.ts:51-58`：`migrateState` 信任持久 JSON 里的 `lastSelectedTargets` 类型，建议用 `isTargetId` 过滤。
- `target-selector.ts:48-55`：checkbox 结果直接 `as TargetId[]`，应逐个校验。
- `commands/create.ts:189-212`：多 target 写入中途失败会部分生效。建议汇总错误报告或失败时回滚已激活项。
- `config.ts:220-228`：迁移 rollback 的 `rename` 失败被静默忽略，至少应打印到 stderr。

### CLI 体验

- `cli.ts:186,221,264,293`：help 示例有 `sw--target opencode ...`（缺空格），应补空格。
- `commands/switch.ts:51-54`：交互模式下 profile 交集为空时只打印通用取消信息，建议明确提示“无共同 profile”。
- `commands/create.ts`：完全 TTY，缺少脚本化参数 `--provider/--alias/--base-url/--model/--api-key`。
- `commands/init.ts:28-31`：`init` 必须 TTY，建议加 `--yes` 自动选择所有检测到的工具。
- `bin/llm-switch.js:3-4`：废弃入口 import promise 悬空，建议 `await` 并处理异常。
- `validator.ts:97-99`：OpenAI 校验返回 `OpenAI API error 401`，建议对齐 Anthropic 的“Invalid API key”提示。
- `commands/restore.ts:21-28`：第一个 target 无 backup 就抛错，应继续处理其余 target。

### 安全

- `detector.ts:17`：Unix 检测用 `sh -c "command -v ${binaryName}"` 做字符串拼接，存在潜在注入风险。建议改为 `sh -c 'command -v "$1"' sh ${binaryName}`。
- `store/profile-store.ts:15` / `state/state-manager.ts:39-44`：中心目录默认权限创建，建议 `0o700`。
- `migrate.ts:29-33`：复制 legacy profile 时保留原权限，可能 world-readable。复制后 `chmod 0o600`。
- `validator.ts:34-35`：Anthropic URL 用字符串拼接 `${baseUrl.replace(/\/$/, '')}/v1/messages`，建议用 `new URL('/v1/messages', baseUrl)`。

### 类型安全

- `commands/create.ts:49,87,89`：`providerByFamily` / `familyConfig` 用 `as Record<TargetFamily, ...>` + 非空断言。建议 typed reducer 消除 `!`。
- `commands/switch.ts:118`：`targets[0]!` 非空断言，建议前置空数组检查。
- `ui.ts:44,63,88,108`：多处 inquirer 结果用 cast，建议用 `isCancel` 或泛型收窄。
- `commands/create.ts:24`：`validateFn?: typeof validateAnthropic` 只绑定一个 validator，实际两种 family 都用，建议定义为 `Record<TargetFamily, ValidatorFn>`。

### 测试覆盖

- `test/commands/switch.test.ts`：未覆盖交互 alias picker、`pickProfileFromIntersection` 与 TTY 路径。
- `test/commands/save.test.ts`：未覆盖无 alias 交互分支、非 TTY overwrite 行为。
- `test/commands/create.test.ts`：缺 mixed-family（anthropic + codex）、损坏 profile、异常 provider 值。
- `test/adapters/*`：缺 corrupt file、missing active config、`writeActive` 失败回滚、backup 创建。
- `test/backup.test.ts`：`backupCurrent` 为死代码，自然也未测。
- `test/state/state-manager.test.ts`：缺损坏 JSON、非法 target id。
- `test/config.test.ts`：缺 `parseProfileAliases`、`assertAlias`、迁移 rollback 失败。
- `test/target-selector.test.ts`：缺取消、非法 checkbox 返回值。
- `test/validator.test.ts`：`validateOpenAi` 只有基础 case，缺 timeout、network error、HTTPS 强制。
- `packages/claude-code-plugin`：无 plugin.json / command markdown 测试。

### 构建 / 依赖

- `packages/cli/package.json:34-38`：完整引入 `@inquirer/prompts`，只用到 `select/input/password/confirm/checkbox`。可替换为独立 `@inquirer/*` 包减少体积。
- `packages/cli/package.json:31`：`prepare` 执行 `git config`，全局安装时无 `.git` 会失败。建议加 `[ -d .git ]` 判断或改为 dev-only 脚本。
- `packages/cli/package.json:32`：`prepublishOnly` 未跑 `typecheck`。建议加入 `typecheck`。
- `packages/cli/tsup.config.ts`：未显式启用 `minify` / `treeshake`，发布包可更小。
- `packages/claude-code-plugin/package.json`：缺 `files`/`main`/`exports` 与构建校验，建议补 plugin.json schema 校验脚本。

### 推荐落地顺序（补充）

1. **安全**：`detector.ts` shell 拼接 + 目录权限 `0o700` + `new URL` 构造。
2. **错误处理**：adapter 解析失败 graceful degradation + `validateOpenAi` try/catch。
3. **可维护性**：抽 `atomicWrite` 工具统一 adapter 写入，顺便删掉 `backupCurrent` 死代码。
4. **CLI 体验**：修 help 示例空格 + `create`/`init` 增加非交互参数。
5. **测试**：补 adapter 错误路径 + `cli.ts` smoke test。
