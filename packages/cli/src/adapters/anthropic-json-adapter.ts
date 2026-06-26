import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { TargetConfig } from '../config.js';
import { getActiveConfigPath, getBackupPath } from '../config.js';
import { exists } from '../fs-utils.js';
import type { ProfileContent, TargetAdapter } from './types.js';

export class AnthropicJsonAdapter implements TargetAdapter {
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
    return path.join(this.storeDir, `${alias}.json`);
  }

  serialize(content: ProfileContent): string {
    const obj: Record<string, unknown> = {
      env: {
        ANTHROPIC_BASE_URL: content.baseUrl,
        ANTHROPIC_MODEL: content.model,
        ANTHROPIC_AUTH_TOKEN: content.apiKey,
      },
      ...content.extra,
    };
    if (content.providerId) obj.providerId = content.providerId;
    return JSON.stringify(obj, null, 2);
  }

  deserialize(raw: string): ProfileContent {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const env = (parsed.env ?? {}) as Record<string, string>;
    const { providerId, env: _env, ...rest } = parsed;
    return {
      providerId: typeof providerId === 'string' ? providerId : undefined,
      baseUrl: env.ANTHROPIC_BASE_URL ?? '',
      model: env.ANTHROPIC_MODEL ?? '',
      apiKey: env.ANTHROPIC_AUTH_TOKEN ?? '',
      extra: rest,
    };
  }

  async readActive(): Promise<ProfileContent | null> {
    const p = this.activePath();
    if (!(await exists(p))) return null;
    const raw = await fs.readFile(p, 'utf8');
    return this.deserialize(raw);
  }

  async writeActive(content: ProfileContent): Promise<void> {
    const active = this.activePath();
    if (await exists(active)) {
      const backup = getBackupPath(this.target);
      await fs.mkdir(path.dirname(backup), { recursive: true });
      await fs.copyFile(active, backup);
      await fs.chmod(backup, 0o600);
    }
    const tmp = path.join(path.dirname(active), `.settings.${crypto.randomUUID()}.tmp`);
    try {
      await fs.writeFile(tmp, this.serialize(content));
      await fs.chmod(tmp, 0o600);
      await fs.rename(tmp, active);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }

  async readProfile(alias: string): Promise<ProfileContent | null> {
    const p = this.profilePath(alias);
    if (!(await exists(p))) return null;
    const raw = await fs.readFile(p, 'utf8');
    return this.deserialize(raw);
  }

  async writeProfile(alias: string, content: ProfileContent): Promise<void> {
    const p = this.profilePath(alias);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, this.serialize(content));
    await fs.chmod(p, 0o600);
  }

  async deleteProfile(alias: string): Promise<void> {
    await fs.rm(this.profilePath(alias), { force: true });
  }

  async listAliases(): Promise<string[]> {
    if (!(await exists(this.storeDir))) return [];
    const entries = await fs.readdir(this.storeDir);
    return entries
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length));
  }
}
