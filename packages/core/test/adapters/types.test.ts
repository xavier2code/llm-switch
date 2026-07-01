import { describe, it, expect } from 'vitest';
import type { ProfileContent, TargetAdapter } from '@llm-switch/core/adapters/types.js';

describe('adapter types', () => {
  it('ProfileContent has required fields', () => {
    const content: ProfileContent = {
      providerId: 'glm',
      baseUrl: 'https://example.com',
      model: 'model',
      apiKey: 'key',
      extra: {},
    };
    expect(content.baseUrl).toBe('https://example.com');
  });

  it('TargetAdapter interface is importable', () => {
    const adapter: TargetAdapter | null = null;
    expect(adapter).toBeNull();
  });
});
