import path from 'node:path';
import os from 'node:os';
import { InvalidAliasError } from './errors.js';

export type ConfigDir = string & { readonly __brand: 'ConfigDir' };

export const ALIAS_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function homeDir(): string {
  return process.env.HOME ?? os.homedir();
}

function expandHome(p: string): string {
  if (p === '~') return homeDir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(homeDir(), p.slice(2));
  }
  return p;
}

function toConfigDir(s: string): ConfigDir {
  return s as ConfigDir;
}

export function getConfigDir(): ConfigDir {
  const fromEnv = process.env.CLAUDE_CONFIG_DIR;
  if (fromEnv) return toConfigDir(path.resolve(expandHome(fromEnv)));
  return toConfigDir(path.join(homeDir(), '.claude'));
}

export function getSettingsPath(): string {
  return path.join(getConfigDir(), 'settings.json');
}

export function getBackupPath(): string {
  return path.join(getConfigDir(), 'settings.json.bak');
}

export function profilePath(alias: string): string {
  return path.join(getConfigDir(), `settings.json.${alias}`);
}

export function validateAlias(alias: string): string | null {
  if (!ALIAS_RE.test(alias)) {
    return `Invalid alias '${alias}'. Must match ${ALIAS_RE} (lowercase, digits, . _ -, start with letter/digit, 1-64 chars).`;
  }
  return null;
}

export function assertAlias(alias: string): void {
  const err = validateAlias(alias);
  if (err) throw new InvalidAliasError(err);
}
