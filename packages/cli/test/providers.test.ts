import { describe, it, expect } from 'vitest';
import { PROVIDERS, getProvider, isProviderId } from '../src/providers.js';
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
