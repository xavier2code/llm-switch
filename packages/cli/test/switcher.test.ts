import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { switchTo } from '../src/switcher.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('switchTo', () => {
  it('backs up current settings, copies source, replaces atomically', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    const source = path.join(tmpDir, 'settings.json.glm');

    await fs.writeFile(settings, '{"old":true}');
    await fs.writeFile(source, '{"new":true}');

    await switchTo(source, settings, backup);

    expect(JSON.parse(await fs.readFile(settings, 'utf8'))).toEqual({ new: true });
    expect(JSON.parse(await fs.readFile(backup, 'utf8'))).toEqual({ old: true });
  });

  it('works when no current settings.json exists', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    const source = path.join(tmpDir, 'settings.json.glm');
    await fs.writeFile(source, '{"new":true}');

    await switchTo(source, settings, backup);

    expect(JSON.parse(await fs.readFile(settings, 'utf8'))).toEqual({ new: true });
    await expect(fs.access(backup)).rejects.toThrow();
  });

  it('cleans up tmp file when source copy fails', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    await fs.writeFile(settings, '{"old":true}');

    await expect(switchTo('/nonexistent/path', settings, backup)).rejects.toThrow();

    expect(JSON.parse(await fs.readFile(settings, 'utf8'))).toEqual({ old: true });
    const files = await fs.readdir(tmpDir);
    expect(files.filter((f) => f.includes('tmp'))).toEqual([]);
  });

  it('preserves settings.json when rename fails (atomicity)', async () => {
    const settings = path.join(tmpDir, 'settings.json');
    const backup = path.join(tmpDir, 'settings.json.bak');
    const source = path.join(tmpDir, 'settings.json.glm');

    await fs.writeFile(settings, '{"old":true}');
    await fs.writeFile(source, '{"new":true}');

    const realRename = fs.rename;
    const spy = vi.spyOn(fs, 'rename').mockImplementation(async (src, dst) => {
      if (typeof dst === 'string' && dst === settings) {
        throw new Error('simulated rename failure');
      }
      return realRename(src, dst);
    });

    await expect(switchTo(source, settings, backup)).rejects.toThrow(/simulated/);

    expect(JSON.parse(await fs.readFile(settings, 'utf8'))).toEqual({ old: true });

    spy.mockRestore();
  });
});