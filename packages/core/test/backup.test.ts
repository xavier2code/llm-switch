import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { restoreBackup, isSameContent } from '../src/backup.js';
import { NoBackupError } from '../src/errors.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-core-backup-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('restoreBackup', () => {
  it('writes backup content to active path atomically', async () => {
    const active = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    await fs.writeFile(backup, '{"previous":true}', 'utf8');

    await restoreBackup(active, backup);

    expect(await fs.readFile(active, 'utf8')).toBe('{"previous":true}');
    expect(await fs.access(backup).then(() => true).catch(() => false)).toBe(false);
  });

  it('throws NoBackupError when backup is missing', async () => {
    const active = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'missing.bak');
    await expect(restoreBackup(active, backup)).rejects.toBeInstanceOf(NoBackupError);
  });

  it('creates parent directory for active path if needed', async () => {
    const active = path.join(tmpDir, 'nested', 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    await fs.writeFile(backup, '{"previous":true}', 'utf8');

    await restoreBackup(active, backup);

    expect(await fs.readFile(active, 'utf8')).toBe('{"previous":true}');
  });

  it('sets active file mode to 0o600', async () => {
    const active = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    await fs.writeFile(backup, 'content', 'utf8');

    await restoreBackup(active, backup);

    const stat = await fs.stat(active);
    expect(stat.mode & 0o777).toBe(0o600);
  });
});

describe('isSameContent', () => {
  it('returns true for identical files', async () => {
    const a = path.join(tmpDir, 'a');
    const b = path.join(tmpDir, 'b');
    await fs.writeFile(a, 'same', 'utf8');
    await fs.writeFile(b, 'same', 'utf8');
    expect(await isSameContent(a, b)).toBe(true);
  });

  it('returns false for different files', async () => {
    const a = path.join(tmpDir, 'a');
    const b = path.join(tmpDir, 'b');
    await fs.writeFile(a, 'a', 'utf8');
    await fs.writeFile(b, 'b', 'utf8');
    expect(await isSameContent(a, b)).toBe(false);
  });

  it('returns false when either file is missing', async () => {
    const a = path.join(tmpDir, 'a');
    const b = path.join(tmpDir, 'b');
    await fs.writeFile(a, 'content', 'utf8');
    expect(await isSameContent(a, b)).toBe(false);
    expect(await isSameContent(b, a)).toBe(false);
  });
});
