import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { AppError, InvalidAliasError } from './errors.js';
import { exists } from './fs-utils.js';

export type TargetId = 'claude' | 'opencode' | 'codex';
export type TargetFamily = 'anthropic' | 'openai';
export type AdapterType = 'anthropic-json' | 'openai-toml';

export interface TargetConfig {
  readonly id: TargetId;
  readonly displayName: string;
  readonly family: TargetFamily;
  readonly adapterType: AdapterType;
  readonly envConfigDir: string;
  readonly defaultConfigDir: string;
  readonly activeConfigFileName: string;
  readonly binaryName: string;
  readonly restartHint: string;
}

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

const BY_ID: Record<TargetId, TargetConfig> = (() => {
  const map: Partial<Record<TargetId, TargetConfig>> = {};
  for (const t of TARGETS) map[t.id] = t;
  return map as Record<TargetId, TargetConfig>;
})();

const TARGET_IDS: readonly string[] = TARGETS.map((t) => t.id);

export function isTargetId(value: unknown): value is TargetId {
  return typeof value === 'string' && (TARGET_IDS as readonly string[]).includes(value);
}

export function getTarget(id: TargetId): TargetConfig {
  const t = BY_ID[id];
  if (!t) {
    throw new AppError(`Unknown target '${id}'`, 'UNKNOWN_TARGET');
  }
  return t;
}

export function getDefaultTarget(): TargetConfig {
  const fromEnv = process.env.LLM_SWITCH_TARGET;
  if (fromEnv && isTargetId(fromEnv)) {
    return getTarget(fromEnv);
  }
  return TARGETS[0];
}

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

export function getConfigDir(target: TargetConfig = getDefaultTarget()): string {
  const fromEnv = process.env[target.envConfigDir];
  if (fromEnv) return path.resolve(expandHome(fromEnv));
  return path.join(homeDir(), target.defaultConfigDir);
}

export function getActiveConfigPath(target: TargetConfig = getDefaultTarget()): string {
  return path.join(getConfigDir(target), target.activeConfigFileName);
}

export function getLlmswitchDir(target: TargetConfig = getDefaultTarget()): string {
  return path.join(getConfigDir(target), 'llm-switch');
}

export function getProfilesDir(target: TargetConfig = getDefaultTarget()): string {
  return path.join(getLlmswitchDir(target), 'profiles');
}

export function getBackupsDir(target: TargetConfig = getDefaultTarget()): string {
  return path.join(getLlmswitchDir(target), 'backups');
}

export function getBackupPath(target: TargetConfig = getDefaultTarget()): string {
  return path.join(getBackupsDir(target), `${target.activeConfigFileName}.bak`);
}

export function profilePath(alias: string, target: TargetConfig = getDefaultTarget()): string {
  return path.join(getProfilesDir(target), `${alias}.json`);
}

export const ALIAS_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const BAK_SUFFIX = '.bak';

/**
 * Extract profile aliases from entries of the profiles directory.
 * Keeps files matching `<alias>.json` and drops any `.json.bak` backup.
 */
export function parseProfileAliases(entries: string[]): string[] {
  return entries
    .filter((name) => name.endsWith('.json') && !name.endsWith(BAK_SUFFIX))
    .map((name) => name.slice(0, -'.json'.length));
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

/**
 * One-time migration from the pre-0.6.0 flat layout to the llm-switch/
 * subdirectory layout. Safe to call on every command; no-ops when already
 * migrated.
 *
 * Old layout: settings.json.<alias> and settings.json.bak in the tool's
 * config directory root.
 * New layout: llm-switch/profiles/<alias>.json and
 * llm-switch/backups/<activeFile>.bak under the same config directory.
 */
export async function ensureMigrated(target: TargetConfig = getDefaultTarget()): Promise<void> {
  const llmswitchDir = getLlmswitchDir(target);
  if (await exists(llmswitchDir)) return;

  const configDir = getConfigDir(target);
  const activeFile = target.activeConfigFileName;
  const oldProfilePrefix = `${activeFile}.`;
  const oldBackupName = `${activeFile}.bak`;

  let entries: string[];
  try {
    entries = await fs.readdir(configDir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // Fresh install: create the new directory structure and stop.
      await fs.mkdir(getProfilesDir(target), { recursive: true });
      await fs.mkdir(getBackupsDir(target), { recursive: true });
      return;
    }
    throw err;
  }

  const oldProfiles = entries.filter(
    (name) => name.startsWith(oldProfilePrefix) && name !== oldBackupName && name !== activeFile,
  );
  const oldBackup = entries.find((name) => name === oldBackupName);

  // Nothing to migrate, but still create the new directory layout.
  if (oldProfiles.length === 0 && !oldBackup) {
    await fs.mkdir(getProfilesDir(target), { recursive: true });
    await fs.mkdir(getBackupsDir(target), { recursive: true });
    return;
  }

  await fs.mkdir(getProfilesDir(target), { recursive: true });
  await fs.mkdir(getBackupsDir(target), { recursive: true });

  const migrated: Array<{ from: string; to: string }> = [];
  try {
    for (const oldName of oldProfiles) {
      const alias = oldName.slice(oldProfilePrefix.length);
      const oldPath = path.join(configDir, oldName);
      const newPath = profilePath(alias, target);
      await fs.rename(oldPath, newPath);
      migrated.push({ from: newPath, to: oldPath });
    }

    if (oldBackup) {
      const oldPath = path.join(configDir, oldBackup);
      const newPath = getBackupPath(target);
      await fs.rename(oldPath, newPath);
      migrated.push({ from: newPath, to: oldPath });
    }
  } catch (err) {
    // Rollback any files we already moved so the next run can retry.
    for (const { from, to } of migrated) {
      await fs.rename(from, to).catch(() => {
        // Best-effort rollback; ignore failures so we still throw the original error.
      });
    }
    await fs.rm(llmswitchDir, { recursive: true, force: true });
    throw err;
  }
}
