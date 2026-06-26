import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { atomicWrite } from './atomic-write.js';

// Helper: find temp files matching pattern in directory
async function findTempFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir);
  return entries.filter((f) => f.includes('.atomic-write-') && f.endsWith('.tmp'));
}

describe('atomicWrite', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-write-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes content to target path', async () => {
    const target = path.join(tmpDir, 'output.txt');
    const content = 'hello world';

    await atomicWrite(target, content);

    const actual = await fs.readFile(target, 'utf-8');
    expect(actual).toBe(content);
  });

  it('sets file mode when provided', async () => {
    const target = path.join(tmpDir, 'secret.txt');
    const content = 'shh';
    const mode = 0o600;

    await atomicWrite(target, content, { mode });

    const stats = await fs.stat(target);
    expect(stats.mode & 0o777).toBe(mode);
  });

  it('does not leave tmp file on success', async () => {
    const target = path.join(tmpDir, 'clean.txt');
    const content = 'clean';

    await atomicWrite(target, content);

    const temps = await findTempFiles(tmpDir);
    expect(temps).toHaveLength(0);
  });

  it('cleans up tmp file on failure', async () => {
    // Use a non-writable directory so the rename will fail
    const readonlyDir = path.join(tmpDir, 'readonly');
    await fs.mkdir(readonlyDir, { mode: 0o500 });
    const target = path.join(readonlyDir, 'sub', 'file.txt');

    try {
      await atomicWrite(target, 'boom');
      expect.fail('should have thrown');
    } catch {
      // expected
    }

    // Restore write permission so we can inspect
    await fs.chmod(readonlyDir, 0o700);
    const temps = await findTempFiles(readonlyDir);
    expect(temps).toHaveLength(0);
  });

  it('creates parent directory if needed', async () => {
    const target = path.join(tmpDir, 'a', 'b', 'c', 'deep.txt');
    const content = 'deep value';

    await atomicWrite(target, content);

    const actual = await fs.readFile(target, 'utf-8');
    expect(actual).toBe(content);
  });
});
