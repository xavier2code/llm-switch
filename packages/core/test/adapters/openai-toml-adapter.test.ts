import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { OpenAiTomlAdapter } from '@xavier2code/llm-switch-core/adapters/openai-toml-adapter.js';
import { getBackupPath, getTarget } from '@xavier2code/llm-switch-core/config.js';

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

  it('returns null when active config is missing', async () => {
    const active = await adapter.readActive();
    expect(active).toBeNull();
  });

  it('returns null when active config is corrupt TOML', async () => {
    await fs.mkdir(path.dirname(adapter.activePath()), { recursive: true });
    await fs.writeFile(adapter.activePath(), '[not closed');
    const active = await adapter.readActive();
    expect(active).toBeNull();
  });

  it('returns null when profile is corrupt TOML', async () => {
    await fs.mkdir(storeDir, { recursive: true });
    await fs.writeFile(path.join(storeDir, 'broken.toml'), '[not closed');
    const profile = await adapter.readProfile('broken');
    expect(profile).toBeNull();
  });

  it('creates a backup when writing active config', async () => {
    const previous = 'api_key = "previous"';
    await fs.mkdir(path.dirname(adapter.activePath()), { recursive: true });
    await fs.writeFile(adapter.activePath(), previous);
    await adapter.writeActive(sampleContent);
    const backup = await fs.readFile(getBackupPath(target), 'utf8');
    expect(backup).toContain('api_key = "previous"');
  });

  it('cleans up temp file when writeActive fails', async () => {
    const configDir = path.dirname(adapter.activePath());
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(adapter.activePath(), '');
    await fs.chmod(configDir, 0o555);
    try {
      await expect(adapter.writeActive(sampleContent)).rejects.toThrow();
      const tmpFilesAfter = (await fs.readdir(configDir)).filter((n) => n.endsWith('.tmp'));
      expect(tmpFilesAfter).toEqual([]);
    } finally {
      await fs.chmod(configDir, 0o755);
    }
  });

  it('merges profile into existing active config preserving other fields', async () => {
    const existing = [
      'model = "old-model"',
      'base_url = "https://old.example.com"',
      'api_key = "old-key"',
      'providerId = "old-provider"',
      'approval_policy = "suggest"',
      'custom_field = 42',
    ].join('\n');
    await fs.mkdir(path.dirname(adapter.activePath()), { recursive: true });
    await fs.writeFile(adapter.activePath(), existing);

    const newContent = {
      providerId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1',
      apiKey: 'sk-new',
      extra: {},
    };
    await adapter.writeActive(newContent);

    const raw = await fs.readFile(adapter.activePath(), 'utf8');
    expect(raw).toContain('model = "gpt-4.1"');
    expect(raw).toContain('base_url = "https://api.openai.com/v1"');
    expect(raw).toContain('api_key = "sk-new"');
    expect(raw).toContain('providerId = "openai"');
    expect(raw).toContain('approval_policy = "suggest"');
    expect(raw).toContain('custom_field = 42');
  });

  it('creates new active file with only profile fields when active does not exist', async () => {
    const content = {
      providerId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1',
      apiKey: 'sk-new',
      extra: {},
    };
    await adapter.writeActive(content);

    const raw = await fs.readFile(adapter.activePath(), 'utf8');
    expect(raw).toContain('model = "gpt-4.1"');
    expect(raw).toContain('base_url = "https://api.openai.com/v1"');
    expect(raw).toContain('api_key = "sk-new"');
    expect(raw).toContain('providerId = "openai"');
    expect(raw).not.toContain('approval_policy');
  });
});
