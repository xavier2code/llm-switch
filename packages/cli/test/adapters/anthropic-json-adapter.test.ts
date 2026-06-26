import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AnthropicJsonAdapter } from '../../src/adapters/anthropic-json-adapter.js';
import { getTarget } from '../../src/config.js';

let tmpDir: string;
let storeDir: string;
let adapter: AnthropicJsonAdapter;
const target = getTarget('claude');

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-adapter-'));
  storeDir = path.join(tmpDir, 'profiles');
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  adapter = new AnthropicJsonAdapter(target, storeDir);
});

afterEach(async () => {
  delete process.env.CLAUDE_CONFIG_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const sampleContent = {
  providerId: 'glm',
  baseUrl: 'https://open.bigmodel.cn/api/anthropic',
  model: 'glm-4.5',
  apiKey: 'sk-test',
  extra: {},
};

describe('AnthropicJsonAdapter', () => {
  it('serializes to expected JSON', () => {
    const json = adapter.serialize(sampleContent);
    const parsed = JSON.parse(json);
    expect(parsed.env.ANTHROPIC_BASE_URL).toBe(sampleContent.baseUrl);
    expect(parsed.env.ANTHROPIC_MODEL).toBe(sampleContent.model);
    expect(parsed.env.ANTHROPIC_AUTH_TOKEN).toBe(sampleContent.apiKey);
    expect(parsed.providerId).toBe('glm');
  });

  it('round-trips content', () => {
    const json = adapter.serialize(sampleContent);
    const parsed = adapter.deserialize(json);
    expect(parsed.baseUrl).toBe(sampleContent.baseUrl);
    expect(parsed.model).toBe(sampleContent.model);
    expect(parsed.apiKey).toBe(sampleContent.apiKey);
    expect(parsed.providerId).toBe('glm');
  });

  it('writes and reads active config', async () => {
    await adapter.writeActive(sampleContent);
    const active = await adapter.readActive();
    expect(active).toEqual(sampleContent);
  });

  it('writes and reads profile', async () => {
    await adapter.writeProfile('glm', sampleContent);
    const profile = await adapter.readProfile('glm');
    expect(profile).toEqual(sampleContent);
  });

  it('lists aliases', async () => {
    await adapter.writeProfile('glm', sampleContent);
    await adapter.writeProfile('kimi', sampleContent);
    const aliases = await adapter.listAliases();
    expect(aliases.sort()).toEqual(['glm', 'kimi']);
  });
});
