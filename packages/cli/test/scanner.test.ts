import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { listProfiles } from '../src/scanner.js';
import { ConfigDirNotFoundError } from '../src/errors.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('listProfiles', () => {
  it('throws ConfigDirNotFoundError when directory missing', async () => {
    const missing = path.join(tmpDir, 'nope');
    await expect(listProfiles(missing as never)).rejects.toBeInstanceOf(ConfigDirNotFoundError);
  });

  it('returns empty array when no profiles', async () => {
    const result = await listProfiles(tmpDir as never);
    expect(result).toEqual([]);
  });

  it('lists settings.json.* excluding .bak', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.kimi'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.bak'), '{}');

    const result = await listProfiles(tmpDir as never);
    const aliases = result.map((p) => p.alias).sort();

    expect(aliases).toEqual(['glm', 'kimi']);
  });

  it('ignores non-matching files', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');
    await fs.writeFile(path.join(tmpDir, 'random.txt'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');

    const result = await listProfiles(tmpDir as never);
    expect(result.map((p) => p.alias)).toEqual(['glm']);
  });

  it('marks active=true when content matches settings.json', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{"a":1}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.kimi'), '{"a":2}');

    const result = await listProfiles(tmpDir as never);
    const glm = result.find((p) => p.alias === 'glm')!;
    const kimi = result.find((p) => p.alias === 'kimi')!;

    expect(glm.active).toBe(true);
    expect(kimi.active).toBe(false);
  });

  it('marks active=false when settings.json missing', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{"a":1}');

    const result = await listProfiles(tmpDir as never);
    expect(result[0]!.active).toBe(false);
  });
});
