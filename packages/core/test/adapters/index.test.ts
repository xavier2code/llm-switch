import { describe, it, expect } from 'vitest';
import { createAdapter, AnthropicJsonAdapter, OpenAiTomlAdapter } from '../../src/adapters/index.js';
import { getTarget } from '@llm-switch/core/config.js';

describe('createAdapter', () => {
  it('returns AnthropicJsonAdapter for claude', () => {
    const adapter = createAdapter(getTarget('claude'), '/tmp/p');
    expect(adapter).toBeInstanceOf(AnthropicJsonAdapter);
  });

  it('returns AnthropicJsonAdapter for opencode', () => {
    const adapter = createAdapter(getTarget('opencode'), '/tmp/p');
    expect(adapter).toBeInstanceOf(AnthropicJsonAdapter);
  });

  it('returns OpenAiTomlAdapter for codex', () => {
    const adapter = createAdapter(getTarget('codex'), '/tmp/p');
    expect(adapter).toBeInstanceOf(OpenAiTomlAdapter);
  });
});
