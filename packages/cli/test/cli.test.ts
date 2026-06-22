import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const BIN = path.resolve(__dirname, '../bin/llm-switch.js');

interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function run(args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [BIN, ...args], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env, NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('exit', (code) => resolve({ stdout, stderr, code }));
  });
}

describe('cli e2e', () => {
  let tmpDir: string;

  beforeAll(async () => {
    // ensure dist exists; build synchronously if missing
    try {
      await fs.access(path.resolve(__dirname, '../dist/cli.js'));
    } catch {
      const { execSync } = await import('node:child_process');
      execSync('pnpm build', { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    }
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-e2e-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('prints help with --help', async () => {
    const r = await run(['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('llm-switch');
    expect(r.stdout).toContain('switch');
    expect(r.stdout).toContain('list');
  });

  it('list exits 1 when no profiles', async () => {
    const r = await run(['list'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('No profiles found');
  });

  it('list prints profiles', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.kimi'), '{}');

    const r = await run(['list'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('glm');
    expect(r.stdout).toContain('kimi');
  });

  it('switch <alias> succeeds', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{"a":2}');

    const r = await run(['switch', 'glm'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Switched to glm');

    const after = await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8');
    expect(JSON.parse(after)).toEqual({ a: 2 });

    const bak = await fs.readFile(path.join(tmpDir, 'settings.json.bak'), 'utf8');
    expect(JSON.parse(bak)).toEqual({ a: 1 });
  });

  it('switch <alias> exits 2 when alias missing', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{}');

    const r = await run(['switch', 'nope'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('not found');
  });

  it('switch exits 0 with no TTY (user cancel)', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');

    const r = await run(['switch'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    // No TTY => UserCancelledError => exit 0
    expect(r.code).toBe(0);
  });

  it('restore exits 1 with no .bak', async () => {
    const r = await run(['restore'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('No backup');
  });

  it('save <alias> succeeds', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');

    const r = await run(['save', 'glm'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(0);

    const profile = await fs.readFile(path.join(tmpDir, 'settings.json.glm'), 'utf8');
    expect(JSON.parse(profile)).toEqual({ a: 1 });
  });

  it('current prints summary', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://x' } }),
    );

    const r = await run(['current'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Source: default');
    expect(r.stdout).toContain('Base URL: https://x');
  });
});