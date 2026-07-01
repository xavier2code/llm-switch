import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createAdapter } from '../adapters/index.js';
import type { TargetConfig } from '../config.js';
import { ProfileNotFoundError } from '../errors.js';
import { atomicWriteJson, cleanupStaleTmp, exists } from '../fs-utils.js';
import type { Profile, ProfileContent } from '../adapters/types.js';

export interface ActiveRecord {
  alias: string;
  /** ISO 8601 timestamp of when this profile was last activated. */
  switchedAt: string;
}

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

  activeRecordPath(target: TargetConfig): string {
    return path.join(this.baseDir, 'active', `${target.id}.json`);
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
    await this.adapter(target).deleteProfile(alias);
    const active = await this.readActiveRecord(target);
    if (active?.alias === alias) {
      await this.clearActiveRecord(target);
    }
  }

  async activateProfile(target: TargetConfig, alias: string): Promise<void> {
    const adapter = this.adapter(target);
    const content = await adapter.readProfile(alias);
    if (!content)
      throw new ProfileNotFoundError(`Profile '${alias}' not found for ${target.displayName}`);
    await adapter.writeActive(content);
    await this.writeActiveRecord(target, alias);
  }

  /**
   * Read the persisted active alias for a target.
   * Returns null when no activation has been recorded yet.
   */
  async readActiveRecord(target: TargetConfig): Promise<ActiveRecord | null> {
    const p = this.activeRecordPath(target);
    if (!(await exists(p))) return null;
    try {
      const raw = await fs.readFile(p, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!isActiveRecord(parsed)) return null;
      return parsed;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (code === 'ENOENT') return null;
      return null;
    }
  }

  async writeActiveRecord(target: TargetConfig, alias: string): Promise<void> {
    const p = this.activeRecordPath(target);
    await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
    const record: ActiveRecord = {
      alias,
      switchedAt: new Date().toISOString(),
    };
    await atomicWriteJson(p, record, { mode: 0o600, fsync: true });
  }

  async clearActiveRecord(target: TargetConfig): Promise<void> {
    const p = this.activeRecordPath(target);
    await fs.rm(p, { force: true });
  }

  async listProfiles(target: TargetConfig): Promise<Profile[]> {
    await this.ensureBaseDir();
    const adapter = this.adapter(target);
    const activeRecord = await this.readActiveRecord(target);
    const activeContent = await adapter.readActive();
    const activeProfileContent = activeRecord ? await adapter.readProfile(activeRecord.alias) : null;
    const aliases = await adapter.listAliases();
    const profiles = await Promise.all(
      aliases.map(async (alias) => {
        const profilePath = adapter.profilePath(alias);
        const content = await adapter.readProfile(alias);
        const isActive = activeRecord !== null && activeRecord.alias === alias && content !== null;
        return {
          alias,
          path: profilePath,
          active: isActive,
          drifted: isActive ? !contentsMatch(activeProfileContent, activeContent) : undefined,
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

function isActiveRecord(value: unknown): value is ActiveRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<ActiveRecord>;
  return typeof r.alias === 'string' && typeof r.switchedAt === 'string';
}

function contentsMatch(a: ProfileContent | null, b: ProfileContent | null): boolean {
  if (a === null || b === null) return false;
  return (
    a.baseUrl === b.baseUrl &&
    a.model === b.model &&
    a.apiKey === b.apiKey &&
    a.providerId === b.providerId
  );
}
