# Ink TUI 替代 CLI 设计文档

- **日期**：2026-06-26
- **状态**：待实现
- **目标**：将 `llm-switch` 的默认交互从命令行问答升级为 lazygit 风格的终端用户界面（TUI），同时保留脚本化 CLI 路径。

---

## 1. 背景与目标

### 1.1 当前状态

`llm-switch` 当前是基于 Commander.js + `@inquirer/prompts` 的 CLI 工具：

- 运行 `sw` 无参数时进入交互式 target 选择
- 各子命令（`list`、`switch`、`save`、`create`、`restore`、`current`、`init`）以问答形式执行
- profile 集中存储在 `~/.config/llm-switch/`
- active 配置写入各工具原生配置路径时采用**整文件覆盖**策略

### 1.2 目标

- 运行 `sw` 直接进入 Ink TUI 主界面
- TUI 采用 lazygit 风格：Header + 三栏布局 + Footer
- 保留带参数的 CLI 路径：`sw switch glm` 等继续走原命令行逻辑
- 通过本次改造顺带修复 `docs/OPTIMIZATIONS.md` 中影响 TUI 稳定性的底层问题
- **llm-switch 自身配置目录从 `~/.config/llm-switch/` 迁移到 `~/.llm-switch/`，避免污染 `~/.config/` 通用目录**
- **激活 profile 时只 merge 更新必要的字段（baseUrl/apiKey/model），保留目标工具配置文件中的其他用户设置**

---

## 2. 设计决策

### 2.1 入口行为

| 命令 | 行为 |
|---|---|
| `sw` | 启动 Ink TUI |
| `sw <subcommand> [args]` | 走现有 Commander.js CLI 路径 |
| `sw --version` / `sw --help` | 走 CLI 路径 |

实现方式：在 `src/cli.ts` 中先判断 `process.argv` 长度和内容，无有效子命令时启动 TUI。

### 2.2 TUI 布局

```text
┌─────────────────────────────────────────────────────┐
│  Logo / Header                                      │
├──────────┬──────────────────────┬───────────────────┤
│ Targets  │   Profiles           │   Details         │
│ (左侧栏)  │   (中间列表)          │   (右侧面板)       │
├──────────┴──────────────────────┴───────────────────┤
│  Status / Keybindings (底部)                        │
└─────────────────────────────────────────────────────┘
```

- **Header**：显示 `llm-switch` logo 和当前版本
- **左侧栏**：Target 列表（claude / opencode / codex），高亮当前选中
- **中间栏**：当前 target 的 profile 列表，显示别名、提供商、模型、是否激活
- **右侧面板**：选中 profile 的详情（BASE_URL、模型、API key 脱敏显示）
- **底部**：根据焦点面板动态显示快捷键

### 2.3 交互方式

**导航**：Vim 风格

- `j/k`：上下移动
- `h/l` 或 `Tab/Shift+Tab`：左右切换面板焦点
- `/`：搜索/过滤 profile
- `q` / `Ctrl+C`：退出

**操作**：lazygit 风格快捷键

- `Enter`：切换为当前 profile
- `s`：保存当前 active 配置为新 profile
- `c`：创建新 profile
- `d`：删除选中 profile
- `r`：恢复 backup
- `?`：显示快捷键帮助

底部 keybindings 根据当前焦点面板动态变化。

### 2.4 配置目录与激活策略

#### 配置目录

llm-switch 自身的所有数据统一放到 `~/.llm-switch/` 下：

```text
~/.llm-switch/
├── profiles/
│   ├── claude/           # Claude Code profiles
│   ├── opencode/         # OpenCode profiles
│   └── codex/            # Codex profiles
├── backups/              # 各 target active 配置备份
└── state.json            # 用户上次选择的 target
```

- 启动时若 `~/.llm-switch/` 不存在，自动创建（权限 `0o700`）
- 子目录 `profiles/`、`backups/` 按需创建（权限 `0o700`）
- 所有 profile 与 backup 文件权限为 `0o600`

#### 激活策略（Merge 而非 Replace）

切换 profile 时，读取 `~/.llm-switch/profiles/<target>/<alias>.json`，然后将以下字段 **merge** 进目标工具现有配置文件：

| Target | 更新字段 |
|---|---|
| Claude Code (`~/.claude/settings.json`) | `env.ANTHROPIC_BASE_URL`、`env.ANTHROPIC_MODEL`、`env.ANTHROPIC_AUTH_TOKEN`、`providerId` |
| OpenCode (`~/.config/opencode/opencode.json`) | `env.ANTHROPIC_BASE_URL`、`env.ANTHROPIC_MODEL`、`env.ANTHROPIC_AUTH_TOKEN`、`providerId` |
| Codex (`~/.codex/config.toml`) | `model`、`base_url`、`api_key`、`providerId` |

规则：

- 保留目标工具配置文件中除上述字段外的所有其他用户设置（如 MCP、theme、ignore 等）
- 若目标工具配置文件不存在，创建一个新文件，只包含 profile 中的相关字段
- 备份在 merge 前创建，backup 内容为 merge 前的完整文件
- 序列化时保持原有缩进/格式（JSON 保持 `null, 2`，TOML 由 `@iarna/toml` 处理）

---

## 3. 架构设计

### 3.1 最终包结构

```text
packages/
├── core/                    # 新增：UI 无关的领域逻辑
│   ├── src/
│   │   ├── adapters/        # anthropic-json / openai-toml 适配器
│   │   ├── store/           # profile 集中存储
│   │   ├── state/           # 用户选择状态
│   │   ├── providers.ts     # 内置 LLM 提供商
│   │   ├── validator.ts     # API 配置验证
│   │   ├── config.ts        # 路径与 target 配置
│   │   ├── detector.ts      # CLI 工具检测
│   │   ├── migrate.ts       # 配置迁移
│   │   └── utils/           # atomicWrite 等工具
│   └── test/
├── cli/                     # 保留命令行入口
│   ├── src/
│   │   ├── cli.ts           # 入口分发
│   │   ├── commands/        # 各 CLI 子命令
│   │   └── register/        # 子命令注册
│   └── test/
└── tui/                     # 新增：Ink TUI
    ├── src/
    │   ├── app.tsx          # TUI 根组件
    │   ├── components/      # Header/Sidebar/List/Detail/Footer
    │   ├── hooks/           # useProfiles/useTargets/useKeybindings
    │   ├── screens/         # 各屏幕（主界面、创建向导、帮助）
    │   └── index.tsx        # TUI 启动入口
    └── test/
```

### 3.2 依赖关系

```text
     CLI ──→ core
     TUI ──→ core
     CLI ←── no dependency ──→ TUI
```

- `core` 不依赖任何 UI 库
- `cli` 和 `tui` 都依赖 `core`
- `cli` 和 `tui` 互不依赖

---

## 4. 实施阶段

### 阶段 0：底层修复与架构准备

在引入 TUI 之前，必须先修复 `docs/OPTIMIZATIONS.md` 中影响 TUI 稳定性的问题。

#### 任务组 A：底层数据安全与写入一致性

| 编号 | 任务 | 关键文件 | 依赖 |
|---|---|---|---|
| A-1 | 抽取 `atomicWrite` 工具 | `src/utils/atomic-write.ts` | 无 |
| A-2 | 修复 `writeActive` 原子写失败回滚 | `src/adapters/*-adapter.ts` | A-1 |
| A-3 | `restoreBackup` 增加 fsync | `src/backup.ts` | 建议复用 A-1 |
| A-4 | `state.json` 原子写入 | `src/state/state-manager.ts` | A-1 |
| A-5 | 修复 `switch` auto-create 丢失 active | `src/commands/switch.ts` | A-1 |
| A-6 | 抽 adapter 公共基类 | `src/adapters/base.ts` | A-1 |
| A-7 | 目录权限 `0o700`，文件 `0o600` | `src/store/*`、`src/state/*`、`src/migrate.ts` | 无 |
| A-8 | 配置目录从 `~/.config/llm-switch/` 迁移到 `~/.llm-switch/` | `src/config.ts`、`src/migrate.ts` | 无 |
| A-9 | `writeActive` 从整文件覆盖改为 merge 更新 | `src/adapters/*-adapter.ts` | A-1/A-6 |

#### 任务组 B：CLI 结构与命令体验

| 编号 | 任务 | 关键文件 | 依赖 |
|---|---|---|---|
| B-1 | 拆分 `cli.ts` 子命令注册 | `src/cli.ts`、`src/commands/*/register.ts` | 无 |
| B-2 | 修复迁移逻辑回滚不完整 | `src/migrate.ts`、`src/config.ts` | 建议等 A-1 |
| B-3 | 修复 `ensureMigrated` 目录判断 | `src/config.ts` | 无 |
| B-4 | `create` 增加非交互参数 | `src/commands/create.ts` | 无 |
| B-5 | `init` 增加 `--yes` 自动模式 | `src/commands/init.ts` | 无 |
| B-6 | 扩展 logger（info/warn/error） | `src/logger.ts` | 无 |
| B-7 | 修复 help 示例空格、错误提示文案 | `src/cli.ts`、`src/validator.ts` | 无 |

#### 任务组 C：测试覆盖与发布质量

| 编号 | 任务 | 关键文件 | 依赖 |
|---|---|---|---|
| C-1 | 增加 `cli.ts` smoke test | `test/cli.smoke.test.ts` | 无 |
| C-2 | 补齐 `switch` auto-create 测试 | `test/commands/switch.test.ts` | A-5 |
| C-3 | 补齐 `save` 非交互 overwrite 测试 | `test/commands/save.test.ts` | A-1/A-2 |
| C-4 | 补齐 `create` failure submenu 测试 | `test/commands/create.test.ts` | B-4 |
| C-5 | 补齐 adapter 错误路径测试 | `test/adapters/*.test.ts` | A-2/A-6 |
| C-6 | plugin 版本同步脚本化 | `packages/claude-code-plugin/package.json` | 无 |
| C-7 | 合并 `bin/llm-switch.js` 与 `bin/sw.js` | `packages/cli/bin/` | 无 |

**A-1 完成后的并行策略**：

- A 组其余任务可并行推进
- B 组大部分任务可与 A 组并行
- C 组中 C-1/C-6/C-7 可并行，C-2/C-3/C-4/C-5 需等待对应功能修复

### 阶段 1：抽离 core 包

将 `packages/cli/src/` 中 UI 无关的逻辑迁移到 `packages/core/`：

1. 创建 `packages/core/` 包
2. 迁移 `adapters/`、`store/`、`state/`、`providers.ts`、`validator.ts`、`config.ts`、`detector.ts`、`migrate.ts`、`utils/atomic-write.ts`
3. 将领域错误改为 domain error 类型
4. CLI 改为依赖 `core`
5. 确保迁移逻辑支持从旧 `~/.config/llm-switch/` 到新 `~/.llm-switch/` 的迁移
6. 确保所有现有测试通过

### 阶段 2：引入 Ink TUI

1. 创建 `packages/tui/` 包
2. 实现基础布局组件（Header、Sidebar、ProfileList、DetailPanel、Footer）
3. 实现状态管理和键盘路由
4. 实现核心操作：切换、保存、创建、删除、恢复
5. 修改 `packages/cli/src/cli.ts`：无参数时启动 TUI
6. 添加 TUI 测试（组件快照 + 键盘事件 + 端到端 smoke）
7. 更新 README 和插件文档

---

## 5. TUI 组件设计

### 5.1 组件清单

| 组件 | 职责 |
|---|---|
| `App` | 根组件，管理全局状态和路由 |
| `Header` | 显示 logo、版本、当前 target |
| `TargetSidebar` | 左侧 target 列表 |
| `ProfileList` | 中间 profile 列表，支持搜索高亮 |
| `DetailPanel` | 右侧 profile 详情 |
| `Footer` | 底部快捷键提示 |
| `CreateWizard` | 创建新 profile 的弹窗/屏幕 |
| `ConfirmDialog` | 删除/覆盖确认弹窗 |
| `HelpScreen` | 快捷键帮助 |

### 5.2 状态管理

使用 React Context + `useReducer`：

```typescript
type TuiState = {
  targets: TargetId[];
  selectedTargetId: TargetId;
  profiles: ProfileSummary[];
  selectedProfileIndex: number;
  activeProfileAlias: string | null;
  focus: 'target' | 'profile' | 'detail';
  searchQuery: string;
  modal: null | 'create' | 'confirm-delete' | 'help';
  statusMessage: string;
};
```

### 5.3 与 core 的交互

TUI 不直接读写文件，所有操作通过 `core` 包的函数完成：

```typescript
import { listProfiles, switchProfile, saveProfile, createProfile, deleteProfile, restoreBackup } from '@llm-switch/core';
```

---

## 6. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| TUI 导致启动变慢 | 中 | 延迟加载 Ink，CLI 路径不受影响；首次启动可显示 splash |
| 终端不支持 TUI | 中 | 检测非 TTY / CI 环境时自动降级为 CLI |
| 配置写入 bug 在 TUI 中放大 | 高 | 阶段 0 先修复 atomicWrite、switch auto-create 等问题 |
| 整文件覆盖丢失用户其他设置 | 高 | 改为 merge 更新，只改 baseUrl/apiKey/model/providerId |
| TUI 测试不稳定 | 中 | 使用 `ink-testing-library`，聚焦组件行为而非渲染像素 |
| 插件 `/switch-config` 失效 | 中 | 插件继续调用带参数的 CLI 路径，不进入 TUI |

---

## 7. 测试策略

### 7.1 单元测试

- `core`：所有 store/adapter/validator 函数必须有单元测试
- `tui`：组件使用 `ink-testing-library` 测试渲染和键盘交互

### 7.2 集成测试

- CLI 端到端 smoke test：`sw --version`、`sw --help`、无效命令退出码
- TUI 端到端：启动 TUI、切换 target、切换 profile、创建 profile

### 7.3 回归测试

- 保留所有现有 `packages/cli/test/` 测试
- 每次重构后确保 `sw switch`、`sw save`、`sw create` 行为不变

---

## 8. 文档更新

- `README.md`：更新使用说明，增加 TUI 截图/动画
- `CHANGELOG.md`：记录 TUI 引入和底层修复
- `CLAUDE.md`：如有需要更新发布流程
- `packages/claude-code-plugin/README.md`：说明插件仍使用 CLI 路径

---

## 9. 验收标准

- [ ] 运行 `sw` 进入 lazygit 风格 TUI
- [ ] 运行 `sw switch <alias>` 仍走 CLI 路径
- [ ] TUI 内可完成：切换 profile、保存、创建、删除、恢复
- [ ] 所有现有 CLI 测试通过
- [ ] TUI 核心组件有单元测试覆盖
- [ ] `docs/OPTIMIZATIONS.md` 中 P0/P1 级别问题已修复
- [ ] llm-switch 自身数据目录位于 `~/.llm-switch/`，不污染 `~/.config/`
- [ ] 切换 profile 时只 merge 更新必要字段，保留目标工具的其他用户设置
- [ ] `core` 包不依赖任何 UI 库
- [ ] README 已更新
