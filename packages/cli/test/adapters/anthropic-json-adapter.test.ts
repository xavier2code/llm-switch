import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AnthropicJsonAdapter } from '../../src/adapters/anthropic-json-adapter.js';
import { getBackupPath, getTarget } from '../../src/config.js';

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

  it('returns null when active config is missing', async () => {
    const active = await adapter.readActive();
    expect(active).toBeNull();
  });

  it('returns null when active config is corrupt JSON', async () => {
    await fs.mkdir(path.dirname(adapter.activePath()), { recursive: true });
    await fs.writeFile(adapter.activePath(), '{not json');
    const active = await adapter.readActive();
    expect(active).toBeNull();
  });

  it('returns null when profile is corrupt JSON', async () => {
    await fs.mkdir(storeDir, { recursive: true });
    await fs.writeFile(path.join(storeDir, 'broken.json'), '{not json');
    const profile = await adapter.readProfile('broken');
    expect(profile).toBeNull();
  });

  it('creates a backup when writing active config', async () => {
    const previous = JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: 'previous' } });
    await fs.mkdir(path.dirname(adapter.activePath()), { recursive: true });
    await fs.writeFile(adapter.activePath(), previous);
    await adapter.writeActive(sampleContent);
    const backup = await fs.readFile(getBackupPath(target), 'utf8');
    expect(JSON.parse(backup).env.ANTHROPIC_AUTH_TOKEN).toBe('previous');
  });

  it('cleans up temp file when writeActive fails', async () => {
    const activeDir = path.dirname(adapter.activePath());
    await fs.mkdir(activeDir, { recursive: true });
    await fs.writeFile(adapter.activePath(), '{}');
    // Make the active directory read-only so rename fails.
    await fs.chmod(activeDir, 0o555);
    try {
      await expect(adapter.writeActive(sampleContent)).rejects.toThrow();
      const tmpFilesAfter = (await fs.readdir(activeDir)).filter((n) => n.endsWith('.tmp'));
      expect(tmpFilesAfter).toEqual([]);
    } finally {
      await fs.chmod(activeDir, 0o755);
    }
  });

  it('merges profile into existing active config preserving other fields', async () => {
    const existing = {
      env: {
        ANTHROPIC_BASE_URL: 'https://old.example.com',
        ANTHROPIC_MODEL: 'old-model',
        ANTHROPIC_AUTH_TOKEN: 'old-key',
      },
      providerId: 'old-provider',
      mcpServers: {
        myServer: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
      },
      theme: 'dark',
    };
    await fs.mkdir(path.dirname(adapter.activePath()), { recursive: true });
    await fs.writeFile(adapter.activePath(), JSON.stringify(existing, null, 2));

    const newContent = {
      providerId: 'glm',
      baseUrl: 'https://open.bigmodel.cn/api/anthropic',
      model: 'glm-4.5',
      apiKey: 'sk-new',
      extra: {},
    };
    await adapter.writeActive(newContent);

    const raw = await fs.readFile(adapter.activePath(), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.env.ANTHROPIC_BASE_URL).toBe('https://open.bigmodel.cn/api/anthropic');
    expect(parsed.env.ANTHROPIC_MODEL).toBe('glm-4.5');
    expect(parsed.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-new');
    expect(parsed.providerId).toBe('glm');
    expect(parsed.mcpServers).toEqual(existing.mcpServers);
    expect(parsed.theme).toBe('dark');
  });

  it('creates new active file with only profile fields when active does not exist', async () => {
    const content = {
      providerId: 'glm',
      baseUrl: 'https://open.bigmodel.cn/api/anthropic',
      model: 'glm-4.5',
      apiKey: 'sk-new',
      extra: {},
    };
    await adapter.writeActive(content);

    const raw = await fs.readFile(adapter.activePath(), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.env.ANTHROPIC_BASE_URL).toBe(content.baseUrl);
    expect(parsed.env.ANTHROPIC_MODEL).toBe(content.model);
    expect(parsed.env.ANTHROPIC_AUTH_TOKEN).toBe(content.apiKey);
    expect(parsed.providerId).toBe('glm');
    expect(parsed.mcpServers).toBeUndefined();
  });
});
