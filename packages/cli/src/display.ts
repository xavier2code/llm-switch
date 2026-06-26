import fs from 'node:fs/promises';
import { ConfigDirNotFoundError } from './errors.js';
import type { TargetConfig } from './config.js';
import { getConfigDir } from './config.js';
import { ProfileStore, defaultProfileStore } from './store/profile-store.js';

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
  const active = await adapter.readActive();

  if (!active) {
    return { source: 'default', sourcePath: settingsPath, hasMcp: false };
  }

  const profiles = await store.listProfiles(target);
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
