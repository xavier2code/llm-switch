import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { OpenAiTomlAdapter } from '../../src/adapters/openai-toml-adapter.js';
import { getTarget } from '../../src/config.js';

let tmpDir: string;
let storeDir: string;
let adapter: OpenAiTomlAdapter;
const target = getTarget('codex');

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-codex-'));
  storeDir = path.join(tmpDir, 'profiles');
  process.env.CODEX_HOME = tmpDir;
  adapter = new OpenAiTomlAdapter(target, storeDir);
});

afterEach(async () => {
  delete process.env.CODEX_HOME;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const sampleContent = {
  providerId: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1',
  apiKey: 'sk-test',
  extra: { approval_policy: 'on-request' },
};

describe('OpenAiTomlAdapter', () => {
  it('serializes to expected TOML', () => {
    const toml = adapter.serialize(sampleContent);
    expect(toml).toContain('model = "gpt-4.1"');
    expect(toml).toContain('base_url = "https://api.openai.com/v1"');
    expect(toml).toContain('api_key = "sk-test"');
    expect(toml).toContain('approval_policy = "on-request"');
  });

  it('round-trips content', () => {
    const toml = adapter.serialize(sampleContent);
    const parsed = adapter.deserialize(toml);
    expect(parsed.baseUrl).toBe(sampleContent.baseUrl);
    expect(parsed.model).toBe(sampleContent.model);
    expect(parsed.apiKey).toBe(sampleContent.apiKey);
    expect(parsed.extra.approval_policy).toBe('on-request');
  });

  it('writes and reads active config', async () => {
    await adapter.writeActive(sampleContent);
    const active = await adapter.readActive();
    expect(active?.model).toBe('gpt-4.1');
  });

  it('writes and reads profile', async () => {
    await adapter.writeProfile('openai', sampleContent);
    const profile = await adapter.readProfile('openai');
    expect(profile?.model).toBe('gpt-4.1');
  });

  it('lists aliases', async () => {
    await adapter.writeProfile('openai', sampleContent);
    await adapter.writeProfile('work', sampleContent);
    const aliases = await adapter.listAliases();
    expect(aliases.sort()).toEqual(['openai', 'work']);
  });
});
