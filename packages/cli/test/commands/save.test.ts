import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { run } from '../../src/commands/save.js';
import { NoCurrentSettingsError, InvalidAliasError } from '../../src/errors.js';
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
  vi.restoreAllMocks();
});

async function profilesDir(): Promise<string> {
  return path.join(tmpDir, 'llm-switch', 'profiles');
}

async function setupProfilesDir(): Promise<void> {
  await fs.mkdir(await profilesDir(), { recursive: true });
}

function mockIO() {
  const writes: string[] = [];
  return {
    writes,
    stdin: Readable.from(['']),
    stdout: { write: (s: string) => writes.push(s) },
    stderr: { write: (s: string) => writes.push(s) },
  };
}

describe('save command', () => {
  it('throws NoCurrentSettingsError when active config missing', async () => {
    const io = mockIO();
    await expect(run({ target, alias: 'glm', ...io, isTTY: true })).rejects.toBeInstanceOf(
      NoCurrentSettingsError,
    );
  });

  it('throws InvalidAliasError for bad alias', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');
    const io = mockIO();
    await expect(run({ target, alias: 'BAD!', ...io, isTTY: true })).rejects.toBeInstanceOf(
      InvalidAliasError,
    );
  });

  it('saves current settings to profile path', async () => {
    await setupProfilesDir();
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    const io = mockIO();

    await run({ target, alias: 'glm', ...io, isTTY: true });

    expect(
      JSON.parse(await fs.readFile(path.join(await profilesDir(), 'glm.json'), 'utf8')),
    ).toEqual({
      a: 1,
    });
  });

  it('overwrites existing profile when --force is set (no prompt)', async () => {
    await setupProfilesDir();
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"new":true}');
    await fs.writeFile(path.join(await profilesDir(), 'glm.json'), '{"old":true}');
    const io = mockIO();

    await run({ target, alias: 'glm', force: true, ...io, isTTY: true });

    expect(
      JSON.parse(await fs.readFile(path.join(await profilesDir(), 'glm.json'), 'utf8')),
    ).toEqual({
      new: true,
    });
    expect(io.writes.join('')).toContain('Overwrote');
  });

  it('prompts for confirmation when overwriting an existing profile (user confirms → overwrite)', async () => {
    await setupProfilesDir();
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"new":true}');
    await fs.writeFile(path.join(await profilesDir(), 'glm.json'), '{"old":true}');
    const io = mockIO();

    const confirmFn = vi.fn().mockResolvedValueOnce(true);
    await run({ target, alias: 'glm', confirmFn, ...io, isTTY: true });

    expect(confirmFn).toHaveBeenCalledOnce();
    const arg = confirmFn.mock.calls[0]?.[0] as { message?: string; default?: boolean };
    expect(arg.message).toMatch(/exists.*Overwrite|Overwrite/);
    expect(arg.default).toBe(false);

    expect(
      JSON.parse(await fs.readFile(path.join(await profilesDir(), 'glm.json'), 'utf8')),
    ).toEqual({
      new: true,
    });
  });

  it('prompts for confirmation when overwriting (user declines → UserCancelledError, file unchanged)', async () => {
    await setupProfilesDir();
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"new":true}');
    await fs.writeFile(path.join(await profilesDir(), 'glm.json'), '{"old":true}');
    const io = mockIO();

    const confirmFn = vi.fn().mockResolvedValueOnce(false);
    await expect(run({ target, alias: 'glm', confirmFn, ...io, isTTY: true })).rejects.toThrow(
      /ancelled/i,
    );

    expect(
      JSON.parse(await fs.readFile(path.join(await profilesDir(), 'glm.json'), 'utf8')),
    ).toEqual({
      old: true,
    });
  });

  it('does not prompt when saving a brand-new profile', async () => {
    await setupProfilesDir();
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    const io = mockIO();

    const confirmFn = vi.fn();
    await run({ target, alias: 'glm', confirmFn, ...io, isTTY: true });

    expect(confirmFn).not.toHaveBeenCalled();
  });

  it('writes profile file with mode 0600 to protect API key', async () => {
    await setupProfilesDir();
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    const io = mockIO();

    await run({ target, alias: 'glm', ...io, isTTY: true });

    const stat = await fs.stat(path.join(await profilesDir(), 'glm.json'));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('tightens permissions when overwriting an existing profile (was 0644 → now 0600)', async () => {
    await setupProfilesDir();
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"new":true}');
    await fs.writeFile(path.join(await profilesDir(), 'glm.json'), '{"old":true}');
    await fs.chmod(path.join(await profilesDir(), 'glm.json'), 0o644);
    const io = mockIO();

    await run({ target, alias: 'glm', force: true, ...io, isTTY: true });

    const stat = await fs.stat(path.join(await profilesDir(), 'glm.json'));
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
