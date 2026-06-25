import type { TargetConfig } from '../src/config.js';

export function mockClaudeTarget(): TargetConfig {
  return {
    id: 'claude',
    displayName: 'Claude Code',
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
    envConfigDir: 'OPENCODE_CONFIG_DIR',
    defaultConfigDir: '.config/opencode',
    activeConfigFileName: 'opencode.json',
    binaryName: 'opencode',
    restartHint: 'Restart OpenCode to apply.',
  };
}
