import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { atomicWrite, atomicWriteJson, cleanupStaleTmp, exists } from '@xavier2code/llm-switch-core/fs-utils.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-fs-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('atomicWrite', () => {
  it('writes file atomically', async () => {
    const target = path.join(tmpDir, 'out.txt');
    await atomicWrite(target, 'hello', { mode: 0o600 });
    expect(await fs.readFile(target, 'utf8')).toBe('hello');
  });

  it('applies requested mode', async () => {
    const target = path.join(tmpDir, 'mode.txt');
    await atomicWrite(target, 'x', { mode: 0o600 });
    const stat = await fs.stat(target);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('cleans up temp file on failure', async () => {
    const target = path.join(tmpDir, 'readonly', 'out.txt');
    await fs.mkdir(path.dirname(target), { mode: 0o500 });
    await expect(atomicWrite(target, 'x')).rejects.toThrow();
    const entries = await fs.readdir(tmpDir).catch(() => []);
    expect(entries.some((n) => n.startsWith('.'))).toBe(false);
    await fs.chmod(path.dirname(target), 0o700);
  });
});

describe('atomicWriteJson', () => {
  it('writes formatted JSON', async () => {
    const target = path.join(tmpDir, 'state.json');
    await atomicWriteJson(target, { a: 1 });
    const raw = await fs.readFile(target, 'utf8');
    expect(JSON.parse(raw)).toEqual({ a: 1 });
    expect(raw).toContain('\n');
  });
});

describe('cleanupStaleTmp', () => {
  it('removes matching tmp files and ignores others', async () => {
    const stale = path.join(tmpDir, '.tmp.123e4567-e89b-12d3-a456-426614174000');
    const stateStale = path.join(tmpDir, '.state.123e4567-e89b-12d3-a456-426614174001');
    const keep = path.join(tmpDir, 'profile.json');
    const badUuid = path.join(tmpDir, '.tmp.not-a-uuid');
    await fs.writeFile(stale, 'x');
    await fs.writeFile(stateStale, 'x');
    await fs.writeFile(keep, 'x');
    await fs.writeFile(badUuid, 'x');

    await cleanupStaleTmp(tmpDir, '.tmp.');
    await cleanupStaleTmp(tmpDir, '.state.');

    expect(await exists(stale)).toBe(false);
    expect(await exists(stateStale)).toBe(false);
    expect(await exists(keep)).toBe(true);
    expect(await exists(badUuid)).toBe(true);
  });

  it('ignores missing directories', async () => {
    await expect(cleanupStaleTmp(path.join(tmpDir, 'nope'))).resolves.toBeUndefined();
  });
});
