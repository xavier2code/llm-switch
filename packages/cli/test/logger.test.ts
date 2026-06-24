import { describe, it, expect } from 'vitest';
import { log } from '../src/logger.js';

describe('log', () => {
  it('exposes only the error method (the only one used by the CLI)', () => {
    expect(Object.keys(log).sort()).toEqual(['error']);
  });

  it('error writes to stderr with a trailing newline', () => {
    const writes: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') writes.push(chunk);
      return true;
    }) as typeof process.stderr.write;

    try {
      log.error('boom');
    } finally {
      process.stderr.write = origWrite;
    }

    expect(writes.join('')).toMatch(/boom\n/);
  });
});
