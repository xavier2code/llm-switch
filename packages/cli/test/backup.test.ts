import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { backupCurrent, restoreBackup } from '../src/backup.js';
import { NoBackupError } from '../src/errors.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('backupCurrent', () => {
  it('skips silently when settings.json does not exist', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    await backupCurrent(settings, backup);
    await expect(fs.access(backup)).rejects.toThrow();
  });

  it('overwrites existing .bak with current settings', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    await fs.writeFile(settings, '{"new":true}');
    await fs.writeFile(backup, '{"old":true}');

    await backupCurrent(settings, backup);

    const bakContent = await fs.readFile(backup, 'utf8');
    expect(JSON.parse(bakContent)).toEqual({ new: true });
  });

  it('copies exact bytes (no formatting change)', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    const raw = '{"a":1,"b":2}';
    await fs.writeFile(settings, raw);

    await backupCurrent(settings, backup);

    expect(await fs.readFile(backup, 'utf8')).toBe(raw);
  });

  it('writes backup file with mode 0600 to protect any prior API key', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');

    await fs.writeFile(settings, JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: 'sk-secret' } }));

    await backupCurrent(settings, backup);

    const stat = await fs.stat(backup);
    expect(stat.mode & 0o777).toBe(0o600);
  });
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
