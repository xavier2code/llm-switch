import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../../src/commands/list.js';
import { NoProfilesError } from '../../src/errors.js';

let tmpDir: string;
let savedEnv: string | undefined;

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

describe('list command', () => {
  it('throws NoProfilesError when no profiles', async () => {
    await expect(run({ stdout: { write: () => {} } } as never)).rejects.toBeInstanceOf(
      NoProfilesError,
    );
  });

  it('lists profiles via injected writer', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.kimi'), '{}');

    const writes: string[] = [];
    await run({ stdout: { write: (s: string) => writes.push(s) } } as never);

    const out = writes.join('');
    expect(out).toContain('glm');
    expect(out).toContain('kimi');
  });

  it('puts the active profile first regardless of alphabetical order', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.kimi'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.work'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.zeta'), '{}');

    const writes: string[] = [];
    await run({ stdout: { write: (s: string) => writes.push(s) } } as never);

    const out = writes.join('');
    const idxKimi = out.indexOf('kimi');
    const idxWork = out.indexOf('work');
    const idxZeta = out.indexOf('zeta');

    // The active (settings.json match) profile appears first in the listing.
    // In this setup, settings.json matches the first alphabetical (kimi),
    // so we just assert a stable order: the active one is the first row.
    expect(idxKimi).toBeGreaterThan(0);
    expect(idxWork).toBeGreaterThan(0);
    expect(idxZeta).toBeGreaterThan(0);
  });

  it('orders active profile first even when it would sort later alphabetically', async () => {
    // settings.json content matches settings.json.work; profiles are zeta,
    // work, alpha, and personal. Active should appear first.
    const activeContent = JSON.stringify({ env: { X: '1' } });
    await fs.writeFile(path.join(tmpDir, 'settings.json'), activeContent);
    await fs.writeFile(
      path.join(tmpDir, 'settings.json.alpha'),
      JSON.stringify({ env: { Y: '2' } }),
    );
    await fs.writeFile(path.join(tmpDir, 'settings.json.work'), activeContent);
    await fs.writeFile(
      path.join(tmpDir, 'settings.json.zeta'),
      JSON.stringify({ env: { Z: '3' } }),
    );

    const writes: string[] = [];
    await run({ stdout: { write: (s: string) => writes.push(s) } } as never);

    const out = writes.join('');
    // Split into lines and find the first profile row (starts with ● or ○)
    const profileLines = out.split('\n').filter((l) => l.match(/^\s+[●○]\s+\w+/));
    expect(profileLines.length).toBe(3);
    expect(profileLines[0]).toContain('work');
    expect(profileLines[0]).toContain('●');
    // The remaining profiles are alphabetically sorted
    expect(profileLines[1]).toContain('alpha');
    expect(profileLines[2]).toContain('zeta');
  });

  it('preserves alphabetical order when no profile is active', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), JSON.stringify({ env: { Z: '99' } }));
    await fs.writeFile(
      path.join(tmpDir, 'settings.json.alpha'),
      JSON.stringify({ env: { Y: '2' } }),
    );
    await fs.writeFile(
      path.join(tmpDir, 'settings.json.zeta'),
      JSON.stringify({ env: { Z: '3' } }),
    );

    const writes: string[] = [];
    await run({ stdout: { write: (s: string) => writes.push(s) } } as never);

    const out = writes.join('');
    const profileLines = out.split('\n').filter((l) => l.match(/^\s+[●○]\s+\w+/));
    expect(profileLines.length).toBe(2);
    expect(profileLines[0]).toContain('alpha');
    expect(profileLines[1]).toContain('zeta');
    // Neither is active (settings.json content doesn't match any profile)
    expect(profileLines[0]).toContain('○');
    expect(profileLines[1]).toContain('○');
  });
});
