import { describe, it, expect } from 'vitest';
import {
  AppError,
  ConfigDirNotFoundError,
  NoProfilesError,
  ProfileNotFoundError,
  NoBackupError,
  NoCurrentSettingsError,
  UserCancelledError,
  ValidationError,
} from '../src/errors.js';

describe('AppError', () => {
  it('is an Error subclass with a code', () => {
    const err = new AppError('boom', 'TEST_CODE');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe('boom');
    expect(err.code).toBe('TEST_CODE');
  });
});

describe('concrete errors', () => {
  it('all extend AppError', () => {
    const errors = [
      new ConfigDirNotFoundError('x'),
      new NoProfilesError('x'),
      new ProfileNotFoundError('x'),
      new NoBackupError('x'),
      new NoCurrentSettingsError('x'),
      new UserCancelledError('x'),
    ];
    for (const e of errors) {
      expect(e).toBeInstanceOf(AppError);
      expect(e).toBeInstanceOf(Error);
      expect(e.code).toMatch(/^[A-Z_]+$/);
      expect(e.message).toBe('x');
    }
  });
});

describe('ValidationError', () => {
  it('extends AppError with code VALIDATION_FAILED', () => {
    const cause = new Error('underlying');
    const err = new ValidationError('Invalid API key (401).', cause);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.message).toBe('Invalid API key (401).');
    expect(err.cause).toBe(cause);
  });

  it('cause is optional', () => {
    const err = new ValidationError('boom');
    expect(err.cause).toBeUndefined();
  });
});
