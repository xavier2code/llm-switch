import * as TOML from '@iarna/toml';
import type { TargetConfig } from '@llm-switch/core/config.js';
import { BaseAdapter } from './base-adapter.js';
import type { ProfileContent } from './types.js';

export class OpenAiTomlAdapter extends BaseAdapter {
  constructor(target: TargetConfig, storeDir: string) {
    super(target, storeDir);
  }

  fileExtension(): string {
    return 'toml';
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

  isParseError(err: unknown): boolean {
    return err instanceof Error && (err as { fromTOML?: boolean }).fromTOML === true;
  }

  applyProfileToExisting(existingRaw: string, content: ProfileContent): string {
    const parsed = TOML.parse(existingRaw) as Record<string, unknown>;
    parsed.model = content.model;
    parsed.base_url = content.baseUrl;
    parsed.api_key = content.apiKey;
    if (content.providerId !== undefined) {
      parsed.providerId = content.providerId;
    }
    return TOML.stringify(parsed as TOML.JsonMap);
  }
}
