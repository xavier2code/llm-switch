import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { pickProfile, promptAlias } from '../src/ui.js';
import type { Profile } from '../src/scanner.js';

function mockReadline(input: string) {
  return Readable.from([input]);
}

describe('pickProfile', () => {
  const profiles: Profile[] = [
    { alias: 'glm', path: '/p/glm', active: false },
    { alias: 'kimi', path: '/p/kimi', active: true },
  ];

  it('returns the selected profile', async () => {
    const result = await pickProfile(profiles, { input: mockReadline('1\n'), output: process.stdout });
    expect(result?.alias).toBe('glm');
  });

  it('returns null on empty input (cancel)', async () => {
    const result = await pickProfile(profiles, { input: mockReadline('\n'), output: process.stdout });
    expect(result).toBeNull();
  });

  it('returns null on invalid input', async () => {
    const result = await pickProfile(profiles, { input: mockReadline('99\n'), output: process.stdout });
    expect(result).toBeNull();
  });
});

describe('promptAlias', () => {
  it('returns trimmed alias', async () => {
    const result = await promptAlias([], { input: mockReadline('  myprofile  \n'), output: process.stdout });
    expect(result).toBe('myprofile');
  });

  it('returns null on empty input', async () => {
    const result = await promptAlias([], { input: mockReadline('\n'), output: process.stdout });
    expect(result).toBeNull();
  });

  it('returns null when input matches an existing alias', async () => {
    const result = await promptAlias(['glm'], { input: mockReadline('glm\n'), output: process.stdout });
    expect(result).toBeNull();
  });
});
