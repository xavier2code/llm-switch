import fs from 'node:fs/promises';
import path from 'node:path';
import { ConfigDirNotFoundError } from './errors.js';
import type { ConfigDir } from './config.js';
import { sha256 } from './fs-utils.js';

const PROFILE_PREFIX = 'settings.json.';
const BAK_SUFFIX = '.bak';

export interface Profile {
  alias: string;
  path: string;
  active: boolean;
}

/**
 * Extract profile aliases from config-dir entries. Keeps names matching
 * `settings.json.<alias>` and drops the `settings.json.bak` backup.
 */
export function parseProfileAliases(entries: string[]): string[] {
  return entries
    .filter((name) => name.startsWith(PROFILE_PREFIX))
    .filter((name) => !name.endsWith(BAK_SUFFIX))
    .map((name) => name.slice(PROFILE_PREFIX.length));
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
  const matches = parseProfileAliases(entries);

  const profiles: Profile[] = await Promise.all(
    matches.map(async (alias) => {
      const profileFile = path.join(configDir, `settings.json.${alias}`);
      const hash = await sha256(profileFile);
      return {
        alias,
        path: profileFile,
        active: hash !== null && hash === settingsHash,
      };
    }),
  );

  profiles.sort((a, b) => a.alias.localeCompare(b.alias));
  return profiles;
}
