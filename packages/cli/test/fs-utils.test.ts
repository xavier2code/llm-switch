import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { sha256, exists } from '../src/fs-utils.js';

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
