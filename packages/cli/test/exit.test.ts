import { describe, it, expect } from 'vitest';
import { toExitCode } from '../src/exit.js';
import {
  ConfigDirNotFoundError,
  NoProfilesError,
  ProfileNotFoundError,
  NoBackupError,
  NoCurrentSettingsError,
  UserCancelledError,
  InvalidAliasError,
  AppError,
} from '../src/errors.js';

describe('toExitCode', () => {
  it('returns 0 for null/undefined', () => {
    expect(toExitCode(null)).toBe(0);
    expect(toExitCode(undefined)).toBe(0);
  });

  it('returns 0 for UserCancelledError', () => {
    expect(toExitCode(new UserCancelledError('x'))).toBe(0);
  });

  it('returns 1 for config / state errors', () => {
    expect(toExitCode(new ConfigDirNotFoundError('x'))).toBe(1);
    expect(toExitCode(new NoProfilesError('x'))).toBe(1);
    expect(toExitCode(new NoBackupError('x'))).toBe(1);
    expect(toExitCode(new NoCurrentSettingsError('x'))).toBe(1);
  });

  it('returns 2 for argument errors', () => {
    expect(toExitCode(new InvalidAliasError('x'))).toBe(2);
    expect(toExitCode(new ProfileNotFoundError('x'))).toBe(2);
  });

  it('returns 3 for generic IO/other AppErrors', () => {
    class GenericAppError extends AppError {
      constructor() {
        super('x', 'GENERIC');
      }
    }
    expect(toExitCode(new GenericAppError())).toBe(3);
  });

  it('returns 1 for plain Error', () => {
    expect(toExitCode(new Error('boom'))).toBe(1);
  });
});
