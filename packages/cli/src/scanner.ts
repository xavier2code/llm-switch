import fs from 'node:fs/promises';
import path from 'node:path';
import { ConfigDirNotFoundError } from './errors.js';
import type { ConfigDir } from './config.js';

export interface Profile {
  alias: string;
  path: string;
  active: boolean;
}

async function sha256(filePath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(filePath);
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(buf).digest('hex');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function listProfiles(configDir: ConfigDir): Promise<Profile[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(configDir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ConfigDirNotFoundError(`Config directory not found: ${configDir}`);
    }
    throw err;
  }

  const settingsHash = await sha256(path.join(configDir, 'settings.json'));

  const matches = entries
    .filter((name) => name.startsWith('settings.json.'))
    .filter((name) => !name.endsWith('.bak'))
    .map((name) => name.slice('settings.json.'.length));

  const profiles: Profile[] = [];
  for (const alias of matches) {
    const profileFile = path.join(configDir, `settings.json.${alias}`);
    const hash = await sha256(profileFile);
    profiles.push({
      alias,
      path: profileFile,
      active: hash !== null && hash === settingsHash,
    });
  }

  profiles.sort((a, b) => a.alias.localeCompare(b.alias));
  return profiles;
}
