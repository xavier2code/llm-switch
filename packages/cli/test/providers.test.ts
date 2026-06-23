import { describe, it, expect } from 'vitest';
import { PROVIDERS, getProvider } from '../src/providers.js';
import { AppError } from '../src/errors.js';

describe('PROVIDERS', () => {
  it('contains exactly 5 providers', () => {
    expect(PROVIDERS).toHaveLength(5);
  });

  it('all ids are unique and match expected set', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(['deepseek', 'glm', 'kimi', 'minimax', 'qwen']);
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
