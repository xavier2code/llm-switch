import { describe, it, expect } from 'vitest';
import { PROVIDERS, getProvider, isProviderId } from '@llm-switch/core/providers.js';
import { AppError } from '@llm-switch/core/errors.js';

describe('PROVIDERS', () => {
  it('contains exactly 6 providers', () => {
    expect(PROVIDERS).toHaveLength(6);
  });

  it('all ids are unique and match expected set', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(['deepseek', 'glm', 'kimi', 'minimax', 'openai', 'qwen']);
  });

  it('every provider has non-empty displayName, baseUrl, defaultModel', () => {
    for (const p of PROVIDERS) {
      expect(p.displayName.length).toBeGreaterThan(0);
      expect(p.baseUrl).toMatch(/^https?:\/\//);
      expect(p.defaultModel.length).toBeGreaterThan(0);
    }
  });
});

describe('getProvider', () => {
  it('returns matching provider for known id', () => {
    const glm = getProvider('glm');
    expect(glm.id).toBe('glm');
    expect(glm.displayName).toContain('GLM');
  });

  it('throws AppError for unknown id', () => {
    // @ts-expect-error testing runtime guard against invalid ids
    expect(() => getProvider('nope')).toThrow(AppError);
  });
});

describe('isProviderId', () => {
  it('returns true for every id in PROVIDERS', () => {
    for (const p of PROVIDERS) {
      expect(isProviderId(p.id)).toBe(true);
    }
  });

  it('returns false for an unknown lowercase string', () => {
    expect(isProviderId('nope')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isProviderId('')).toBe(false);
  });

  it('returns false for a non-string', () => {
    expect(isProviderId(undefined)).toBe(false);
    expect(isProviderId(null)).toBe(false);
    expect(isProviderId(42)).toBe(false);
    expect(isProviderId({})).toBe(false);
    expect(isProviderId([])).toBe(false);
    expect(isProviderId(Symbol('x'))).toBe(false);
  });

  it('returns false for case-mismatched strings', () => {
    expect(isProviderId('GLM')).toBe(false);
    expect(isProviderId('Glm')).toBe(false);
  });
});

describe('OpenAI provider', () => {
  it('is present in PROVIDERS with the expected fields', () => {
    const openai = PROVIDERS.find((p) => p.id === 'openai');
    expect(openai).toBeDefined();
    expect(openai?.family).toBe('openai');
    expect(openai?.baseUrl).toBe('https://api.openai.com/v1');
    expect(openai?.defaultModel).toBe('gpt-4.1');
  });

  it('is recognized by isProviderId', () => {
    expect(isProviderId('openai')).toBe(true);
  });

  it('is returned by getProvider', () => {
    const openai = getProvider('openai');
    expect(openai.id).toBe('openai');
    expect(openai.displayName).toBe('OpenAI');
  });
});

describe('provider family', () => {
  it('every anthropic-family provider has family "anthropic"', () => {
    const anthropicIds = ['glm', 'deepseek', 'kimi', 'minimax', 'qwen'] as const;
    for (const id of anthropicIds) {
      const p = getProvider(id);
      expect(p.family).toBe('anthropic');
    }
  });

  it('every provider has a family of either "anthropic" or "openai"', () => {
    for (const p of PROVIDERS) {
      expect(['anthropic', 'openai']).toContain(p.family);
    }
  });
});
