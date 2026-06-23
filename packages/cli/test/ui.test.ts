import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const CANCEL = Symbol('cancel');
const NEW_SENTINEL = Symbol.for('llm-switch:create-new');

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
}));

import { select, input } from '@inquirer/prompts';
import { pickProfile, promptAlias, promptNewAlias, isInquirerCancelError } from '../src/ui.js';
import { UserCancelledError } from '../src/errors.js';
import type { Profile } from '../src/scanner.js';

const mockSelect = vi.mocked(select);
const mockInput = vi.mocked(input);

describe('pickProfile', () => {
  const profiles: Profile[] = [
    { alias: 'glm', path: '/p/glm', active: false },
    { alias: 'kimi', path: '/p/kimi', active: true },
  ];

  let savedIsTTY: boolean | undefined;

  beforeEach(() => {
    savedIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: savedIsTTY, configurable: true });
    vi.clearAllMocks();
  });

  it('returns selected profile', async () => {
    mockSelect.mockResolvedValueOnce(profiles[0]!);
    const result = await pickProfile(profiles);
    expect(result?.alias).toBe('glm');
  });

  it('returns null on cancel', async () => {
    mockSelect.mockResolvedValueOnce(CANCEL as never);
    const result = await pickProfile(profiles);
    expect(result).toBeNull();
  });

  it('pre-selects active profile via default option', async () => {
    mockSelect.mockResolvedValueOnce(profiles[1]!);
    await pickProfile(profiles);
    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        default: profiles[1],
      }),
    );
  });

  it('returns null for empty profiles without calling select', async () => {
    const result = await pickProfile([]);
    expect(result).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('throws UserCancelledError when no TTY', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    await expect(pickProfile(profiles)).rejects.toBeInstanceOf(UserCancelledError);
    expect(mockSelect).not.toHaveBeenCalled();
  });
});

describe('promptAlias', () => {
  let savedIsTTY: boolean | undefined;

  beforeEach(() => {
    savedIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: savedIsTTY, configurable: true });
    vi.clearAllMocks();
  });

  it('returns existing alias when selected', async () => {
    mockSelect.mockResolvedValueOnce('glm');
    const result = await promptAlias(['glm', 'kimi']);
    expect(result).toBe('glm');
  });

  it('falls through to promptNewAlias on "+ Create new"', async () => {
    mockSelect.mockResolvedValueOnce(NEW_SENTINEL as never);
    mockInput.mockResolvedValueOnce('newalias');
    const result = await promptAlias(['glm']);
    expect(mockInput).toHaveBeenCalled();
    expect(result).toBe('newalias');
  });

  it('skips select and calls input directly when existing is empty', async () => {
    mockInput.mockResolvedValueOnce('first');
    const result = await promptAlias([]);
    expect(mockSelect).not.toHaveBeenCalled();
    expect(result).toBe('first');
  });

  it('returns null on cancel at select', async () => {
    mockSelect.mockResolvedValueOnce(CANCEL as never);
    const result = await promptAlias(['glm']);
    expect(result).toBeNull();
  });

  it('returns null on cancel at input (after "+ Create new")', async () => {
    mockSelect.mockResolvedValueOnce(NEW_SENTINEL as never);
    mockInput.mockResolvedValueOnce(CANCEL as never);
    const result = await promptAlias(['glm']);
    expect(result).toBeNull();
  });

  it('throws UserCancelledError when no TTY', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    await expect(promptAlias(['glm'])).rejects.toBeInstanceOf(UserCancelledError);
  });
});

describe('promptNewAlias', () => {
  let savedIsTTY: boolean | undefined;

  beforeEach(() => {
    savedIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: savedIsTTY, configurable: true });
    vi.clearAllMocks();
  });

  it('returns trimmed alias', async () => {
    mockInput.mockResolvedValueOnce('  myalias  ');
    const result = await promptNewAlias([]);
    expect(result).toBe('myalias');
  });

  it('passes validate function that rejects empty input', async () => {
    mockInput.mockResolvedValueOnce('valid');
    await promptNewAlias([]);
    const call = mockInput.mock.calls[0]![0] as { validate?: (v: string) => boolean | string };
    expect(call.validate!('')).toBe('Required');
  });

  it('passes validate function that rejects invalid format', async () => {
    mockInput.mockResolvedValueOnce('valid');
    await promptNewAlias([]);
    const call = mockInput.mock.calls[0]![0] as { validate?: (v: string) => boolean | string };
    expect(call.validate!('BAD!')).toMatch(/Must match/);
  });

  it('passes validate function that rejects duplicates', async () => {
    mockInput.mockResolvedValueOnce('valid');
    await promptNewAlias(['glm']);
    const call = mockInput.mock.calls[0]![0] as { validate?: (v: string) => boolean | string };
    expect(call.validate!('glm')).toMatch(/already exists/);
  });

  it('accepts valid new alias', async () => {
    mockInput.mockResolvedValueOnce('newalias');
    await promptNewAlias(['glm']);
    const call = mockInput.mock.calls[0]![0] as { validate?: (v: string) => boolean | string };
    expect(call.validate!('newalias')).toBe(true);
  });

  it('returns null on cancel', async () => {
    mockInput.mockResolvedValueOnce(CANCEL as never);
    const result = await promptNewAlias([]);
    expect(result).toBeNull();
  });

  it('throws UserCancelledError when no TTY', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    await expect(promptNewAlias([])).rejects.toBeInstanceOf(UserCancelledError);
  });
});

describe('isInquirerCancelError', () => {
  function withName(name: string, msg = 'msg'): Error {
    const e = new Error(msg);
    e.name = name;
    return e;
  }

  it('returns true for ExitPromptError (Ctrl-C)', () => {
    expect(isInquirerCancelError(withName('ExitPromptError'))).toBe(true);
  });

  it('returns true for CancelPromptError (Esc)', () => {
    expect(isInquirerCancelError(withName('CancelPromptError'))).toBe(true);
  });

  it('returns true for AbortPromptError', () => {
    expect(isInquirerCancelError(withName('AbortPromptError'))).toBe(true);
  });

  it('returns false for AppError (already handled separately)', () => {
    expect(isInquirerCancelError(new UserCancelledError('x'))).toBe(false);
  });

  it('returns false for plain Error', () => {
    expect(isInquirerCancelError(new Error('boom'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isInquirerCancelError('string')).toBe(false);
    expect(isInquirerCancelError(null)).toBe(false);
    expect(isInquirerCancelError(undefined)).toBe(false);
    expect(isInquirerCancelError(42)).toBe(false);
    expect(isInquirerCancelError(Symbol('x'))).toBe(false);
  });
});