import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { run } from '../../src/commands/switch.js';
import { ProfileNotFoundError, UserCancelledError, InvalidAliasError } from '../../src/errors.js';
import { mockClaudeTarget } from '../helpers.js';

let tmpDir: string;
let savedEnv: string | undefined;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  await fs.mkdir(path.join(tmpDir, 'llm-switch', 'profiles'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, 'llm-switch', 'backups'), { recursive: true });
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

    await expect(run({ target, alias: 'nope', ...io, isTTY: true })).rejects.toBeInstanceOf(
      ProfileNotFoundError,
    );
  });

  it('throws InvalidAliasError for bad alias', async () => {
    const io = mockIO();
    await expect(run({ target, alias: 'BAD!', ...io, isTTY: true })).rejects.toBeInstanceOf(
      InvalidAliasError,
    );
  });

  it('switches when alias given and profile exists', async () => {
    await setupProfilesDir();
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    await fs.writeFile(path.join(await profilesDir(), 'glm.json'), '{"a":2}');
    const io = mockIO();

    await run({ target, alias: 'glm', ...io, isTTY: true });

    expect(JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8'))).toEqual({
      a: 2,
    });
    expect(io.writes.join('')).toContain('Switched to glm');
  });

  it('throws UserCancelledError when interactive menu cancelled (no TTY)', async () => {
    await setupProfilesDir();
    await fs.writeFile(path.join(await profilesDir(), 'glm.json'), '{}');
    const io = mockIO('\n');

    await expect(run({ target, alias: undefined, ...io, isTTY: false })).rejects.toBeInstanceOf(
      UserCancelledError,
    );
  });
});
