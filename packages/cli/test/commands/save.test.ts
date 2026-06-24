import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { run } from '../../src/commands/save.js';
import { NoCurrentSettingsError, InvalidAliasError } from '../../src/errors.js';

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
  vi.restoreAllMocks();
});

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
  it('throws NoCurrentSettingsError when settings.json missing', async () => {
    const io = mockIO();
    await expect(run({ alias: 'glm', ...io, isTTY: true } as never)).rejects.toBeInstanceOf(
      NoCurrentSettingsError,
    );
  });

  it('throws InvalidAliasError for bad alias', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');
    const io = mockIO();
    await expect(run({ alias: 'BAD!', ...io, isTTY: true } as never)).rejects.toBeInstanceOf(
      InvalidAliasError,
    );
  });

  it('saves current settings to profile path', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    const io = mockIO();

    await run({ alias: 'glm', ...io, isTTY: true } as never);

    expect(JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json.glm'), 'utf8'))).toEqual({
      a: 1,
    });
  });

  it('overwrites existing profile (current is truth)', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"new":true}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{"old":true}');
    const io = mockIO();

    await run({ alias: 'glm', ...io, isTTY: true } as never);

    expect(JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json.glm'), 'utf8'))).toEqual({
      new: true,
    });
    expect(io.writes.join('')).toContain('Overwrote');
  });

  it('writes profile file with mode 0600 to protect API key', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    const io = mockIO();

    await run({ alias: 'glm', ...io, isTTY: true } as never);

    const stat = await fs.stat(path.join(tmpDir, 'settings.json.glm'));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('tightens permissions when overwriting an existing profile (was 0644 → now 0600)', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"new":true}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{"old":true}');
    await fs.chmod(path.join(tmpDir, 'settings.json.glm'), 0o644);
    const io = mockIO();

    await run({ alias: 'glm', ...io, isTTY: true } as never);

    const stat = await fs.stat(path.join(tmpDir, 'settings.json.glm'));
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
