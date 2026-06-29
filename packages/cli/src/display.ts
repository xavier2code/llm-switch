import fs from 'node:fs/promises';
import { ConfigDirNotFoundError } from './errors.js';
import type { TargetConfig } from '@llm-switch/core/config.js';
import { getConfigDir } from '@llm-switch/core/config.js';
import { ProfileStore, defaultProfileStore } from '@llm-switch/core/store/profile-store.js';
import type { Profile, ProfileContent } from '@llm-switch/core/adapters/types.js';

export interface CurrentSummary {
  source: string;
  sourcePath: string;
  baseUrl?: string;
  model?: string;
  hasMcp: boolean;
  warning?: string;
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

function hasMcpServers(extra: Record<string, unknown>): boolean {
  const mcp = extra.mcpServers;
  return (
    mcp !== undefined && mcp !== null && typeof mcp === 'object' && Object.keys(mcp).length > 0
  );
}

export async function summarize(
  target: TargetConfig,
  store: ProfileStore = defaultProfileStore(),
): Promise<CurrentSummary> {
  const configDir = getConfigDir(target);
  if (!(await dirExists(configDir))) {
    throw new ConfigDirNotFoundError(`Config directory not found: ${configDir}`);
  }

  const adapter = store.adapter(target);
  const settingsPath = adapter.activePath();
  let active: ProfileContent | null;
  try {
    active = await adapter.readActive();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      source: 'default',
      sourcePath: settingsPath,
      baseUrl: undefined,
      model: undefined,
      hasMcp: false,
      warning: `Could not read active config: ${message}`,
    };
  }

  if (!active) {
    return { source: 'default', sourcePath: settingsPath, hasMcp: false };
  }

  let profiles: Profile[];
  try {
    profiles = await store.listProfiles(target);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      source: 'default',
      sourcePath: settingsPath,
      baseUrl: active.baseUrl || undefined,
      model: active.model || undefined,
      hasMcp: hasMcpServers(active.extra),
      warning: `Could not list profiles: ${message}`,
    };
  }

  const matched = profiles.find((p) => p.active);
  const hasMcp = hasMcpServers(active.extra);

  return {
    source: matched ? matched.alias : 'default',
    sourcePath: matched ? matched.path : settingsPath,
    baseUrl: active.baseUrl || undefined,
    model: active.model || undefined,
    hasMcp,
  };
}
