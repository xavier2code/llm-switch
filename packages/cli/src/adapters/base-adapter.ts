import fs from 'node:fs/promises';
import path from 'node:path';
import type { TargetConfig } from '@llm-switch/core/config.js';
import { getActiveConfigPath, getBackupPath } from '@llm-switch/core/config.js';
import { atomicWrite, exists } from '../fs-utils.js';
import type { ProfileContent, TargetAdapter } from './types.js';

export abstract class BaseAdapter implements TargetAdapter {
  readonly target: TargetConfig;
  readonly storeDir: string;

  constructor(target: TargetConfig, storeDir: string) {
    this.target = target;
    this.storeDir = storeDir;
  }

  activePath(): string {
    return getActiveConfigPath(this.target);
  }

  profilePath(alias: string): string {
    return path.join(this.storeDir, `${alias}.${this.fileExtension()}`);
  }

  async readActive(): Promise<ProfileContent | null> {
    const p = this.activePath();
    if (!(await exists(p))) return null;
    try {
      const raw = await fs.readFile(p, 'utf8');
      return this.deserialize(raw);
    } catch (err: unknown) {
      if (this.isParseError(err)) return null;
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (code === 'ENOENT') return null;
      throw err;
    }
  }

  async writeActive(content: ProfileContent): Promise<void> {
    const active = this.activePath();
    if (await exists(active)) {
      const backup = getBackupPath(this.target);
      await fs.mkdir(path.dirname(backup), { recursive: true, mode: 0o700 });
      await fs.copyFile(active, backup);
      await fs.chmod(backup, 0o600);
    }

    const raw = await fs.readFile(active, 'utf8').catch((err: unknown) => {
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (code === 'ENOENT') return null;
      throw err;
    });

    const output =
      raw !== null ? this.applyProfileToExisting(raw, content) : this.serialize(content);
    await atomicWrite(active, output, { mode: 0o600 });
  }

  async readProfile(alias: string): Promise<ProfileContent | null> {
    const p = this.profilePath(alias);
    if (!(await exists(p))) return null;
    try {
      const raw = await fs.readFile(p, 'utf8');
      return this.deserialize(raw);
    } catch (err: unknown) {
      if (this.isParseError(err)) return null;
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (code === 'ENOENT') return null;
      throw err;
    }
  }

  async writeProfile(alias: string, content: ProfileContent): Promise<void> {
    const p = this.profilePath(alias);
    await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
    await atomicWrite(p, this.serialize(content), { mode: 0o600 });
  }

  async deleteProfile(alias: string): Promise<void> {
    await fs.rm(this.profilePath(alias), { force: true });
  }

  async listAliases(): Promise<string[]> {
    if (!(await exists(this.storeDir))) return [];
    const entries = await fs.readdir(this.storeDir);
    const ext = `.${this.fileExtension()}`;
    return entries.filter((name) => name.endsWith(ext)).map((name) => name.slice(0, -ext.length));
  }

  /** Check whether an error is a parse/deserialization error. */
  protected abstract isParseError(err: unknown): boolean;

  /** File extension for profile files (without the dot). */
  abstract fileExtension(): string;

  /** Serialize profile content to a string. */
  abstract serialize(content: ProfileContent): string;

  /** Deserialize a string to profile content. */
  abstract deserialize(raw: string): ProfileContent;

  /**
   * Merge profile fields into an existing active config file's raw content.
   * Returns the updated raw content ready to be written.
   */
  abstract applyProfileToExisting(existingRaw: string, content: ProfileContent): string;
}
