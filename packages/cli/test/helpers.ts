import type { TargetConfig } from '../src/config.js';

export function mockClaudeTarget(): TargetConfig {
  return {
    id: 'claude',
    displayName: 'Claude Code',
    family: 'anthropic',
    adapterType: 'anthropic-json',
    envConfigDir: 'CLAUDE_CONFIG_DIR',
    defaultConfigDir: '.claude',
    activeConfigFileName: 'settings.json',
    binaryName: 'claude',
    restartHint: 'Restart Claude Code to apply.',
  };
}

export function mockOpencodeTarget(): TargetConfig {
  return {
    id: 'opencode',
    displayName: 'OpenCode',
    family: 'anthropic',
    adapterType: 'anthropic-json',
    envConfigDir: 'OPENCODE_CONFIG_DIR',
    defaultConfigDir: '.config/opencode',
    activeConfigFileName: 'opencode.json',
    binaryName: 'opencode',
    restartHint: 'Restart OpenCode to apply.',
  };
}

export function mockCodexTarget(): TargetConfig {
  return {
    id: 'codex',
    displayName: 'Codex',
    family: 'openai',
    adapterType: 'openai-toml',
    envConfigDir: 'CODEX_HOME',
    defaultConfigDir: '.codex',
    activeConfigFileName: 'config.toml',
    binaryName: 'codex',
    restartHint: 'Restart Codex to apply.',
  };
}
