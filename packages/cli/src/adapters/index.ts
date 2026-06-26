import type { TargetConfig } from '../config.js';
import { AppError } from '../errors.js';
import { AnthropicJsonAdapter } from './anthropic-json-adapter.js';
import { OpenAiTomlAdapter } from './openai-toml-adapter.js';
import type { TargetAdapter } from './types.js';

export function createAdapter(target: TargetConfig, storeDir: string): TargetAdapter {
  if (target.adapterType === 'anthropic-json') {
    return new AnthropicJsonAdapter(target, storeDir);
  }
  if (target.adapterType === 'openai-toml') {
    return new OpenAiTomlAdapter(target, storeDir);
  }
  throw new AppError(`Unsupported adapter type: ${target.adapterType}`, 'UNSUPPORTED_ADAPTER');
}
