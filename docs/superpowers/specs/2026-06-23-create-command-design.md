# llm-switch `create` 子命令设计文档

**日期**：2026-06-23
**状态**：待用户审核

## 目标

为 `llm-switch` 新增交互式 `create` 子命令。用户运行 `llm-switch create` 后，按提示选择 LLM 提供商、确认/调整 BASE_URL 与模型、输入 API key，工具通过真实 API 调用验证 key 有效，验证通过后自动生成 `settings.json.<alias>` 并立即激活为当前 `settings.json`。

解决痛点：新用户首次使用时没有现成的 `settings.json.<alias>` 文件，需要手动查文档、构造 JSON、放到正确路径——本命令把这个过程变成向导。

## 用户故事

1. 作为首次使用的用户，我在 `~/.claude/` 下没有任何 `settings.json.<alias>`，运行 `llm-switch create`，按提示选 "GLM (智谱)"、回车接受默认 alias `glm`、回车接受默认 URL/模型、粘贴 API key，工具验证通过后自动生成 `settings.json.glm` 并把当前 `settings.json` 切到它。
2. 作为已有 `settings.json.glm` 的用户，我想换一个新 key（轮换），运行 `llm-switch create`、选 GLM、确认覆盖 `glm`，验证通过后旧的被替换并立即激活。
3. 作为用小众 provider 的用户，运行 `llm-switch create`、选 GLM 后拒绝默认值，输入自己的 `https://my-proxy.example.com/anthropic` 和模型名，照常生成。

## 范围

### 包含
- 新子命令 `create`（无参数，纯交互）
- 5 个内置 provider：GLM（智谱）、DeepSeek、Kimi（Moonshot）、MiniMax、Qwen（DashScope）
- Anthropic Messages 协议的 ping 验证（POST `/v1/messages`，`max_tokens: 1`）
- 验证失败时的子菜单（重试 / 换 key / 改 URL 或模型 / 取消）
- 同名 alias 提示后覆盖
- 创建后立即激活（备份当前 `settings.json` 到 `.bak`，原子切换）
- 新错误类 `ValidationError`
- provider 注册表 + 验证器 + 命令的三层结构

### 不包含
- 非 Anthropic 兼容协议（OpenAI、Azure 等）——5 个 provider 假设都支持 Anthropic Messages
- Provider 列表的自定义扩展（不支持用户加新 provider）
- API key 的本地加密 / 密钥管理集成（如 macOS Keychain）
- 配置文件字段级合并 / 编辑
- 自动重启 Claude Code
- 创建时的多 profile 批量创建

## 架构

### 新增文件

```
packages/cli/src/
├── providers.ts             # NEW: provider 注册表（纯数据）
├── validator.ts             # NEW: 通用 Anthropic 协议 ping + ValidationError
└── commands/
    └── create.ts            # NEW: create 命令交互流程

packages/cli/test/
├── providers.test.ts        # NEW
├── validator.test.ts        # NEW（mock fetch）
├── commands/
│   └── create.test.ts       # NEW（mock prompts + mock validate）
└── cli.test.ts              # 改：加 e2e 用例
```

### 模块依赖

```
commands/create
  ├─ providers               # 读默认配置
  ├─ validator               # 调 validateAnthropic
  ├─ switcher                # 复用 switchTo（原子切换 + 备份）
  ├─ config                  # 复用 getSettingsPath / profilePath / assertAlias
  ├─ ui                      # 复用 ensureTTY
  ├─ errors                  # 复用 UserCancelledError、InvalidAliasError；新增 ValidationError
  └─ @inquirer/prompts       # select / input / password
```

无循环依赖。每个新模块可在测试中独立 mock。

### 数据流

```
$ llm-switch create
   ↓
commands/create.run(io)
   ├─ ensureTTY()
   ├─ select({ provider 列表 })
   ├─ input({ alias, default: provider.id })
   ├─ confirm({ "Use defaults?" }) → 如果 N，分别问 BASE_URL 和 model
   ├─ password({ API key })
   ├─ validator.validateAnthropic(baseUrl, model, apiKey)
   │   └─ 失败 → select({ 重试 / 换 key / 改 URL 或模型 / 取消 })
   ├─ profilePath(alias) 已存在？ → confirm({ "Overwrite?" }) → N 则抛 UserCancelledError
   ├─ fs.writeFile(profilePath(alias), JSON.stringify({
   │       env: { ANTHROPIC_BASE_URL, ANTHROPIC_MODEL, ANTHROPIC_AUTH_TOKEN }
   │     }))
   ├─ switcher.switchTo(profilePath(alias), settingsPath, backupPath)
   │   ├─ backupCurrent(settings.json, settings.json.bak)  // 现有 settings 不存在则跳过
   │   ├─ copyFile(src, tmp)
   │   └─ rename(tmp, settings.json)
   └─ 输出成功消息
```

### 关键设计原则

- **provider 数据与验证逻辑分离**：`providers.ts` 是只读对象数组，`validator.ts` 是单一函数；将来支持新协议只需加新 validator，不动 provider 表
- **复用现有原子切换**：`switcher.switchTo` 已经处理备份 + tmp + rename 失败回滚，新建 profile 不应重新实现
- **失败可恢复**：验证失败不让用户重头开始；提供"换 key / 改 URL 或模型 / 重试 / 取消"四选一
- **覆盖行为显式化**：alias 已存在必须 confirm，与现有 `save` 的"静默覆盖"不同——`create` 涉及激活现有 settings.json，覆盖风险更大

## 模块接口

### `src/providers.ts`

```ts
export type ProviderId = 'glm' | 'deepseek' | 'kimi' | 'minimax' | 'qwen';

export interface Provider {
  id: ProviderId;
  displayName: string;       // 用户看到的中文友好名，如 "GLM (智谱)"
  baseUrl: string;           // 默认 BASE_URL
  defaultModel: string;      // 默认模型名
}

export const PROVIDERS: readonly Provider[];

export function getProvider(id: ProviderId): Provider;
// 找不到抛 AppError('UNKNOWN_PROVIDER', ...)
```

**默认注册表**（值需在实施前核实，详见「默认 provider 值核实」一节）：

| id | displayName | baseUrl | defaultModel |
|---|---|---|---|
| `glm` | GLM (智谱) | `https://open.bigmodel.cn/api/anthropic` | `glm-4.5` |
| `deepseek` | DeepSeek | `https://api.deepseek.com/anthropic` | `deepseek-chat` |
| `kimi` | Kimi (Moonshot) | `https://api.moonshot.cn/anthropic` | `moonshot-v1-8k` |
| `minimax` | MiniMax | `https://api.minimaxi.com/anthropic` | `MiniMax-Text-01` |
| `qwen` | Qwen (DashScope) | `https://dashscope.aliyuncs.com/compatible-mode/anthropic` | `qwen-plus` |

### `src/validator.ts`

```ts
export class ValidationError extends AppError {
  // code: 'VALIDATION_FAILED'
}

export async function validateAnthropic(
  baseUrl: string,
  model: string,
  apiKey: string,
  opts?: { timeoutMs?: number },   // 默认 10_000
): Promise<void>;
```

**实现要点**：
- POST `{baseUrl}/v1/messages`
- Headers：`x-api-key`、`anthropic-version: 2023-06-01`、`content-type: application/json`
- Body：`{ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }`
- 用 `AbortController` 实现超时
- 401 / 403 → `ValidationError('Invalid API key (401/403).')`
- 其他非 2xx → `ValidationError('Provider rejected request (<status>): <body 前 200 字>')`
- `AbortError` → `ValidationError('Validation timed out after <ms>ms.')`
- 其他网络错误 → `ValidationError('Network error: <msg>', cause)`
- 2xx 静默成功

### `src/commands/create.ts`

```ts
export interface CreateIO {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  // 测试可注入以下四个；不传则用 @inquirer/prompts 与 validator 的真实实现
  selectFn?: typeof select;
  inputFn?: typeof input;
  passwordFn?: typeof password;
  confirmFn?: typeof confirm;
  validateFn?: typeof validateAnthropic;
}

export async function run(io: CreateIO): Promise<void>;
```

**步骤**（每步都可能抛 `UserCancelledError`，对应退出码 0）：

1. **TTY 检查**：`ensureTTY()`。否则抛 `UserCancelledError`。
2. **选 provider**：`select` 五选项。返回 `ProviderId`。
3. **确认 alias**：`input({ message: 'Alias for this profile:', default: provider.id })`。校验匹配 `ALIAS_RE`。返回字符串。
4. **确认默认值**：`confirm({ message: 'Use default BASE_URL and model?', default: true })`。否 → 分别 `input` 问 BASE_URL 和 model。
5. **输入 API key**：`password({ message: 'API key:', mask: '*' })`。
6. **验证**：调 `validateFn(baseUrl, model, apiKey)`。失败进入子菜单。
7. **失败子菜单**（`select`）：
   - Retry with same key → 重新执行步骤 6（保留当前 key、URL、model）
   - Enter a different key → 回到步骤 5 输入新 key，然后步骤 6
   - Edit BASE_URL or model → 回到步骤 4 确认/修改 URL 与 model（**不重新问 key**），然后步骤 6
   - Cancel（抛 `UserCancelledError`）
8. **覆盖确认**：如果 `profilePath(alias)` 已存在，`confirm({ message: \`Profile '<alias>' exists. Overwrite?\`, default: false })`。N → 抛 `UserCancelledError`。
9. **生成 settings.json 内容**：
   ```ts
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
   ```
10. **写入 profile 文件**：`fs.writeFile(profilePath(alias), content)`。
11. **激活**：`switcher.switchTo(profilePath(alias), settingsPath, backupPath)`。该函数自己处理备份与原子替换；若失败，`AppError` 自然向上抛（profile 文件已写但 `settings.json` 未变）。
12. **输出**：`io.stdout.write('Created and activated <alias>. Restart Claude Code to apply.\n')`。

### `src/errors.ts` 新增

```ts
export class ValidationError extends AppError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message, 'VALIDATION_FAILED');
  }
}
```

### `src/exit.ts` 不变

`ValidationError` 是 `AppError` 子类，`toExitCode` 现有兜底返回 3（generic IO/other），无需改动。如要显式可加一行 `if (err instanceof ValidationError) return 3;`，但属可选优化。

## 子命令行为

### `llm-switch create`
- 无参数
- 全程交互（必须 TTY；管道环境直接 `UserCancelledError`，退出码 0）
- 完整流程：选 provider → alias → 默认 → API key → 验证 → 写文件 → 激活
- 退出码：成功 0；用户取消（任何步骤）0；alias 不合法 2；验证失败已被子菜单处理不直接退出；激活 IO 错 3
- **注意**：API key 以明文写入 `settings.json.<alias>` 与 `settings.json`（与现有 `save` 一致，不引入新风险面）。在 README / changelog 提示。

## 错误处理

| 错误类型 | 触发条件 | 退出码 |
|---|---|---|
| `UserCancelledError` | 任何 prompt 用户 Ctrl-C 或选 Cancel | 0 |
| `InvalidAliasError` | alias 不匹配 `ALIAS_RE` | 2 |
| `ValidationError` | 验证子菜单里"Cancel"以外的路径不抛此错；该错只用于"原始 ping 失败"——子菜单里再次 ping 仍可能抛 | 3 |
| 其他 `AppError` | 文件系统异常 | 3 |

### 验证失败的子菜单语义

子菜单里"Cancel"以外的三项都重新走后续步骤，不会让 `ValidationError` 向上冒泡。只有当用户在子菜单选 "Cancel" 时才抛 `UserCancelledError`。

如果验证 ping 抛 `ValidationError`，create.ts 捕获后展示错误消息、显示子菜单；如果子菜单选了"Retry with same key"再次 ping 又失败，再次进入子菜单（无限循环直到用户取消或成功）——这是用户预期。

## 测试策略

### 单元测试

**`providers.test.ts`**
- 5 个 provider 全部存在，id 唯一
- `getProvider` 对已知 id 返回正确对象
- `getProvider` 对未知 id 抛 `AppError`

**`validator.test.ts`**（用 `vi.stubGlobal('fetch', ...)` mock）
- 200 响应 → 不抛
- 401 → 抛 `ValidationError`，message 含 "401"
- 403 → 抛 `ValidationError`，message 含 "403"
- 500 → 抛 `ValidationError`，message 含 status 和 body 前 200 字
- `fetch` 抛 `AbortError` → 抛 `ValidationError`，message 含 "timed out"
- `fetch` 抛普通 `Error` → 抛 `ValidationError`，message 含 "Network error"
- 0.1s timeout + 慢响应 → 抛超时错

**`commands/create.test.ts`**（mock select/input/password/validate）
- happy path：选 provider → 用默认 → 用默认 URL/model → 输入 key → 验证通过 → 写文件 → 切换 → 输出成功
- alias 已存在 + 用户选 N → 抛 `UserCancelledError`，不写文件
- alias 已存在 + 用户选 Y → 写文件覆盖
- 验证失败 + 子菜单选 "Enter a different key" → 回到 password 步骤
- 验证失败 + 子菜单选 "Edit BASE_URL or model" → 回到默认确认步骤
- 验证失败 + 子菜单选 "Cancel" → 抛 `UserCancelledError`
- 验证失败 + 子菜单选 "Retry with same key" 且重试成功 → 正常完成
- 验证连续失败 2 次 + 第 2 次选 Cancel → 抛 `UserCancelledError`
- 非 TTY → 抛 `UserCancelledError`
- alias 含非法字符 → 抛 `InvalidAliasError`
- 拒绝默认值 → 后续用自定义 BASE_URL 和 model
- 写文件成功后 `switchTo` 抛错 → AppError 向上冒泡

**`cli.test.ts`**（e2e）
- `llm-switch create --help` 含 "create" 子命令
- `llm-switch create` 在非 TTY 退出码 0（UserCancelledError）

### 隔离模式
沿用现有约定：`os.tmpdir() + crypto.randomUUID()` 建临时 config 目录，`afterEach` 清理；`CLAUDE_CONFIG_DIR` 注入到该目录。

### 不测
- 真实 API 验证（CI 不应消耗用户 token；mock fetch 覆盖逻辑）
- Claude Code 重启后行为
- 颜色输出
- provider BASE_URL / 模型值的正确性（这是文档问题，不是代码问题）

## 默认 provider 值核实

**实施前必须验证** §「模块接口」表格中 5 个 provider 的 `baseUrl` 和 `defaultModel`。验证方式：读各 provider 官方文档。

| provider | 验证项 |
|---|---|
| GLM | `https://open.bigmodel.cn/api/anthropic` 是否为 Anthropic 兼容路径；`glm-4.5` 是否仍为最新默认模型 |
| DeepSeek | 是否真的提供 Anthropic 兼容路径；URL 是否准确；`deepseek-chat` 是否仍推荐 |
| Kimi | `api.moonshot.cn/anthropic` 路径；当前推荐模型（如 `moonshot-v1-8k` / `moonshot-v1-32k` / `moonshot-v1-128k`） |
| MiniMax | 是否提供 Anthropic 兼容端点；URL；当前推荐模型 |
| Qwen | DashScope 的 Anthropic 兼容端点路径（社区文档存在 `/compatible-mode/anthropic` 与 `/api/v2/apps/anthropic` 两种说法）；当前推荐模型（如 `qwen-plus` / `qwen-max` / `qwen-turbo`） |

如验证后值需要调整，修改 `providers.ts` 即可，验证器逻辑不变。

## 分发与安装

CLI 与插件的安装方式不变。`package.json` 的 `version` 升 0.3.0，`CHANGELOG.md` 加 `[0.3.0]` 段，说明 `create` 子命令新增。

## 后续可能扩展（**不在本次范围**）

- 非 Anthropic 兼容协议（OpenAI / Azure）：为 `Provider` 加 `strategy` 字段，加 `validateOpenAI` 等
- provider 注册表外置（用户自定义 JSON 文件）
- API key 不写入 settings.json，而是引用环境变量名（`ANTHROPIC_AUTH_TOKEN`）
- 创建时直接复用现有 `settings.json` 的 `mcpServers` 等字段
- 批量创建（一次为多个 provider 生成）
- Provider 文档链接（用户选 provider 后显示该 provider 申请 API key 的 URL）

## 待用户确认

本文档需用户审核通过后，再进入 `writing-plans` 阶段生成实施计划。