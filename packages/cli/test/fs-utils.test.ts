import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  sha256,
  sha256String,
  exists,
  atomicWrite,
  atomicWriteJson,
} from '@xavier2code/llm-switch-core/fs-utils.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-fsutils-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('sha256', () => {
  it('returns the correct hex digest for an existing file', async () => {
    const p = path.join(tmpDir, 'a.txt');
    const content = 'hello world';
    await fs.writeFile(p, content);
    const expected = crypto.createHash('sha256').update(content).digest('hex');

    expect(await sha256(p)).toBe(expected);
  });

  it('returns the correct digest for a binary file', async () => {
    const p = path.join(tmpDir, 'a.bin');
    const buf = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
    await fs.writeFile(p, buf);
    const expected = crypto.createHash('sha256').update(buf).digest('hex');

    expect(await sha256(p)).toBe(expected);
  });

  it('returns null when the file does not exist', async () => {
    expect(await sha256(path.join(tmpDir, 'missing'))).toBeNull();
  });

  it('returns null for ENOENT, not for other errors', async () => {
    // Directory instead of file → EISDIR, not ENOENT → should throw
    const dir = path.join(tmpDir, 'subdir');
    await fs.mkdir(dir);
    await expect(sha256(dir)).rejects.toThrow();
  });
});

describe('exists', () => {
  it('returns true for an existing file', async () => {
    const p = path.join(tmpDir, 'a.txt');
    await fs.writeFile(p, 'x');
    expect(await exists(p)).toBe(true);
  });

  it('returns true for an existing directory', async () => {
    expect(await exists(tmpDir)).toBe(true);
  });

  it('returns false for a missing file', async () => {
    expect(await exists(path.join(tmpDir, 'missing'))).toBe(false);
  });
});

describe('sha256String', () => {
  it('hashes a string', () => {
    expect(sha256String('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
});

describe('atomicWrite', () => {
  it('writes content to target path', async () => {
    const target = path.join(tmpDir, 'output.txt');
    await atomicWrite(target, 'hello world');
    expect(await fs.readFile(target, 'utf8')).toBe('hello world');
  });

  it('writes Buffer content', async () => {
    const target = path.join(tmpDir, 'output.bin');
    const buf = Buffer.from([0x01, 0x02, 0x03]);
    await atomicWrite(target, buf);
    expect(await fs.readFile(target)).toEqual(buf);
  });

  it('sets file mode', async () => {
    const target = path.join(tmpDir, 'secret.txt');
    await atomicWrite(target, 'shh', { mode: 0o600 });
    const stats = await fs.stat(target);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('does not leave tmp file on success', async () => {
    const target = path.join(tmpDir, 'clean.txt');
    await atomicWrite(target, 'clean', { tmpPrefix: '.test.' });
    const temps = (await fs.readdir(tmpDir)).filter((f) => f.startsWith('.test.'));
    expect(temps).toHaveLength(0);
  });

  it('cleans up tmp file on failure', async () => {
    const readonlyDir = path.join(tmpDir, 'readonly');
    await fs.mkdir(readonlyDir, { mode: 0o500 });
    const target = path.join(readonlyDir, 'sub', 'file.txt');

    await expect(atomicWrite(target, 'boom')).rejects.toThrow();

    await fs.chmod(readonlyDir, 0o700);
    const temps = (await fs.readdir(readonlyDir)).filter((f) => f.startsWith('.tmp.'));
    expect(temps).toHaveLength(0);
  });

  it('overwrites an existing file', async () => {
    const target = path.join(tmpDir, 'existing.txt');
    await fs.writeFile(target, 'old');
    await atomicWrite(target, 'new');
    expect(await fs.readFile(target, 'utf8')).toBe('new');
  });

  it('fsyncs before rename when requested', async () => {
    const target = path.join(tmpDir, 'synced.txt');
    await atomicWrite(target, 'data', { fsync: true });
    expect(await fs.readFile(target, 'utf8')).toBe('data');
  });
});

describe('atomicWriteJson', () => {
  it('writes JSON atomically', async () => {
    const target = path.join(tmpDir, 'state.json');
    await atomicWriteJson(target, { version: 1, targets: ['claude'] }, { mode: 0o600 });
    const parsed = JSON.parse(await fs.readFile(target, 'utf8'));
    expect(parsed).toEqual({ version: 1, targets: ['claude'] });
    const stats = await fs.stat(target);
    expect(stats.mode & 0o777).toBe(0o600);
  });
});
