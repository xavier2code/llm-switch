import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  execFile: vi.fn(),
}));

import { execFile, execFileSync } from 'node:child_process';
import { isToolBinaryInstalled, detectInstalledTargets } from '@llm-switch/core/detector.js';
import { mockClaudeTarget, mockOpencodeTarget } from './helpers.js';

const mockExecSync = vi.mocked(execFileSync);
const mockExec = vi.mocked(execFile);

describe('isToolBinaryInstalled', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it('returns true when the binary resolves (exec does not throw)', () => {
    mockExecSync.mockReturnValue(Buffer.from('/usr/local/bin/claude'));
    expect(isToolBinaryInstalled(mockClaudeTarget())).toBe(true);
  });

  it('returns false when exec throws', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('spawn ENOENT');
    });
    expect(isToolBinaryInstalled(mockOpencodeTarget())).toBe(false);
  });

  it('on unix, invokes sh -c with the binary name as positional arg', () => {
    mockExecSync.mockReturnValue(Buffer.from(''));
    isToolBinaryInstalled(mockOpencodeTarget());
    const [cmd, args] = mockExecSync.mock.calls[0] ?? [];
    expect(cmd).toBe('sh');
    expect(args).toEqual(['-c', 'command -v "$1"', 'sh', 'opencode']);
  });

  it('on Windows, invokes where with the target binary name', () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      mockExecSync.mockReturnValue(Buffer.from(''));
      isToolBinaryInstalled(mockClaudeTarget());
      const [cmd, args] = mockExecSync.mock.calls[0] ?? [];
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

  it('reports per-target presence across the registry', async () => {
    mockExec.mockImplementation((_cmd, args) => {
      if ((args as string[]).some((a) => a.includes('opencode'))) {
        return Promise.resolve({ stdout: Buffer.from(''), stderr: Buffer.from('') });
      }
      return Promise.reject(new Error('not found'));
    });
    const result = await detectInstalledTargets();
    expect(result.opencode).toBe(true);
    expect(result.claude).toBe(false);
  });
});
