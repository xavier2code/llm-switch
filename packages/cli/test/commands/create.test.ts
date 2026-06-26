import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const CANCEL = Symbol('cancel');

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('../../src/validator.js', () => ({
  validateAnthropic: vi.fn(),
  validateOpenAi: vi.fn(),
}));

import { select, input, password, confirm } from '@inquirer/prompts';
import { validateAnthropic, validateOpenAi } from '../../src/validator.js';
import { run } from '../../src/commands/create.js';
import { UserCancelledError, ValidationError } from '../../src/errors.js';
import { ProfileStore } from '../../src/store/profile-store.js';
import { mockClaudeTarget, mockCodexTarget } from '../helpers.js';

const mockSelect = vi.mocked(select);
const mockInput = vi.mocked(input);
const mockPassword = vi.mocked(password);
const mockConfirm = vi.mocked(confirm);
const mockValidateAnthropic = vi.mocked(validateAnthropic);
const mockValidateOpenAi = vi.mocked(validateOpenAi);

let tmpDir: string;
let savedEnv: string | undefined;
let store: ProfileStore;
const target = mockClaudeTarget();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-switch-create-'));
  savedEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, 'llm-switch'));
});

afterEach(async () => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
  mockValidateAnthropic.mockReset();
  mockValidateOpenAi.mockReset();
});

function mockIO() {
  const writes: string[] = [];
  return {
    writes,
    stdout: { write: (s: string) => writes.push(s) },
    stderr: { write: (s: string) => writes.push(s) },
  };
}

// Happy path for a single anthropic target: provider=glm, alias=glm, accept
// defaults, key, validate ok.
function happyMocks(provider = 'glm', alias = 'glm', key = 'sk-test') {
  mockSelect.mockResolvedValueOnce(provider as never);
  mockInput.mockResolvedValueOnce(alias as never);
  mockConfirm.mockResolvedValueOnce(true as never);
  mockPassword.mockResolvedValueOnce(key as never);
  mockValidateAnthropic.mockResolvedValue(undefined);
}

describe('create command', () => {
  it('throws UserCancelledError when not TTY', async () => {
    const io = { ...mockIO(), isTTY: false };
    await expect(run({ targets: [target], store, ...io })).rejects.toBeInstanceOf(
      UserCancelledError,
    );
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('throws UserCancelledError when provider select cancelled', async () => {
    mockSelect.mockResolvedValueOnce(CANCEL as never);
    const io = { ...mockIO(), isTTY: true };
    await expect(run({ targets: [target], store, ...io })).rejects.toBeInstanceOf(
      UserCancelledError,
    );
  });

  it('throws UserCancelledError when alias input cancelled', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce(CANCEL as never);
    const io = { ...mockIO(), isTTY: true };
    await expect(run({ targets: [target], store, ...io })).rejects.toBeInstanceOf(
      UserCancelledError,
    );
  });

  it('provider select presents the anthropic-family providers', async () => {
    happyMocks();
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    const call = mockSelect.mock.calls[0]?.[0] as {
      message?: string;
      choices?: Array<{ name: string; value: string }>;
    };
    expect(call.message).toMatch(/anthropic family/);
    const ids = call.choices!.map((c) => c.value).sort();
    expect(ids).toEqual(['deepseek', 'glm', 'kimi', 'minimax', 'qwen']);
  });

  it('skips provider select when family has a single provider (openai/codex)', async () => {
    const codex = mockCodexTarget();
    // No provider select (openai is the only openai-family provider).
    mockInput.mockResolvedValueOnce('openai' as never);
    mockConfirm.mockResolvedValueOnce(true as never);
    mockPassword.mockResolvedValueOnce('key' as never);
    mockValidateOpenAi.mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [codex], store, ...io });
    expect(mockSelect).not.toHaveBeenCalled();

    const saved = await store.readProfile(codex, 'openai');
    expect(saved).not.toBeNull();
    expect(saved?.baseUrl).toBe('https://api.openai.com/v1');
    expect(saved?.providerId).toBe('openai');
  });

  it('alias input uses first family provider id as default', async () => {
    happyMocks();
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    const call = mockInput.mock.calls[0]?.[0] as { default?: string };
    expect(call.default).toBe('glm');
  });

  it('alias input validate rejects empty and invalid, accepts valid', async () => {
    happyMocks();
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    const call = mockInput.mock.calls[0]?.[0] as { validate?: (v: string) => boolean | string };
    expect(call.validate!('')).toBe('Required');
    expect(call.validate!('BAD!')).toMatch(/Invalid alias/);
    expect(call.validate!('glm')).toBe(true);
  });

  it('confirm shows per-family defaults question with default true', async () => {
    happyMocks();
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    const call = mockConfirm.mock.calls[0]?.[0] as { message?: string; default?: boolean };
    expect(call.message).toMatch(/anthropic.*default/);
    expect(call.default).toBe(true);
  });

  it('rejecting defaults prompts for BASE URL then model', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput
      .mockResolvedValueOnce('glm')
      .mockResolvedValueOnce('https://proxy')
      .mockResolvedValueOnce('custom-model');
    mockConfirm.mockResolvedValueOnce(false);
    mockPassword.mockResolvedValueOnce('key');
    mockValidateAnthropic.mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    expect(mockValidateAnthropic).toHaveBeenCalledWith('https://proxy', 'custom-model', 'key');
  });

  it('BASE_URL and model inputs reject empty', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    mockInput
      .mockResolvedValueOnce('glm')
      .mockResolvedValueOnce('https://x')
      .mockResolvedValueOnce('m');
    mockConfirm.mockResolvedValueOnce(false);
    mockPassword.mockResolvedValueOnce('key');
    mockValidateAnthropic.mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    const urlCall = mockInput.mock.calls[1]?.[0] as { validate?: (v: string) => boolean | string };
    expect(urlCall.validate!('')).toBe('Required');
    const modelCall = mockInput.mock.calls[2]?.[0] as {
      validate?: (v: string) => boolean | string;
    };
    expect(modelCall.validate!('')).toBe('Required');
  });

  it('accepting defaults validates with provider default URL and model', async () => {
    happyMocks();
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    expect(mockValidateAnthropic).toHaveBeenCalledWith(
      'https://open.bigmodel.cn/api/anthropic',
      'glm-4.5',
      'sk-test',
    );
  });

  it('password input uses mask * and rejects empty', async () => {
    happyMocks();
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    const call = mockPassword.mock.calls[0]?.[0] as {
      mask?: string;
      validate?: (v: string) => boolean | string;
    };
    expect(call.mask).toBe('*');
    expect(call.validate!('')).toBe('Required');
  });

  it('creates profile for anthropic target with defaults', async () => {
    happyMocks();
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    const saved = await store.readProfile(target, 'glm');
    expect(saved).not.toBeNull();
    expect(saved?.baseUrl).toBe('https://open.bigmodel.cn/api/anthropic');
    expect(saved?.model).toBe('glm-4.5');
    expect(saved?.apiKey).toBe('sk-test');
    expect(saved?.providerId).toBe('glm');

    const active = await store.adapter(target).readActive();
    expect(active?.apiKey).toBe('sk-test');
  });

  it('writes profile file with mode 0600 to protect API key', async () => {
    happyMocks();
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    const profileFile = store.adapter(target).profilePath('glm');
    const stat = await fs.stat(profileFile);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('activates profile: settings.json matches profile and backup created', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({ env: { PREV: 'yes' } }),
    );

    happyMocks();
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    const settings = JSON.parse(await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8'));
    expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test');
    const bak = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'llm-switch', 'backups', 'settings.json.bak'), 'utf8'),
    );
    expect(bak.env.PREV).toBe('yes');
  });

  it('validation failure → submenu: Cancel → UserCancelledError', async () => {
    mockSelect.mockResolvedValueOnce('glm').mockResolvedValueOnce('cancel');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('bad');
    mockValidateAnthropic.mockRejectedValueOnce(new ValidationError('boom'));
    const io = { ...mockIO(), isTTY: true };

    await expect(run({ targets: [target], store, ...io })).rejects.toBeInstanceOf(
      UserCancelledError,
    );
    expect(mockValidateAnthropic).toHaveBeenCalledOnce();
  });

  it('validation error message is printed to stderr', async () => {
    mockSelect.mockResolvedValueOnce('glm').mockResolvedValueOnce('cancel');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('bad');
    mockValidateAnthropic.mockRejectedValueOnce(new ValidationError('boom: bad key'));
    const io = { ...mockIO(), isTTY: true };

    await expect(run({ targets: [target], store, ...io })).rejects.toBeInstanceOf(
      UserCancelledError,
    );
    expect(io.writes.join('')).toContain('boom: bad key');
  });

  it('validation failure → newkey → retries password then succeeds', async () => {
    mockSelect.mockResolvedValueOnce('glm').mockResolvedValueOnce('newkey');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('bad').mockResolvedValueOnce('good');
    mockValidateAnthropic
      .mockRejectedValueOnce(new ValidationError('x'))
      .mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    expect(mockValidateAnthropic).toHaveBeenCalledTimes(2);
    expect(mockValidateAnthropic.mock.calls[1]?.[2]).toBe('good');
  });

  it('validation failure → retry → re-validates with same params', async () => {
    mockSelect.mockResolvedValueOnce('glm').mockResolvedValueOnce('retry');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    mockValidateAnthropic
      .mockRejectedValueOnce(new ValidationError('boom'))
      .mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    expect(mockValidateAnthropic).toHaveBeenCalledTimes(2);
    expect(mockValidateAnthropic.mock.calls[0]).toEqual(mockValidateAnthropic.mock.calls[1]);
  });

  it('validation failure → edit → re-prompts BASE_URL/model, re-validates with same key', async () => {
    mockSelect.mockResolvedValueOnce('glm').mockResolvedValueOnce('edit');
    mockInput
      .mockResolvedValueOnce('glm')
      .mockResolvedValueOnce('https://my-proxy.example.com/anthropic')
      .mockResolvedValueOnce('custom-model');
    mockConfirm.mockResolvedValueOnce(true);
    mockPassword.mockResolvedValueOnce('key');
    mockValidateAnthropic
      .mockRejectedValueOnce(new ValidationError('boom'))
      .mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    expect(mockValidateAnthropic).toHaveBeenCalledTimes(2);
    expect(mockValidateAnthropic.mock.calls[1]?.[0]).toBe('https://my-proxy.example.com/anthropic');
    expect(mockValidateAnthropic.mock.calls[1]?.[1]).toBe('custom-model');
    expect(mockValidateAnthropic.mock.calls[1]?.[2]).toBe('key');
  });

  it('when profile exists, prompts Overwrite? with default false', async () => {
    // Pre-seed the profile file in the store.
    await store.writeProfile(target, 'glm', {
      providerId: 'glm',
      baseUrl: 'https://old',
      model: 'old-model',
      apiKey: 'old-key',
      extra: {},
    });

    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(true); // defaults, then overwrite
    mockPassword.mockResolvedValueOnce('new-key');
    mockValidateAnthropic.mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    const overwriteCall = mockConfirm.mock.calls[1]?.[0] as { message?: string; default?: boolean };
    expect(overwriteCall.message).toMatch(/exists.*Overwrite/);
    expect(overwriteCall.default).toBe(false);

    const saved = await store.readProfile(target, 'glm');
    expect(saved?.apiKey).toBe('new-key');
  });

  it('when profile exists and user declines overwrite → UserCancelledError, file unchanged', async () => {
    await store.writeProfile(target, 'glm', {
      providerId: 'glm',
      baseUrl: 'https://old',
      model: 'old-model',
      apiKey: 'old-key',
      extra: {},
    });

    mockSelect.mockResolvedValueOnce('glm');
    mockInput.mockResolvedValueOnce('glm');
    mockConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mockPassword.mockResolvedValueOnce('key');
    mockValidateAnthropic.mockResolvedValueOnce(undefined);
    const io = { ...mockIO(), isTTY: true };

    await expect(run({ targets: [target], store, ...io })).rejects.toBeInstanceOf(
      UserCancelledError,
    );
    const saved = await store.readProfile(target, 'glm');
    expect(saved?.apiKey).toBe('old-key');
  });

  it('prints success message with target name and restart hint', async () => {
    happyMocks();
    const io = { ...mockIO(), isTTY: true };
    await run({ targets: [target], store, ...io });

    const out = io.writes.join('');
    expect(out).toContain("Created and activated 'glm'");
    expect(out).toContain('Claude Code');
    expect(out).toMatch(/Restart Claude Code/);
  });
});
