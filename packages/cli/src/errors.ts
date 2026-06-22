export class AppError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConfigDirNotFoundError extends AppError {
  constructor(message: string) {
    super(message, 'CONFIG_DIR_NOT_FOUND');
  }
}

export class NoProfilesError extends AppError {
  constructor(message: string) {
    super(message, 'NO_PROFILES');
  }
}

export class ProfileNotFoundError extends AppError {
  constructor(message: string) {
    super(message, 'PROFILE_NOT_FOUND');
  }
}

export class NoBackupError extends AppError {
  constructor(message: string) {
    super(message, 'NO_BACKUP');
  }
}

export class NoCurrentSettingsError extends AppError {
  constructor(message: string) {
    super(message, 'NO_CURRENT_SETTINGS');
  }
}

export class UserCancelledError extends AppError {
  constructor(message: string) {
    super(message, 'USER_CANCELLED');
  }
}

export class InvalidAliasError extends AppError {
  constructor(message: string) {
    super(message, 'INVALID_ALIAS');
  }
}
