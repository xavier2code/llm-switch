import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ConfigDirNotFoundError } from './errors.js';
import type { ConfigDir } from './config.js';

export interface CurrentSummary {
  source: string;
  sourcePath: string;
  baseUrl?: string;
  model?: string;
  hasMcp: boolean;
}

async function sha256(filePath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
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

export async function summarize(configDir: ConfigDir): Promise<CurrentSummary> {
  if (!(await dirExists(configDir))) {
    throw new ConfigDirNotFoundError(`Config directory not found: ${configDir}`);
  }

  const settingsPath = path.join(configDir, 'settings.json');
  const settingsHash = await sha256(settingsPath);

  if (!settingsHash) {
    return { source: 'default', sourcePath: settingsPath, hasMcp: false };
  }

  const content = await fs.readFile(settingsPath, 'utf8');
  const data = safeParse(content);

  const entries = await fs.readdir(configDir);
  const aliases = entries
    .filter((n) => n.startsWith('settings.json.') && !n.endsWith('.bak'))
    .map((n) => n.slice('settings.json.'.length));

  for (const alias of aliases) {
    const profileFile = path.join(configDir, `settings.json.${alias}`);
    if ((await sha256(profileFile)) === settingsHash) {
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