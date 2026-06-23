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
import { UserCancelledError } from '../../src/errors.js';

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

    const call = mockSelect.mock.calls[0]?.[0] as { choices?: Array<{ name: string; value: string }> };
    expect(call.choices).toHaveLength(5);
    const ids = call.choices!.map((c) => c.value).sort();
    expect(ids).toEqual(['deepseek', 'glm', 'kimi', 'minimax', 'qwen']);
    expect(call.choices!.find((c) => c.value === 'glm')?.name).toContain('GLM');
  });
});