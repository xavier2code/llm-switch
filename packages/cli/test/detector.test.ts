import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { isToolBinaryInstalled, detectInstalledTargets } from '../src/detector.js';
import { mockClaudeTarget, mockOpencodeTarget } from './helpers.js';

const mockExec = vi.mocked(execFileSync);

describe('isToolBinaryInstalled', () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it('returns true when the binary resolves (exec does not throw)', () => {
    mockExec.mockReturnValue(Buffer.from('/usr/local/bin/claude'));
    expect(isToolBinaryInstalled(mockClaudeTarget())).toBe(true);
  });

  it('returns false when exec throws', () => {
    mockExec.mockImplementation(() => {
      throw new Error('spawn ENOENT');
    });
    expect(isToolBinaryInstalled(mockOpencodeTarget())).toBe(false);
  });

  it('on unix, invokes sh -c with the target binary name', () => {
    mockExec.mockReturnValue(Buffer.from(''));
    isToolBinaryInstalled(mockOpencodeTarget());
    const [cmd, args] = mockExec.mock.calls[0] ?? [];
    expect(cmd).toBe('sh');
    expect(args).toEqual(['-c', 'command -v opencode']);
  });

  it('on Windows, invokes where with the target binary name', () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      mockExec.mockReturnValue(Buffer.from(''));
      isToolBinaryInstalled(mockClaudeTarget());
      const [cmd, args] = mockExec.mock.calls[0] ?? [];
      expect(cmd).toBe('where');
      expect(args).toEqual(['claude']);
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    }
  });
});

describe('detectInstalledTargets', () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it('reports per-target presence across the registry', () => {
    mockExec.mockImplementation((_cmd, args) => {
      if ((args as string[]).some((a) => a.includes('opencode'))) return Buffer.from('');
      throw new Error('not found');
    });
    const result = detectInstalledTargets();
    expect(result.opencode).toBe(true);
    expect(result.claude).toBe(false);
  });
});
