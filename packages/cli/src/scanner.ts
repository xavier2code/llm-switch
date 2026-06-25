import fs from 'node:fs/promises';
import { ConfigDirNotFoundError } from './errors.js';
import type { TargetConfig } from './config.js';
import { getActiveConfigPath, getProfilesDir, parseProfileAliases, profilePath } from './config.js';
import { sha256 } from './fs-utils.js';

export interface Profile {
  alias: string;
  path: string;
  active: boolean;
}

export async function listProfiles(target: TargetConfig): Promise<Profile[]> {
  const profilesDir = getProfilesDir(target);
  let entries: string[];
  try {
    entries = await fs.readdir(profilesDir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ConfigDirNotFoundError(`Profiles directory not found: ${profilesDir}`);
    }
    throw err;
  }

  const settingsHash = await sha256(getActiveConfigPath(target));
  const matches = parseProfileAliases(entries);

  const profiles: Profile[] = await Promise.all(
    matches.map(async (alias) => {
      const profileFile = profilePath(alias, target);
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
