import fs from 'node:fs/promises';
import { ConfigDirNotFoundError } from './errors.js';
import type { TargetConfig } from './config.js';
import {
  getActiveConfigPath,
  getConfigDir,
  getProfilesDir,
  parseProfileAliases,
  profilePath,
} from './config.js';
import { sha256 } from './fs-utils.js';

export interface CurrentSummary {
  source: string;
  sourcePath: string;
  baseUrl?: string;
  model?: string;
  hasMcp: boolean;
}

async function dirExists(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

interface SettingsData {
  env?: { ANTHROPIC_BASE_URL?: string; ANTHROPIC_MODEL?: string };
  mcpServers?: Record<string, unknown>;
}

function safeParse(json: string): SettingsData | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== 'object') return null;
    return parsed as SettingsData;
  } catch {
    return null;
  }
}

export async function summarize(target: TargetConfig): Promise<CurrentSummary> {
  const configDir = getConfigDir(target);
  if (!(await dirExists(configDir))) {
    throw new ConfigDirNotFoundError(`Config directory not found: ${configDir}`);
  }

  const settingsPath = getActiveConfigPath(target);
  const settingsHash = await sha256(settingsPath);

  if (!settingsHash) {
    return { source: 'default', sourcePath: settingsPath, hasMcp: false };
  }

  const content = await fs.readFile(settingsPath, 'utf8');
  const data = safeParse(content);

  const entries = await fs.readdir(getProfilesDir(target));
  const aliases = parseProfileAliases(entries);

  const profiles = await Promise.all(
    aliases.map(async (alias) => {
      const profileFile = profilePath(alias, target);
      return { alias, profileFile, hash: await sha256(profileFile) };
    }),
  );

  for (const { alias, profileFile, hash } of profiles) {
    if (hash === settingsHash) {
      return {
        source: alias,
        sourcePath: profileFile,
        baseUrl: data?.env?.ANTHROPIC_BASE_URL,
        model: data?.env?.ANTHROPIC_MODEL,
        hasMcp: data?.mcpServers !== undefined && Object.keys(data.mcpServers).length > 0,
      };
    }
  }

  return {
    source: 'default',
    sourcePath: settingsPath,
    baseUrl: data?.env?.ANTHROPIC_BASE_URL,
    model: data?.env?.ANTHROPIC_MODEL,
    hasMcp: data?.mcpServers !== undefined && Object.keys(data.mcpServers).length > 0,
  };
}
