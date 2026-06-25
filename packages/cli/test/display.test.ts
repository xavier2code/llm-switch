import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { summarize } from '../src/display.js';
import { mockClaudeTarget } from './helpers.js';

let tmpDir: string;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  await fs.mkdir(path.join(tmpDir, 'llm-switch', 'profiles'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function profilesDir(): Promise<string> {
  return path.join(tmpDir, 'llm-switch', 'profiles');
}

async function setupProfilesDir(): Promise<void> {
  await fs.mkdir(await profilesDir(), { recursive: true });
}

describe('summarize', () => {
  it('returns source=default when no match', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"env":{}}');

    const s = await summarize(target);
    expect(s.source).toBe('default');
    expect(s.hasMcp).toBe(false);
  });

  it('detects alias match by content', async () => {
    await setupProfilesDir();
    const cfg = { env: { ANTHROPIC_BASE_URL: 'https://x' } };
    await fs.writeFile(path.join(tmpDir, 'settings.json'), JSON.stringify(cfg));
    await fs.writeFile(path.join(await profilesDir(), 'glm.json'), JSON.stringify(cfg));

    const s = await summarize(target);
    expect(s.source).toBe('glm');
    expect(s.baseUrl).toBe('https://x');
  });

  it('extracts baseUrl, model, hasMcp', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.example.com',
          ANTHROPIC_MODEL: 'claude-sonnet-4',
        },
        mcpServers: { foo: { command: 'npx' } },
      }),
    );

    const s = await summarize(target);
    expect(s.baseUrl).toBe('https://api.example.com');
    expect(s.model).toBe('claude-sonnet-4');
    expect(s.hasMcp).toBe(true);
  });

  it('returns empty summary when settings.json missing', async () => {
    const s = await summarize(target);
    expect(s.source).toBe('default');
    expect(s.baseUrl).toBeUndefined();
    expect(s.model).toBeUndefined();
    expect(s.hasMcp).toBe(false);
  });
});
