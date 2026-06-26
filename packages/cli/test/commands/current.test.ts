import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/current.js';
import { ProfileStore } from '../../src/store/profile-store.js';
import { ConfigDirNotFoundError } from '../../src/errors.js';
import { mockClaudeTarget } from '../helpers.js';

let tmpDir: string;
let savedEnv: string | undefined;
let store: ProfileStore;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-current-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, 'llm-switch'));
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('current command', () => {
  it('throws ConfigDirNotFoundError when missing', async () => {
    process.env.CLAUDE_CONFIG_DIR = '/nonexistent/path/12345';
    await expect(
      run({ targets: [target], stdout: { write: () => {} }, store }),
    ).rejects.toBeInstanceOf(ConfigDirNotFoundError);
  });

  it('shows per-target summary with matched profile', async () => {
    await store.writeProfile(target, 'glm', {
      baseUrl: 'https://x',
      model: 'glm-4.5',
      apiKey: 'k',
      extra: {},
    });
    await store.activateProfile(target, 'glm');

    const writes: string[] = [];
    await run({ targets: [target], stdout: { write: (s: string) => writes.push(s) }, store });
    const out = writes.join('');
    expect(out).toContain('Claude Code');
    expect(out).toContain('glm');
    expect(out).toContain('https://x');
  });

  it('shows default source when active config matches no profile', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_MODEL: 'm' } }),
    );
    const writes: string[] = [];
    await run({ targets: [target], stdout: { write: (s: string) => writes.push(s) }, store });
    const out = writes.join('');
    expect(out).toContain('Source: default');
    expect(out).toContain('https://x');
  });
});
