import type { TargetConfig } from '@llm-switch/core/config.js';
import { BaseAdapter } from './base-adapter.js';
import type { ProfileContent } from './types.js';

export class AnthropicJsonAdapter extends BaseAdapter {
  constructor(target: TargetConfig, storeDir: string) {
    super(target, storeDir);
  }

  fileExtension(): string {
    return 'json';
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

  isParseError(err: unknown): boolean {
    return err instanceof SyntaxError;
  }

  applyProfileToExisting(existingRaw: string, content: ProfileContent): string {
    const parsed = JSON.parse(existingRaw) as Record<string, unknown>;
    parsed.env = {
      ...((parsed.env as Record<string, unknown>) ?? {}),
      ANTHROPIC_BASE_URL: content.baseUrl,
      ANTHROPIC_MODEL: content.model,
      ANTHROPIC_AUTH_TOKEN: content.apiKey,
    };
    if (content.providerId !== undefined) {
      parsed.providerId = content.providerId;
    }
    return JSON.stringify(parsed, null, 2);
  }
}
