import type { Readable, Writable } from 'node:stream';
import { select, input, password, confirm } from '@inquirer/prompts';
import {
  getSettingsPath,
  getBackupPath,
  profilePath,
} from '../config.js';
import { switchTo } from '../switcher.js';
import { PROVIDERS, getProvider, type ProviderId } from '../providers.js';
import { validateAnthropic } from '../validator.js';
import { UserCancelledError } from '../errors.js';

function isCancel(value: unknown): boolean {
  return typeof value === 'symbol';
}

export interface CreateIO {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  selectFn?: typeof select;
  inputFn?: typeof input;
  passwordFn?: typeof password;
  confirmFn?: typeof confirm;
  validateFn?: typeof validateAnthropic;
}

export async function run(io: CreateIO): Promise<void> {
  if (!io.isTTY) {
    throw new UserCancelledError(
      'Interactive mode requires a TTY. Use: llm-switch <alias>',
    );
  }
  // 实现将在后续步骤补全
  void io;
  void select;
  void input;
  void password;
  void confirm;
  void PROVIDERS;
  void getProvider;
  void switchTo;
  void getSettingsPath;
  void getBackupPath;
  void profilePath;
  void validateAnthropic;
}