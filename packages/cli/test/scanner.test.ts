import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { listProfiles } from '../src/scanner.js';
import { ConfigDirNotFoundError } from '../src/errors.js';
import { mockClaudeTarget } from './helpers.js';

let tmpDir: string;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function profilesDir(): Promise<string> {
  return path.join(tmpDir, 'llm-switch', 'profiles');
}

async function setupProfilesDir(): Promise<void> {
  await fs.mkdir(await profilesDir(), { recursive: true });
}

describe('listProfiles', () => {
  it('throws ConfigDirNotFoundError when profiles directory missing', async () => {
    await expect(listProfiles(target)).rejects.toBeInstanceOf(ConfigDirNotFoundError);
  });

  it('returns empty array when no profiles', async () => {
    await setupProfilesDir();
    const result = await listProfiles(target);
    expect(result).toEqual([]);
  });

  it('lists profiles/*.json excluding backups', async () => {
    await setupProfilesDir();
    await fs.mkdir(path.join(tmpDir, 'llm-switch', 'backups'), { recursive: true });
    await fs.writeFile(path.join(await profilesDir(), 'glm.json'), '{}');
    await fs.writeFile(path.join(await profilesDir(), 'kimi.json'), '{}');
    await fs.writeFile(path.join(tmpDir, 'llm-switch', 'backups', 'settings.json.bak'), '{}');

    const result = await listProfiles(target);
    const aliases = result.map((p) => p.alias).sort();

    expect(aliases).toEqual(['glm', 'kimi']);
  });

  it('ignores non-matching files', async () => {
    await setupProfilesDir();
    await fs.writeFile(path.join(await profilesDir(), 'glm.json'), '{}');
    await fs.writeFile(path.join(await profilesDir(), 'random.txt'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');

    const result = await listProfiles(target);
    expect(result.map((p) => p.alias)).toEqual(['glm']);
  });

  it('marks active=true when content matches settings.json', async () => {
    await setupProfilesDir();
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    await fs.writeFile(path.join(await profilesDir(), 'glm.json'), '{"a":1}');
    await fs.writeFile(path.join(await profilesDir(), 'kimi.json'), '{"a":2}');

    const result = await listProfiles(target);
    const glm = result.find((p) => p.alias === 'glm')!;
    const kimi = result.find((p) => p.alias === 'kimi')!;

    expect(glm.active).toBe(true);
    expect(kimi.active).toBe(false);
  });

  it('marks active=false when settings.json missing', async () => {
    await setupProfilesDir();
    await fs.writeFile(path.join(await profilesDir(), 'glm.json'), '{"a":1}');

    const result = await listProfiles(target);
    expect(result[0]!.active).toBe(false);
  });
});
