import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createAdapter } from '../adapters/index.js';
import type { TargetConfig } from '../config.js';
import { ProfileNotFoundError } from '../errors.js';
import { cleanupStaleTmp, sha256, sha256String } from '../fs-utils.js';
import type { Profile, ProfileContent } from '../adapters/types.js';

export class ProfileStore {
  readonly baseDir: string;

  constructor(baseDir: string = defaultBaseDir()) {
    this.baseDir = baseDir;
  }

  private async ensureBaseDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true, mode: 0o700 });
    await cleanupStaleTmp(this.baseDir, '.tmp.');
    await cleanupStaleTmp(this.baseDir, '.state.');
  }

  profileDir(target: TargetConfig): string {
    return path.join(this.baseDir, 'profiles', target.id);
  }

  adapter(target: TargetConfig) {
    return createAdapter(target, this.profileDir(target));
  }

  async readProfile(target: TargetConfig, alias: string): Promise<ProfileContent | null> {
    return this.adapter(target).readProfile(alias);
  }

  async writeProfile(target: TargetConfig, alias: string, content: ProfileContent): Promise<void> {
    await this.ensureBaseDir();
    return this.adapter(target).writeProfile(alias, content);
  }

  async deleteProfile(target: TargetConfig, alias: string): Promise<void> {
    return this.adapter(target).deleteProfile(alias);
  }

  async activateProfile(target: TargetConfig, alias: string): Promise<void> {
    const adapter = this.adapter(target);
    const content = await adapter.readProfile(alias);
    if (!content)
      throw new ProfileNotFoundError(`Profile '${alias}' not found for ${target.displayName}`);
    await adapter.writeActive(content);
  }

  async listProfiles(target: TargetConfig): Promise<Profile[]> {
    await this.ensureBaseDir();
    const adapter = this.adapter(target);
    const activeContent = await adapter.readActive();
    const activeBaseUrl = activeContent?.baseUrl ?? null;
    const aliases = await adapter.listAliases();
    const profiles = await Promise.all(
      aliases.map(async (alias) => {
        const profilePath = adapter.profilePath(alias);
        const content = await adapter.readProfile(alias);
        return {
          alias,
          path: profilePath,
          active: activeBaseUrl !== null && activeBaseUrl !== '' && activeBaseUrl === content?.baseUrl,
          providerId: content?.providerId,
          baseUrl: content?.baseUrl,
          model: content?.model,
        };
      }),
    );
    return profiles;
  }
}

export function defaultBaseDir(): string {
  return path.join(process.env.HOME ?? os.homedir(), '.llm-switch');
}

export function defaultProfileStore(): ProfileStore {
  return new ProfileStore(defaultBaseDir());
}
