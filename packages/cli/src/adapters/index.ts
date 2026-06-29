import type { TargetConfig } from '@llm-switch/core/config.js';
import { AppError } from '../errors.js';
import { AnthropicJsonAdapter } from '@llm-switch/core/adapters/anthropic-json-adapter.js';
import { OpenAiTomlAdapter } from '@llm-switch/core/adapters/openai-toml-adapter.js';
import type { TargetAdapter } from '@llm-switch/core/adapters/types.js';

export function createAdapter(target: TargetConfig, storeDir: string): TargetAdapter {
  if (target.adapterType === 'anthropic-json') {
    return new AnthropicJsonAdapter(target, storeDir);
  }
  if (target.adapterType === 'openai-toml') {
    return new OpenAiTomlAdapter(target, storeDir);
  }
  throw new AppError(`Unsupported adapter type: ${target.adapterType}`, 'UNSUPPORTED_ADAPTER');
}
