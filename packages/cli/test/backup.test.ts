import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { restoreBackup, isSameContent } from '../src/backup.js';
import { NoBackupError } from '../src/errors.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('restoreBackup', () => {
  it('throws NoBackupError when .bak missing', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    await expect(restoreBackup(settings, backup)).rejects.toBeInstanceOf(NoBackupError);
  });

  it('renames .bak to settings.json atomically', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    await fs.writeFile(settings, '{"current":true}');
    await fs.writeFile(backup, '{"previous":true}');

    await restoreBackup(settings, backup);

    expect(await fs.readFile(settings, 'utf8')).toBe('{"previous":true}');
    await expect(fs.access(backup)).rejects.toThrow();
  });
});

describe('isSameContent', () => {
  it('returns true for identical files', async () => {
    const a = path.join(tmpDir, 'a.json');
    const b = path.join(tmpDir, 'b.json');
    await fs.writeFile(a, '{"x":1}');
    await fs.writeFile(b, '{"x":1}');
    expect(await isSameContent(a, b)).toBe(true);
  });

  it('returns false for different files', async () => {
    const a = path.join(tmpDir, 'a.json');
    const b = path.join(tmpDir, 'b.json');
    await fs.writeFile(a, '{"x":1}');
    await fs.writeFile(b, '{"x":2}');
    expect(await isSameContent(a, b)).toBe(false);
  });

  it('returns false when either file is missing', async () => {
    const a = path.join(tmpDir, 'a.json');
    const b = path.join(tmpDir, 'b.json');
    await fs.writeFile(a, '{"x":1}');
    expect(await isSameContent(a, b)).toBe(false);
  });

  it('rethrows permission errors instead of swallowing them', async () => {
    const a = path.join(tmpDir, 'a.json');
    const b = path.join(tmpDir, 'b.json');
    await fs.writeFile(a, '{"x":1}', { mode: 0o000 });
    await fs.writeFile(b, '{"x":1}');

    try {
      await expect(isSameContent(a, b)).rejects.toThrow();
    } finally {
      // Restore permissions so tmpDir cleanup can succeed.
      await fs.chmod(a, 0o600);
    }
  });
});
