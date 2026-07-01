# Multi-Target Adapter & Centralized Profile Store Design

## Summary

Extend `llm-switch` so that every command can act on multiple selected CLI
tools, not just the single default `claude` target. Introduce a
`TargetAdapter` abstraction to handle different config formats, add Codex as a
new target, and move profiles into a centralized store under
`~/.llm-switch/profiles/<target-id>/`.

This document covers both phases in one implementation pass:

1. **Adapter abstraction** (format-specific read/write).
2. **Centralized profile store** (unified profile location with per-target
   subdirectories).

## Goals

- Make the managed target visible in every command.
- Let users select multiple targets interactively in TTY, remember the last
  selection, and fall back to it in non-TTY.
- Keep `--target` as an exact single-target override that skips prompts.
- Add first-class Codex support, including the `create` wizard.
- Auto-create missing profiles across targets with user confirmation.
- Migrate existing per-target profiles without deleting the old files.

## Non-goals

- Deleting old per-target `llm-switch/` directories after migration.
- Supporting arbitrary third-party CLI tools without code changes.
- Real-time synchronization of active configs across running tool instances.

## Target model

```ts
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
```

### Registry

```ts
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

## Architecture

```
CLI commands
    │
    ▼
TargetSelector  ──►  resolves targets for this invocation
    │
    ▼
ProfileStore    ──►  ~/.llm-switch/profiles/<target-id>/<alias>.<ext>
    │
    ▼
TargetAdapter   ──►  reads/writes each tool's active config
   ├─ AnthropicJsonAdapter  (claude, opencode)
   └─ OpenAiTomlAdapter     (codex)
```

## Global state

Path: `~/.llm-switch/state.json`

```json
{
  "lastSelectedTargets": ["claude", "opencode"],
  "version": 1
}
```

### Target selection priority

1. `--target <id>`: exact single target, no prompt.
2. TTY: show `checkbox` multi-select, default to `lastSelectedTargets`; save
   result back to state.
3. Non-TTY: use `lastSelectedTargets`.
4. State missing and non-TTY: fall back to the default target (`claude`).

## Adapter abstraction

### Interface

```ts
export interface ProfileContent {
  providerId?: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  extra: Record<string, unknown>;
}

export interface TargetAdapter {
  readonly target: TargetConfig;

  readActive(): Promise<ProfileContent | null>;
  writeActive(content: ProfileContent): Promise<void>;
  readProfile(alias: string): Promise<ProfileContent | null>;
  writeProfile(alias: string, content: ProfileContent): Promise<void>;
  deleteProfile(alias: string): Promise<void>;
  listProfiles(): Promise<Profile[]>;
  serialize(content: ProfileContent): string;
  deserialize(raw: string): ProfileContent;
}
```

### Factory

```ts
export function createAdapter(target: TargetConfig): TargetAdapter {
  if (target.adapterType === 'anthropic-json') {
    return new AnthropicJsonAdapter(target);
  }
  if (target.adapterType === 'openai-toml') {
    return new OpenAiTomlAdapter(target);
  }
  throw new AppError(`Unsupported adapter: ${target.adapterType}`, 'UNSUPPORTED_ADAPTER');
}
```

### AnthropicJsonAdapter

Profile/active config format:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
    "ANTHROPIC_MODEL": "glm-4.5",
    "ANTHROPIC_AUTH_TOKEN": "sk-..."
  }
}
```

### OpenAiTomlAdapter

Profile/active config format:

```toml
model = "gpt-4.1"
base_url = "https://api.openai.com/v1"
api_key = "sk-..."
```

Extra fields (approval policy, sandbox mode, MCP servers) are preserved in
`ProfileContent.extra` and written back to TOML as top-level keys or tables.

## Profile store layout

```
~/.llm-switch/
  state.json
  .migrated
  profiles/
    claude/
      glm.json
      kimi.json
    opencode/
      glm.json
      kimi.json
    codex/
      glm.toml
      kimi.toml
```

The store is centralized but still partitioned by target so that adapters can
continue to use target-specific formats and naming.

## Command behavior

### Execution model

Each command resolves its targets, then iterates over them serially to avoid
half-written configs.

```ts
export async function runForTargets<T>(
  targets: TargetConfig[],
  fn: (adapter: TargetAdapter) => Promise<T>,
): Promise<T[]> {
  const results: T[] = [];
  for (const target of targets) {
    const adapter = createAdapter(target);
    results.push(await fn(adapter));
  }
  return results;
}
```

### `switch [alias]`

- With alias: for each target, switch to `profiles/<target-id>/<alias>.<ext>`.
  If missing, prompt to auto-create. Auto-create tries, in order:
  1. Copy from the first other selected target in the same family that already
     has this alias.
  2. Copy from the target's current active config.
  3. Prompt the user for BASE_URL / model / API key.
- Without alias: select targets, then show only aliases that exist in **all**
  selected targets to avoid partial switches.

### `create`

1. Select targets.
2. Select provider. Anthropic family shows GLM / DeepSeek / Kimi / MiniMax /
   Qwen. OpenAI family shows OpenAI (extensible to OpenRouter / Azure later).
3. Enter alias (defaults to provider id).
4. Confirm/override BASE_URL and model per family.
5. Enter API key once. This assumes the same key works for all selected
   targets/families; if a user needs different keys for different families,
   they can run `create` again with a filtered target set.
6. For each target, write the profile in the target's format and activate it.

### `save [alias]`

1. Select targets.
2. For each target, copy the current active config into the store as the
   named profile.
3. If a profile already exists and `--force` is not set, confirm overwrite per
   target.

### `restore`

1. Select targets.
2. For each target, restore the active config from its most recent backup.
   Backups remain in the original tool config directory:
   `~/.claude/llm-switch/backups/settings.json.bak`.

### `list`

Group output by target:

```
Claude Code profiles:
  ● glm   (active)  ~/.llm-switch/profiles/claude/glm.json
  ○ kimi            ~/.llm-switch/profiles/claude/kimi.json

OpenCode profiles:
  ○ glm  ~/.llm-switch/profiles/opencode/glm.json
```

### `current`

Show a summary per target:

```
Claude Code:
  Source: work
  Base URL: https://open.bigmodel.cn/api/anthropic
  Model: glm-4.5
  MCP servers: yes

Codex:
  Source: default
  Model: gpt-4.1
```

### `init`

- Detect installed tools.
- Let the user multi-select which tools to manage.
- Create `~/.llm-switch/profiles/<target-id>/` for each selected tool.
- Write the selected targets to `state.json` as `lastSelectedTargets`.
- Warn if an active config is missing.

`maybeRunInitWizard` can be simplified: if `~/.llm-switch/` does not
exist, run `init` once on first TTY use.

## Migration from pre-0.8.0 layouts

On first run after upgrade, `ensureMigratedToCentralStore()` runs:

1. If `~/.llm-switch/.migrated` exists, return.
2. Create `~/.llm-switch/profiles/`.
3. For each target in `TARGETS`:
   - If the old profile directory exists (`<config-dir>/llm-switch/profiles/`),
     copy its contents to `~/.llm-switch/profiles/<target-id>/`.
4. Create `~/.llm-switch/.migrated`.

Old directories are not deleted so users can roll back manually if needed.

## Validation

- `validator.ts` adds `validateOpenAi(baseUrl, model, apiKey)` using the OpenAI
  Chat Completions endpoint.
- `AnthropicJsonAdapter` rejects non-HTTPS BASE_URLs except for localhost
  proxies, reusing existing validation rules.

## Testing

- Adapter unit tests for JSON and TOML serialization, extra-field preservation,
  and active-config I/O.
- `ProfileStore` tests for CRUD, path resolution, and grouped listing.
- `TargetSelector` tests for flag/state/TTY/non-TTY branches.
- Command integration tests for multi-target `switch`, `save`, `create`,
  `restore`, `list`, and `current`.
- Migration tests from old per-target directories to the centralized store.
- Codex detection and TOML output tests.

## Version

Per the versioning policy in `CLAUDE.md`, this release is a **minor** bump:
**0.8.0**.

## Open questions / risks

1. Codex's official TOML keys for custom base URL and API key need to be
   verified against the latest Codex CLI release. The design assumes
   `base_url` and `api_key`; if Codex uses different keys, the adapter must be
   updated.
2. Cross-family auto-creation may copy API keys into profiles with different
   semantics. The prompt must make it clear what is being created and for
   which tool.
3. Serial execution across targets keeps config writes safe but may feel slow
   with many targets. Parallel execution can be considered later if needed.

## Related documents

- `CLAUDE.md` — versioning and release checklist.
- `docs/internal/specs/2026-06-25-init-wizard-design.md` — prior init design
  that this spec extends.
- `docs/internal/specs/2026-06-22-llm-switch-design.md` — original multi-target
  design that introduced `TargetConfig`.
