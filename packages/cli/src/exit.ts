import {
  AppError,
  ConfigDirNotFoundError,
  InvalidAliasError,
  NoBackupError,
  NoCurrentSettingsError,
  NoProfilesError,
  ProfileNotFoundError,
  UserCancelledError,
} from '@llm-switch/core';

export function toExitCode(err: unknown): number {
  if (err == null) return 0;
  if (err instanceof UserCancelledError) return 0;

  if (err instanceof ConfigDirNotFoundError) return 1;
  if (err instanceof NoProfilesError) return 1;
  if (err instanceof NoBackupError) return 1;
  if (err instanceof NoCurrentSettingsError) return 1;

  if (err instanceof ProfileNotFoundError) return 2;
  if (err instanceof InvalidAliasError) return 2;

  if (err instanceof AppError) return 3;
  return 1;
}
