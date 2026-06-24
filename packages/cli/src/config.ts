import path from 'node:path';
import os from 'node:os';
import { InvalidAliasError } from './errors.js';

export type ConfigDir = string & { readonly __brand: 'ConfigDir' };

export const ALIAS_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const PROFILE_PREFIX = 'settings.json.';
const BAK_SUFFIX = '.bak';

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

/**
 * Extract profile aliases from config-dir entries. Keeps names matching
 * `settings.json.<alias>` and drops the `settings.json.bak` backup.
 */
export function parseProfileAliases(entries: string[]): string[] {
  return entries
    .filter((name) => name.startsWith(PROFILE_PREFIX) && !name.endsWith(BAK_SUFFIX))
    .map((name) => name.slice(PROFILE_PREFIX.length));
}

export function validateAlias(alias: string): string | null {
  if (!ALIAS_RE.test(alias)) {
    return `Invalid alias '${alias}'. Must match ${ALIAS_RE} (lowercase, digits, . _ -, start with letter/digit, 1-64 chars).`;
  }
  if (alias.endsWith(BAK_SUFFIX)) {
    return `Invalid alias '${alias}'. Alias must not end with '${BAK_SUFFIX}' because it conflicts with the backup file.`;
  }
  return null;
}

export function assertAlias(alias: string): void {
  const err = validateAlias(alias);
  if (err) throw new InvalidAliasError(err);
}
