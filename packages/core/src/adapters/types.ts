import type { TargetConfig } from '../config.js';

export interface ProfileContent {
  providerId?: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  extra: Record<string, unknown>;
}

export interface Profile {
  alias: string;
  path: string;
  active: boolean;
  providerId?: string;
  baseUrl?: string;
  model?: string;
}

export interface TargetAdapter {
  readonly target: TargetConfig;
  readonly storeDir: string;

  readActive(): Promise<ProfileContent | null>;
  writeActive(content: ProfileContent): Promise<void>;
  readProfile(alias: string): Promise<ProfileContent | null>;
  writeProfile(alias: string, content: ProfileContent): Promise<void>;
  deleteProfile(alias: string): Promise<void>;
  listAliases(): Promise<string[]>;
  profilePath(alias: string): string;
  activePath(): string;
  serialize(content: ProfileContent): string;
  deserialize(raw: string): ProfileContent;
}
