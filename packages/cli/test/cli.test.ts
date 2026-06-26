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

function run(
  args: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
): Promise<RunResult> {
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

  it('--version matches package.json', async () => {
    const pkgPath = path.resolve(__dirname, '../package.json');
    const pkgRaw = await fs.readFile(pkgPath, 'utf8');
    const expectedVersion = (JSON.parse(pkgRaw) as { version: string }).version;

    const r = await run(['--version']);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(expectedVersion);
  });

  it('list exits 1 when no profiles', async () => {
    const r = await run(['list'], { env: { CLAUDE_CONFIG_DIR: tmpDir, HOME: tmpDir } });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('No profiles found');
  });

  it('list prints profiles from new layout', async () => {
    await fs.mkdir(path.join(tmpDir, 'llm-switch', 'profiles'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'llm-switch', 'profiles', 'glm.json'), '{}');
    await fs.writeFile(path.join(tmpDir, 'llm-switch', 'profiles', 'kimi.json'), '{}');

    const r = await run(['list'], { env: { CLAUDE_CONFIG_DIR: tmpDir, HOME: tmpDir } });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('glm');
    expect(r.stdout).toContain('kimi');
  });

  it('migrates old flat layout on first run and lists profiles', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), '{}');
    await fs.writeFile(path.join(tmpDir, 'settings.json.kimi'), '{}');

    const r = await run(['list'], { env: { CLAUDE_CONFIG_DIR: tmpDir, HOME: tmpDir } });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('glm');
    expect(r.stdout).toContain('kimi');

    const root = await fs.readdir(tmpDir);
    expect(root).not.toContain('settings.json.glm');
    expect(root).toContain('llm-switch');
  });

  it('switch <alias> succeeds', async () => {
    await fs.mkdir(path.join(tmpDir, 'llm-switch', 'profiles'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'settings.json'), '{"a":1}');
    // Profile content must be valid Anthropic format: the refactored switch
    // deserializes then re-serializes, so the active config reflects the
    // profile's env block rather than copying bytes verbatim.
    const profileContent = JSON.stringify({
      env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_MODEL: 'm', ANTHROPIC_AUTH_TOKEN: 'k' },
    });
    await fs.writeFile(path.join(tmpDir, 'llm-switch', 'profiles', 'glm.json'), profileContent);

    const r = await run(['switch', 'glm'], {
      env: { CLAUDE_CONFIG_DIR: tmpDir, HOME: tmpDir },
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Switched to glm');

    const after = await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8');
    expect(JSON.parse(after)).toEqual({
      env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_MODEL: 'm', ANTHROPIC_AUTH_TOKEN: 'k' },
    });

    const bak = await fs.readFile(
      path.join(tmpDir, 'llm-switch', 'backups', 'settings.json.bak'),
      'utf8',
    );
    expect(JSON.parse(bak)).toEqual({ a: 1 });
  });

  it('switch <alias> exits 2 when alias missing', async () => {
    // No settings.json (no active config) and no profile => auto-create fails
    // for all targets => ProfileNotFoundError => exit 2.
    const r = await run(['switch', 'nope'], {
      env: { CLAUDE_CONFIG_DIR: tmpDir, HOME: tmpDir },
    });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('not found');
  });

  it('switch exits 0 with no TTY (user cancel)', async () => {
    await fs.mkdir(path.join(tmpDir, 'llm-switch', 'profiles'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'llm-switch', 'profiles', 'glm.json'), '{}');

    const r = await run(['switch'], { env: { CLAUDE_CONFIG_DIR: tmpDir, HOME: tmpDir } });
    // No TTY => UserCancelledError => exit 0
    expect(r.code).toBe(0);
  });

  it('restore exits 1 with no .bak', async () => {
    const r = await run(['restore'], { env: { CLAUDE_CONFIG_DIR: tmpDir, HOME: tmpDir } });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('No backup');
  });

  it('save <alias> succeeds in new layout', async () => {
    // Active config must be valid Anthropic format: the refactored save
    // deserializes it via the adapter, then re-serializes when writing the
    // profile to the centralized store (HOME/.config/llm-switch/...).
    await fs.writeFile(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({
        env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_MODEL: 'm', ANTHROPIC_AUTH_TOKEN: 'k' },
      }),
    );

    const r = await run(['save', 'glm'], { env: { CLAUDE_CONFIG_DIR: tmpDir, HOME: tmpDir } });
    expect(r.code).toBe(0);

    const profile = await fs.readFile(
      path.join(tmpDir, '.config', 'llm-switch', 'profiles', 'claude', 'glm.json'),
      'utf8',
    );
    expect(JSON.parse(profile)).toEqual({
      env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_MODEL: 'm', ANTHROPIC_AUTH_TOKEN: 'k' },
    });
  });

  it('current prints summary', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://x' } }),
    );

    const r = await run(['current'], { env: { CLAUDE_CONFIG_DIR: tmpDir, HOME: tmpDir } });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Source: default');
    expect(r.stdout).toContain('Base URL: https://x');
  });

  it('create --help mentions create subcommand', async () => {
    const r = await run(['create', '--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('create');
  });

  it('create exits 0 when no TTY (user cancel)', async () => {
    const r = await run(['create'], { env: { CLAUDE_CONFIG_DIR: tmpDir, HOME: tmpDir } });
    expect(r.code).toBe(0);
  });

  it('init --help mentions init', async () => {
    const r = await run(['init', '--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('init');
  });

  it('init exits 0 when no TTY (user cancel)', async () => {
    const r = await run(['init'], { env: { CLAUDE_CONFIG_DIR: tmpDir } });
    expect(r.code).toBe(0);
  });

  it('--target opencode uses opencode paths', async () => {
    await fs.writeFile(path.join(tmpDir, 'opencode.json'), '{"a":1}');
    await fs.mkdir(path.join(tmpDir, 'llm-switch', 'profiles'), { recursive: true });
    const profileContent = JSON.stringify({
      env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_MODEL: 'm', ANTHROPIC_AUTH_TOKEN: 'k' },
    });
    await fs.writeFile(path.join(tmpDir, 'llm-switch', 'profiles', 'glm.json'), profileContent);

    const r = await run(['--target', 'opencode', 'switch', 'glm'], {
      env: { OPENCODE_CONFIG_DIR: tmpDir, HOME: tmpDir },
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Switched to glm');

    const after = await fs.readFile(path.join(tmpDir, 'opencode.json'), 'utf8');
    expect(JSON.parse(after)).toEqual({
      env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_MODEL: 'm', ANTHROPIC_AUTH_TOKEN: 'k' },
    });

    const bak = await fs.readFile(
      path.join(tmpDir, 'llm-switch', 'backups', 'opencode.json.bak'),
      'utf8',
    );
    expect(JSON.parse(bak)).toEqual({ a: 1 });
  });

  it('LLM_SWITCH_TARGET env var selects opencode', async () => {
    await fs.writeFile(path.join(tmpDir, 'opencode.json'), '{"a":1}');
    await fs.mkdir(path.join(tmpDir, 'llm-switch', 'profiles'), { recursive: true });
    const profileContent = JSON.stringify({
      env: { ANTHROPIC_BASE_URL: 'https://x', ANTHROPIC_MODEL: 'm', ANTHROPIC_AUTH_TOKEN: 'k' },
    });
    await fs.writeFile(path.join(tmpDir, 'llm-switch', 'profiles', 'glm.json'), profileContent);

    const r = await run(['switch', 'glm'], {
      env: { OPENCODE_CONFIG_DIR: tmpDir, LLM_SWITCH_TARGET: 'opencode', HOME: tmpDir },
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Switched to glm');
    expect(r.stdout).toContain('OpenCode');
  });
});

describe('cli help output', () => {
  async function helpFor(args: string[]): Promise<string> {
    const r = await run(args);
    expect(r.code).toBe(0);
    return r.stdout;
  }

  it('top-level --help mentions config env vars', async () => {
    const out = await helpFor(['--help']);
    expect(out).toContain('CLAUDE_CONFIG_DIR');
    expect(out).toContain('OPENCODE_CONFIG_DIR');
    expect(out).toContain('LLM_SWITCH_TARGET');
  });

  it('top-level --help mentions the 5 built-in providers', async () => {
    const out = await helpFor(['--help']);
    expect(out).toMatch(/GLM/i);
    expect(out).toMatch(/DeepSeek/i);
    expect(out).toMatch(/Kimi/i);
    expect(out).toMatch(/Qwen/i);
  });

  it('top-level --help documents --target option', async () => {
    const out = await helpFor(['--help']);
    expect(out).toMatch(/-t, --target/);
    expect(out).toMatch(/claude|opencode/);
  });

  for (const cmd of ['list', 'switch', 'restore', 'save', 'create', 'current', 'init']) {
    it(`${cmd} --help contains an "Examples:" section`, async () => {
      const out = await helpFor([cmd, '--help']);
      expect(out).toMatch(/Examples:/i);
    });
  }

  it('switch --help documents the alias format', async () => {
    const out = await helpFor(['switch', '--help']);
    expect(out).toMatch(/alias/i);
    expect(out.length).toBeGreaterThan(200);
  });

  it('save --help documents the alias format', async () => {
    const out = await helpFor(['save', '--help']);
    expect(out).toMatch(/alias/i);
    expect(out.length).toBeGreaterThan(200);
  });

  it('create --help mentions it is interactive-only', async () => {
    const out = await helpFor(['create', '--help']);
    expect(out).toMatch(/TTY/i);
  });

  it('restore --help mentions backup (.bak)', async () => {
    const out = await helpFor(['restore', '--help']);
    expect(out).toMatch(/\.bak/);
  });
});
