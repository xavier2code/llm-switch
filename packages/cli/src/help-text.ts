import { TARGETS } from '@llm-switch/core/config.js';

const providerRows = [
  ['GLM (智谱)', 'https://open.bigmodel.cn/api/anthropic', 'glm-4.5'],
  ['DeepSeek', 'https://api.deepseek.com/anthropic', 'deepseek-chat'],
  ['Kimi (Moonshot)', 'https://api.kimi.com/coding/', 'kimi-for-coding'],
  ['MiniMax', 'https://api.minimaxi.com/anthropic', 'MiniMax-Text-01'],
  ['Qwen (DashScope)', 'https://dashscope.aliyuncs.com/compatible-mode/anthropic', 'qwen-plus'],
  ['OpenAI', 'https://api.openai.com/v1', 'gpt-4.1'],
]
  .map(([name, url, model]) => `  ${name.padEnd(18)} ${url.padEnd(50)} ${model}`)
  .join('\n');

export function buildAfterHelp(): string {
  return `
Targets:
  Claude Code, OpenCode, and Codex are supported. In a TTY each command prompts
  you to multi-select which tools to act on (your last choice is remembered).
  Pass --target <id> to skip the prompt and act on exactly one tool. In
  non-interactive contexts the last-selected set is reused, falling back to
  --target, then LLM_SWITCH_TARGET, then claude.

Environment:
  CLAUDE_CONFIG_DIR   Config directory for Claude Code (default: ~/.claude).
  OPENCODE_CONFIG_DIR Config directory for OpenCode (default: ~/.config/opencode).
  CODEX_HOME          Config directory for Codex (default: ~/.codex).
  LLM_SWITCH_TARGET   Default target tool before any selection is remembered;
                      overrides the default but not --target.

Profile store (centralized):
  ~/.llm-switch/profiles/<target-id>/<alias>.[json|toml]   saved profiles
  ~/.llm-switch/state.json                                   last-selected targets

Backup (next to the active config it protects):
  ~/.claude/settings.json.bak        backup before a Claude Code switch
  ~/.config/opencode/opencode.json.bak  backup before an OpenCode switch
  ~/.codex/config.toml.bak           backup before a Codex switch

Built-in providers for \`create\`:
${providerRows}

Claude Code and OpenCode use Anthropic-compatible env vars
(ANTHROPIC_BASE_URL, ANTHROPIC_MODEL, ANTHROPIC_AUTH_TOKEN). Codex uses a TOML
config (model, base_url, api_key).
`;
}

export const targetNames = TARGETS.map((t) => t.id).join('|');
