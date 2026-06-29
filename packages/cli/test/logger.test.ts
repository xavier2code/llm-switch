import { describe, it, expect } from 'vitest';
import { log } from '../src/logger.js';

describe('log', () => {
  it('exposes info, warn, and error methods', () => {
    expect(Object.keys(log).sort()).toEqual(['error', 'info', 'warn']);
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

  it('info writes to stdout with a trailing newline', () => {
    const writes: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') writes.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      log.info('hello');
    } finally {
      process.stdout.write = origWrite;
    }

    expect(writes.join('')).toMatch(/hello\n/);
  });

  it('warn writes to stderr with a trailing newline', () => {
    const writes: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') writes.push(chunk);
      return true;
    }) as typeof process.stderr.write;

    try {
      log.warn('caution');
    } finally {
      process.stderr.write = origWrite;
    }

    expect(writes.join('')).toMatch(/caution\n/);
  });
});
