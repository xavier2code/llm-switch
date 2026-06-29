import fs from 'node:fs/promises';
import path from 'node:path';
import * as TOML from '@iarna/toml';
import type { TargetConfig } from '../config.js';
import { getActiveConfigPath, getBackupPath } from '../config.js';
import { atomicWrite, exists } from '../fs-utils.js';
import type { ProfileContent, TargetAdapter } from './types.js';

export class OpenAiTomlAdapter implements TargetAdapter {
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
    return path.join(this.storeDir, `${alias}.toml`);
  }

  serialize(content: ProfileContent): string {
    const obj: Record<string, unknown> = {
      model: content.model,
      base_url: content.baseUrl,
      api_key: content.apiKey,
      ...content.extra,
    };
    if (content.providerId) obj.providerId = content.providerId;
    return TOML.stringify(obj as TOML.JsonMap);
  }

  deserialize(raw: string): ProfileContent {
    const parsed = TOML.parse(raw) as Record<string, unknown>;
    const { providerId, model, base_url, api_key, ...rest } = parsed;
    return {
      providerId: typeof providerId === 'string' ? providerId : undefined,
      baseUrl: typeof base_url === 'string' ? base_url : '',
      model: typeof model === 'string' ? model : '',
      apiKey: typeof api_key === 'string' ? api_key : '',
      extra: rest,
    };
  }

  async readActive(): Promise<ProfileContent | null> {
    const p = this.activePath();
    if (!(await exists(p))) return null;
    try {
      const raw = await fs.readFile(p, 'utf8');
      return this.deserialize(raw);
    } catch (err: unknown) {
      if (err instanceof Error && (err as { fromTOML?: boolean }).fromTOML) return null;
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
    await atomicWrite(active, this.serialize(content), { mode: 0o600 });
  }

  async readProfile(alias: string): Promise<ProfileContent | null> {
    const p = this.profilePath(alias);
    if (!(await exists(p))) return null;
    try {
      const raw = await fs.readFile(p, 'utf8');
      return this.deserialize(raw);
    } catch (err: unknown) {
      if (err instanceof Error && (err as { fromTOML?: boolean }).fromTOML) return null;
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
    return entries
      .filter((name) => name.endsWith('.toml'))
      .map((name) => name.slice(0, -'.toml'.length));
  }
}
