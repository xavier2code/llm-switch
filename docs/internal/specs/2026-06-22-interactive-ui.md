# llm-switch 交互 UI 改造设计

**日期**：2026-06-22
**状态**：待用户审核

## 目标

将 `llm-switch switch` 和 `llm-switch save` 的交互方式从"输入数字"改为"键盘箭头选择 + 回车确认"，`llm-switch list` 保持只读但美化输出。提升工具的易用性与现代 CLI 一致性。

解决痛点：当前菜单需要打字 `1` `2` `3`，既慢又不符合现代 CLI 习惯（参考 `gh`、`npm`、Claude Code 自身的菜单风格）。

## 用户故事

1. 作为用户，运行 `llm-switch switch` 后看到箭头菜单，当前激活项已预选，按上下键移动、回车确认，无需打字。
2. 作为用户，运行 `llm-switch save` 后看到现有别名列表 + "+ Create new" 项，选已有则快速覆盖保存，选 "+ Create new" 进入输入框。
3. 作为用户，运行 `llm-switch list` 看到清晰的表格，`●` 标识当前激活项，底部有提示引导使用 switch。

## 范围

### 包含
- 用 `@inquirer/prompts` 重写 `src/ui.ts`
- `pickProfile` → inquirer `select`
- `promptAlias` → inquirer `select`（含 "+ Create new" 选项 + 链式 `input`）
- 新增 `promptNewAlias` → inquirer `input`
- `commands/list.ts` 输出美化（不改交互）
- TTY 检测保持原行为（非 TTY → exit 0 取消）
- 测试用 `vi.mock('@inquirer/prompts')` 拦截

### 不包含
- 配置文件字段级合并/编辑
- Fuzzy finder（保持 `select` 列表形式，不引入搜索）
- 多选模式（switch 永远单选）
- `restore` / `current` 命令（无交互）
- list 改为可交互（保持只读）

## 架构

### 实现方式

**替换 `src/ui.ts` 内部实现**，保留公开接口。

```
src/ui.ts (重写)
  ├── import { select, input, isCancel } from '@inquirer/prompts';
  ├── pickProfile(profiles)    → select + isCancel 处理
  ├── promptAlias(existing)    → select + 链式 input
  └── promptNewAlias(existing) → input + 校验
```

`commands/*.ts` 零改动。`ui.ts` 是所有交互 UI 的唯一抽象边界。

### 依赖方向

```
commands/* → ui (pickProfile / promptAlias)
ui         → @inquirer/prompts
```

### 数据流

```
llm-switch switch (no alias)
  → cli.ts 调用 switchCmd.run({ isTTY, ... })
  → switchCmd.run 调用 pickProfile(profiles)
  → pickProfile 调用 @inquirer/prompts.select
  → 用户按上下/回车
  → 返回 Profile | null
  → switchTo(sourcePath, ...) 完成切换

llm-switch save (no alias)
  → cli.ts 调用 saveCmd.run({ isTTY, ... })
  → saveCmd.run 调用 promptAlias(profiles.map(p=>p.alias))
  → promptAlias 调 @inquirer/prompts.select
  → 用户选已有别名 → 直接返回
  → 用户选 "+ Create new" → 调 promptNewAlias
  → promptNewAlias 调 @inquirer/prompts.input
  → 校验返回 alias
  → fs.copyFile(settings, settings.json.alias)
```

### 关键设计原则

- **抽象边界稳定**：`ui.ts` 公开接口不变，命令层无感知
- **测试可拦截**：`vi.mock('@inquirer/prompts')` 完全控制返回值，无需真实 TTY
- **TTY 失败安全**：非 TTY 环境抛 `UserCancelledError`，与现有交互失败语义一致
- **零配置默认**：用户进 `switch` 菜单时，当前激活项已预选（无需多按一次回车）

## 技术栈变化

新增依赖：
- `@inquirer/prompts` — 现代交互 prompt 库（与 `@inquirer/core` 配套）

保持依赖：
- `picocolors`（仍在 list 输出使用）
- `commander`、`zod` 不变

## 模块接口

### `src/ui.ts`（重写）

```ts
import type { Readable, Writable } from 'node:stream';
import type { Profile } from './scanner.js';
import { ALIAS_RE } from './config.js';

export interface ReadlineIO {
  input: Readable;
  output: Writable;
}

function ensureTTY(isTTY: boolean): void {
  if (!isTTY) {
    throw new UserCancelledError(
      'Interactive mode requires a TTY. Use: llm-switch <alias>',
    );
  }
}

export async function pickProfile(
  profiles: Profile[],
  _io?: ReadlineIO,
): Promise<Profile | null> {
  ensureTTY(process.stdout.isTTY);
  if (profiles.length === 0) return null;

  const active = profiles.find((p) => p.active);
  const result = await select({
    message: 'Select profile to switch to:',
    choices: profiles.map((p) => ({
      name: p.alias,
      value: p,
    })),
    default: active,  // 预选当前激活项
  });

  if (isCancel(result)) return null;
  return result;
}

export async function promptAlias(
  existing: string[],
  _io?: ReadlineIO,
): Promise<string | null> {
  ensureTTY(process.stdout.isTTY);

  // 空列表：直接走 input 模式
  if (existing.length === 0) {
    return promptNewAlias(existing);
  }

  const NEW_SENTINEL = Symbol('__create_new');
  const result = await select({
    message: 'Choose a profile name:',
    choices: [
      ...existing.map((name) => ({ name, value: name })),
      { name: '+ Create new', value: NEW_SENTINEL },
    ],
  });

  if (isCancel(result)) return null;
  if (result === NEW_SENTINEL) {
    return promptNewAlias(existing);
  }
  return result;
}

export async function promptNewAlias(
  existing: string[],
  _io?: ReadlineIO,
): Promise<string | null> {
  ensureTTY(process.stdout.isTTY);

  const result = await input({
    message: 'New alias name:',
    validate: (value) => {
      const trimmed = value.trim();
      if (!trimmed) return 'Required';
      if (!ALIAS_RE.test(trimmed)) {
        return `Must match ${ALIAS_RE} (lowercase, digits, . _ -, 1-64 chars)`;
      }
      if (existing.includes(trimmed)) {
        return `Alias '${trimmed}' already exists`;
      }
      return true;
    },
  });

  if (isCancel(result)) return null;
  return result.trim();
}
```

### `src/commands/list.ts`（输出美化）

仅修改输出格式字符串，函数签名不变：

```ts
const lines = [
  'Available profiles:',
  '',
];
profiles.forEach((p) => {
  const marker = p.active ? '●' : '○';
  const tag = p.active ? ' (active)' : '';
  lines.push(`  ${marker} ${p.alias}${tag.padEnd(14)} ${p.path}`);
});
lines.push('');
lines.push('Use `llm-switch switch` to change active profile.');
```

保留抛 `NoProfilesError` 的行为。

## 子命令行为

### `llm-switch switch`（不带 alias）

- TTY 正常 → inquirer `select`，当前激活项预选
- 用户 Enter 选中 → 切换
- 用户 Ctrl-C → 抛 `UserCancelledError`，exit 0
- 无 TTY → 抛 `UserCancelledError`，exit 0

### `llm-switch save`（不带 alias）

- TTY 正常 → inquirer `select`，选项为：现有别名列表 + "+ Create new"
- 选已有别名 → 直接保存（已有别名则 stderr 提示 Overwrote）
- 选 "+ Create new" → inquirer `input`
  - 校验：非空 + 合法格式 + 不与 existing 冲突
  - 校验失败：inquirer 在原位提示，用户重新输入
  - Ctrl-C → 取消，exit 0
- 无 TTY → 抛 `UserCancelledError`，exit 0

### `llm-switch list`

只读，输出格式美化：

```
Available profiles:

  ● glm        (active)   /Users/x/.claude/settings.json.glm
  ○ kimi                   /Users/x/.claude/settings.json.kimi
  ○ claude                 /Users/x/.claude/settings.json.claude

  Use `llm-switch switch` to change active profile.
```

- 0 个 profile → 抛 `NoProfilesError`
- 退出码：成功 0；无 profile 1

## 错误处理

| 情况 | 行为 |
|---|---|
| 无 TTY（`process.stdout.isTTY === false`） | `pickProfile` / `promptAlias` / `promptNewAlias` 抛 `UserCancelledError` |
| `profiles` 空数组 | `pickProfile` 返回 null（不调起 inquirer） |
| `existing` 空数组 | `promptAlias` 直接走 `promptNewAlias`（不显示 select 菜单） |
| inquirer 抛错（如 stdin 关闭） | 透传给调用方，cli.ts 走 `process.exit(3)` |
| 用户 Ctrl-C | select/input 返回 cancel sentinel → 我们返回 null → 命令层抛 `UserCancelledError` → exit 0 |
| 非法格式别名 | inquirer 内部 `validate` 拦截，原地重提示；用户 Ctrl-C → null |
| 已存在别名 | inquirer 内部 `validate` 拦截，原地重提示；用户 Ctrl-C → null |

## 测试策略

### Mock 方案

```ts
// test/ui.test.ts 开头
import { vi } from 'vitest';

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  isCancel: (v: unknown) => typeof v === 'symbol',
}));

import { select, input } from '@inquirer/prompts';
```

### 测试用例

```
pickProfile
  ✓ returns selected profile (mock select → 'glm')
  ✓ returns null on cancel (mock select → Symbol())
  ✓ pre-selects active profile (verify select called with default: activeProfile)
  ✓ returns null for empty profiles (no select call)
  ✓ throws UserCancelledError when no TTY

promptAlias
  ✓ returns existing alias when selected (mock select → 'glm')
  ✓ falls through to promptNewAlias on '+ Create new' (mock select → Symbol)
  ✓ skips select when existing is empty (calls input directly)
  ✓ returns null on cancel at select

promptNewAlias
  ✓ returns trimmed valid alias
  ✓ re-prompts on invalid format (verify validate function)
  ✓ re-prompts on duplicate
  ✓ returns null on cancel at input
```

### 不测

- inquirer 自身的箭头键处理（库内部责任）
- ANSI 转义序列输出（库内部责任）

### CI 兼容性

CI 在非 TTY 环境运行 → `vi.mock` 拦截所有 inquirer 调用 → 不会触发真实 TTY 读取。

## 实施步骤概要

1. `pnpm add @inquirer/prompts`（添加到 dependencies）
2. 重写 `src/ui.ts`
3. 微调 `src/commands/list.ts` 输出格式
4. 重写 `test/ui.test.ts` 使用 `vi.mock`
5. 调整 `test/commands/switch.test.ts` 和 `test/commands/save.test.ts`（如有必要，移除旧的菜单相关测试）
6. 运行 `pnpm test` 确认全部通过
7. 手动 smoke test 验证交互体验
8. bump 版本到 `0.2.0`
9. push + tag + publish

## 兼容性影响

- 公开接口 `pickProfile` / `promptAlias` 签名基本不变（`ReadlineIO` 参数变为可选且忽略）
- 命令文件零改动
- 行为变化：用户从输入数字变为按箭头（更友好，但不向后兼容旧使用习惯）
- 这是 minor version bump → 0.1.0 → 0.2.0

## 待用户确认

本文档需用户审核通过后，再进入 `writing-plans` 阶段生成实施计划。