import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';

const CANCEL = Symbol('cancel');

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
}));

import { select, input, password, confirm } from '@inquirer/prompts';
import { run } from '../../src/commands/create.js';
import { UserCancelledError, ValidationError } from '../../src/errors.js';

const mockSelect = vi.mocked(select);
const mockInput = vi.mocked(input);
const mockPassword = vi.mocked(password);
const mockConfirm = vi.mocked(confirm);

let tmpDir: string;
let savedEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-test-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

function mockIO() {
  const writes: string[] = [];
  return {
    writes,
    stdin: Readable.from(['']),
    stdout: { write: (s: string) => writes.push(s) },
    stderr: { write: (s: string) => writes.push(s) },
  };
}

describe('create command', () => {
  it('throws UserCancelledError when not TTY', async () => {
    const io = { ...mockIO(), isTTY: false };
    await expect(run(io as never)).rejects.toBeInstanceOf(UserCancelledError);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('throws UserCancelledError when provider select cancelled', async () => {
    mockSelect.mockResolvedValueOnce(CANCEL as never);
    const io = { ...mockIO(), isTTY: true };
    await expect(run(io as never)).rejects.toBeInstanceOf(UserCancelledError);
  });

  it('throws UserCancelledError when alias input cancelled', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce(CANCEL as never);
    const io = { ...mockIO(), isTTY: true };
    await expect(run(io as never)).rejects.toBeInstanceOf(UserCancelledError);
  });

  it('alias input uses provider id as default', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const call = mockInput.mock.calls[0]?.[0] as { default?: string };
    expect(call.default).toBe('glm');
  });

  it('alias input validate rejects empty', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const call = mockInput.mock.calls[0]?.[0] as { validate?: (v: string) => boolean | string };
    expect(call.validate!('')).toBe('Required');
    expect(call.validate!('   ')).toBe('Required');
  });

  it('alias input validate rejects invalid format', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const call = mockInput.mock.calls[0]?.[0] as { validate?: (v: string) => boolean | string };
    expect(call.validate!('BAD!')).toMatch(/Invalid alias/);
    expect(call.validate!('GLM')).toMatch(/Invalid alias/);
  });

  it('alias input validate accepts valid alias', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const call = mockInput.mock.calls[0]?.[0] as { validate?: (v: string) => boolean | string };
    expect(call.validate!('glm')).toBe(true);
    expect(call.validate!('glm-v2')).toBe(true);
  });

  it('provider select presents 5 choices with displayName', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const call = mockSelect.mock.calls[0]?.[0] as {
      choices?: Array<{ name: string; value: string }>;
    };
    expect(call.choices).toHaveLength(5);
    const ids = call.choices!.map((c) => c.value).sort();
    expect(ids).toEqual(['deepseek', 'glm', 'kimi', 'minimax', 'qwen']);
    expect(call.choices!.find((c) => c.value === 'glm')?.name).toContain('GLM');
  });

  it('confirm shows Use default question with default true', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const call = mockConfirm.mock.calls[0]?.[0] as { message?: string; default?: boolean };
    expect(call.message).toMatch(/Use default/);
    expect(call.default).toBe(true);
  });

  it('when user rejects defaults, prompts for custom BASE_URL then model', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput
      .mockResolvedValueOnce('glm')
      .mockResolvedValueOnce('https://my-proxy.example.com/anthropic')
      .mockResolvedValueOnce('custom-model');
    mockConfirm.mockResolvedValueOnce(false);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    expect(mockInput).toHaveBeenCalledTimes(3);
    const urlCall = mockInput.mock.calls[1]?.[0] as { message?: string };
    expect(urlCall.message).toMatch(/BASE URL/i);
    const modelCall = mockInput.mock.calls[2]?.[0] as { message?: string };
    expect(modelCall.message).toBe('Model:');

    expect(validateFn).toHaveBeenCalledWith(
      'https://my-proxy.example.com/anthropic',
      'custom-model',
      'key',
    );
  });

  it('BASE_URL and model inputs reject empty', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput
      .mockResolvedValueOnce('glm')
      .mockResolvedValueOnce('https://x')
      .mockResolvedValueOnce('m');
    mockConfirm.mockResolvedValueOnce(false);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const urlCall = mockInput.mock.calls[1]?.[0] as { validate?: (v: string) => boolean | string };
    expect(urlCall.validate!('')).toBe('Required');
    const modelCall = mockInput.mock.calls[2]?.[0] as {
      validate?: (v: string) => boolean | string;
    };
    expect(modelCall.validate!('')).toBe('Required');
  });

  it('when user accepts defaults, validator called with provider default URL and model', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    expect(validateFn).toHaveBeenCalledWith(
      'https://open.bigmodel.cn/api/anthropic',
      'glm-4.5',
      'key',
    );
  });

  it('password input uses mask * and rejects empty', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const call = mockPassword.mock.calls[0]?.[0] as {
      mask?: string;
      validate?: (v: string) => boolean | string;
    };
    expect(call.mask).toBe('*');
    expect(call.validate!('')).toBe('Required');
  });

  it('happy path: validate succeeds and flow continues to write', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('sk-test-123');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    expect(validateFn).toHaveBeenCalledWith(
      'https://open.bigmodel.cn/api/anthropic',
      'glm-4.5',
      'sk-test-123',
    );
    const profile = JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json.glm'), 'utf8'));
    expect(profile.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test-123');
  });

  it('validation fails → submenu: Enter a different key → loops password then succeeds', async () => {
    mockSelect
      .mockResolvedValueOnce('glm') // provider
      .mockResolvedValueOnce('newkey'); // submenu
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('bad-key').mockResolvedValueOnce('good-key');
    const validateFn = vi
      .fn()
      .mockRejectedValueOnce(new ValidationError('Invalid API key (401).'))
      .mockResolvedValueOnce(undefined);

    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    expect(validateFn).toHaveBeenCalledTimes(2);
    expect(validateFn.mock.calls[0]?.[2]).toBe('bad-key');
    expect(validateFn.mock.calls[1]?.[2]).toBe('good-key');
  });

  it('validation fails → submenu: Cancel → UserCancelledError', async () => {
    mockSelect.mockResolvedValueOnce('glm').mockResolvedValueOnce('cancel');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('bad-key');
    const validateFn = vi.fn().mockRejectedValueOnce(new ValidationError('boom'));

    const io = { ...mockIO(), isTTY: true, validateFn };
    await expect(run(io as never)).rejects.toBeInstanceOf(UserCancelledError);
    expect(validateFn).toHaveBeenCalledOnce();
  });

  it('validation fails → submenu: Edit BASE_URL/model → prompts URL+model, re-validates with same key', async () => {
    mockSelect.mockResolvedValueOnce('glm').mockResolvedValueOnce('edit');
    mockInput
      .mockResolvedValueOnce('glm')
      .mockResolvedValueOnce('https://my-proxy.example.com/anthropic')
      .mockResolvedValueOnce('custom-model');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi
      .fn()
      .mockRejectedValueOnce(new ValidationError('boom'))
      .mockResolvedValueOnce(undefined);

    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    expect(validateFn).toHaveBeenCalledTimes(2);
    expect(validateFn.mock.calls[1]?.[0]).toBe('https://my-proxy.example.com/anthropic');
    expect(validateFn.mock.calls[1]?.[1]).toBe('custom-model');
    expect(validateFn.mock.calls[1]?.[2]).toBe('key');
  });

  it('validation fails → submenu: Retry with same key → re-validates with same params', async () => {
    mockSelect.mockResolvedValueOnce('glm').mockResolvedValueOnce('retry');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi
      .fn()
      .mockRejectedValueOnce(new ValidationError('boom'))
      .mockResolvedValueOnce(undefined);

    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    expect(validateFn).toHaveBeenCalledTimes(2);
    expect(validateFn.mock.calls[0]).toEqual(validateFn.mock.calls[1]);
  });

  it('validation error message is printed to stderr', async () => {
    mockSelect.mockResolvedValueOnce('glm').mockResolvedValueOnce('cancel');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('bad-key');
    const validateFn = vi.fn().mockRejectedValueOnce(new ValidationError('boom: bad key'));

    const io = { ...mockIO(), isTTY: true, validateFn };
    await expect(run(io as never)).rejects.toBeInstanceOf(UserCancelledError);
    expect(io.writes.join('')).toContain('boom: bad key');
  });

  it('when profile exists, prompts Overwrite? with default false', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), JSON.stringify({ OLD: 'yes' }));

    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm
      .mockResolvedValueOnce(true) // use defaults
      .mockResolvedValueOnce(true); // overwrite = yes
    mockPassword.mockResolvedValueOnce('new-key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);

    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const overwriteCall = mockConfirm.mock.calls[1]?.[0] as { message?: string; default?: boolean };
    expect(overwriteCall.message).toMatch(/exists.*Overwrite/);
    expect(overwriteCall.default).toBe(false);

    const profile = JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json.glm'), 'utf8'));
    expect(profile.env.ANTHROPIC_AUTH_TOKEN).toBe('new-key');
  });

  it('when profile exists and user declines overwrite → UserCancelledError, file unchanged', async () => {
    await fs.writeFile(path.join(tmpDir, 'settings.json.glm'), JSON.stringify({ OLD: 'yes' }));

    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);

    const io = { ...mockIO(), isTTY: true, validateFn };
    await expect(run(io as never)).rejects.toBeInstanceOf(UserCancelledError);

    const profile = await fs.readFile(path.join(tmpDir, 'settings.json.glm'), 'utf8');
    expect(JSON.parse(profile)).toEqual({ OLD: 'yes' });
  });

  it('writes JSON with env containing ANTHROPIC_BASE_URL, MODEL, AUTH_TOKEN', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('sk-xyz');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const profile = await fs.readFile(path.join(tmpDir, 'settings.json.glm'), 'utf8');
    const parsed = JSON.parse(profile);
    expect(parsed).toEqual({
      env: {
        ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
        ANTHROPIC_MODEL: 'glm-4.5',
        ANTHROPIC_AUTH_TOKEN: 'sk-xyz',
      },
    });
  });

  it('activates profile: settings.json matches profile and backup created', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({ env: { PREV: 'yes' } }),
    );

    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const settings = JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8'));
    expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('key');
    const bak = JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json.bak'), 'utf8'));
    expect(bak.env.PREV).toBe('yes');
  });

  it('writes profile file with mode 0600 to protect API key', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('sk-secret-123');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    const stat = await fs.stat(path.join(tmpDir, 'settings.json.glm'));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('prints success message to stdout', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    const validateFn = vi.fn().mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true, validateFn };
    await run(io as never);

    expect(io.writes.join('')).toContain("Created and activated 'glm'");
    expect(io.writes.join('')).toMatch(/Restart Claude Code/);
  });
});
