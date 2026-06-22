import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { summarize } from '../src/display.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('summarize', () => {
  it('returns source=default when no match', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"env":{}}');

    const s = await summarize(tmpDir as never);
    expect(s.source).toBe('default');
    expect(s.hasMcp).toBe(false);
  });

  it('detects alias match by content', async () => {
    const cfg = { env: { ANTHROPIC_BASE_URL: 'https://x' } };
    await fs.writeFile(path.join(tmpDir, 'settings.json'), JSON.stringify(cfg));
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), JSON.stringify(cfg));

    const s = await summarize(tmpDir as never);
    expect(s.source).toBe('glm');
    expect(s.baseUrl).toBe('https://x');
  });

  it('extracts baseUrl, model, hasMcp', async () => {
    const cfg = {
      env: {
        ANTHROPIC_BASE_URL: 'https://api.example.com',
        ANTHROPIC_MODEL: 'claude-sonnet-4',
      },
      mcpServers: { foo: { command: 'npx' } },
    };
    await fs.writeFile(path.join(tmpDir, 'settings.json'), JSON.stringify(cfg));

    const s = await summarize(tmpDir as never);
    expect(s.baseUrl).toBe('https://api.example.com');
    expect(s.model).toBe('claude-sonnet-4');
    expect(s.hasMcp).toBe(true);
  });

  it('returns empty summary when settings.json missing', async () => {
    const s = await summarize(tmpDir as never);
    expect(s.source).toBe('default');
    expect(s.baseUrl).toBeUndefined();
    expect(s.model).toBeUndefined();
    expect(s.hasMcp).toBe(false);
  });
});