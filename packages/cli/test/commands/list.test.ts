import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/list.js';
import { NoProfilesError } from '../../src/errors.js';
import { mockClaudeTarget } from '../helpers.js';

let tmpDir: string;
let savedEnv: string | undefined;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function profilesDir(): Promise<string> {
  return path.join(tmpDir, 'llm-switch', 'profiles');
}

async function setupProfilesDir(): Promise<void> {
  await fs.mkdir(await profilesDir(), { recursive: true });
}

describe('list command', () => {
  it('throws NoProfilesError when no profiles', async () => {
    await setupProfilesDir();
    await expect(run({ target, stdout: { write: () => {} } })).rejects.toBeInstanceOf(
      NoProfilesError,
    );
  });

  it('NoProfilesError message suggests sw save', async () => {
    await setupProfilesDir();
    try {
      await run({ target, stdout: { write: () => {} } });
      expect.fail('Expected NoProfilesError');
    } catch (err) {
      expect(err).toBeInstanceOf(NoProfilesError);
      const msg = (err as Error).message;
      expect(msg).toContain('sw save');
      expect(msg).not.toContain('llm-switch save');
    }
  });

  it('lists profiles via injected writer', async () => {
    await setupProfilesDir();
    await fs.writeFile(path.join(await profilesDir(), 'glm.json'), '{}');
    await fs.writeFile(path.join(await profilesDir(), 'kimi.json'), '{}');

    const writes: string[] = [];
    await run({ target, stdout: { write: (s: string) => writes.push(s) } });

    const out = writes.join('');
    expect(out).toContain('glm');
    expect(out).toContain('kimi');
  });

  it('puts the active profile first regardless of alphabetical order', async () => {
    await setupProfilesDir();
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');
    await fs.writeFile(path.join(await profilesDir(), 'kimi.json'), '{}');
    await fs.writeFile(path.join(await profilesDir(), 'work.json'), '{}');
    await fs.writeFile(path.join(await profilesDir(), 'zeta.json'), '{}');

    const writes: string[] = [];
    await run({ target, stdout: { write: (s: string) => writes.push(s) } });

    const out = writes.join('');
    const idxKimi = out.indexOf('kimi');
    const idxWork = out.indexOf('work');
    const idxZeta = out.indexOf('zeta');

    expect(idxKimi).toBeGreaterThan(0);
    expect(idxWork).toBeGreaterThan(0);
    expect(idxZeta).toBeGreaterThan(0);
  });

  it('orders active profile first even when it would sort later alphabetically', async () => {
    await setupProfilesDir();
    const activeContent = JSON.stringify({ env: { X: '1' } });
    await fs.writeFile(path.join(tmpDir, 'settings.json'), activeContent);
    await fs.writeFile(
      path.join(await profilesDir(), 'alpha.json'),
      JSON.stringify({ env: { Y: '2' } }),
    );
    await fs.writeFile(path.join(await profilesDir(), 'work.json'), activeContent);
    await fs.writeFile(
      path.join(await profilesDir(), 'zeta.json'),
      JSON.stringify({ env: { Z: '3' } }),
    );

    const writes: string[] = [];
    await run({ target, stdout: { write: (s: string) => writes.push(s) } });

    const out = writes.join('');
    const profileLines = out.split('\n').filter((l) => l.match(/^\s+[●○]\s+\w+/));
    expect(profileLines.length).toBe(3);
    expect(profileLines[0]).toContain('work');
    expect(profileLines[0]).toContain('●');
    expect(profileLines[1]).toContain('alpha');
    expect(profileLines[2]).toContain('zeta');
  });

  it('preserves alphabetical order when no profile is active', async () => {
    await setupProfilesDir();
    await fs.writeFile(path.join(tmpDir, 'settings.json'), JSON.stringify({ env: { Z: '99' } }));
    await fs.writeFile(
      path.join(await profilesDir(), 'alpha.json'),
      JSON.stringify({ env: { Y: '2' } }),
    );
    await fs.writeFile(
      path.join(await profilesDir(), 'zeta.json'),
      JSON.stringify({ env: { Z: '3' } }),
    );

    const writes: string[] = [];
    await run({ target, stdout: { write: (s: string) => writes.push(s) } });

    const out = writes.join('');
    const profileLines = out.split('\n').filter((l) => l.match(/^\s+[●○]\s+\w+/));
    expect(profileLines.length).toBe(2);
    expect(profileLines[0]).toContain('alpha');
    expect(profileLines[1]).toContain('zeta');
    expect(profileLines[0]).toContain('○');
    expect(profileLines[1]).toContain('○');
  });
});
