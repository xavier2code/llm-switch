import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { run } from '../../src/commands/switch.js';
import { ProfileNotFoundError, UserCancelledError, InvalidAliasError } from '../../src/errors.js';

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

function mockIO(input = '') {
  const writes: string[] = [];
  return {
    writes,
    stdin: Readable.from([input]),
    stdout: { write: (s: string) => writes.push(s) },
    stderr: { write: (s: string) => writes.push(s) },
  };
}

describe('switch command', () => {
  it('throws ProfileNotFoundError when alias given but file missing', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');
    const io = mockIO();

    await expect(run({ alias: 'nope', ...io, isTTY: true } as never)).rejects.toBeInstanceOf(
      ProfileNotFoundError,
    );
  });

  it('throws InvalidAliasError for bad alias', async () => {
    const io = mockIO();
    await expect(run({ alias: 'BAD!', ...io, isTTY: true } as never)).rejects.toBeInstanceOf(
      InvalidAliasError,
    );
  });

  it('switches when alias given and profile exists', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{"a":2}');
    const io = mockIO();

    await run({ alias: 'glm', ...io, isTTY: true } as never);

    expect(JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8'))).toEqual({
      a: 2,
    });
    expect(io.writes.join('')).toContain('Switched to glm');
  });

  it('throws UserCancelledError when interactive menu cancelled (no TTY)', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');
    const io = mockIO('\n');

    await expect(run({ alias: undefined, ...io, isTTY: false } as never)).rejects.toBeInstanceOf(
      UserCancelledError,
    );
  });
});
