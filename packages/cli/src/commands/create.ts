import type { Readable, Writable } from 'node:stream';
import { select, input, password, confirm } from '@inquirer/prompts';
import {
  getSettingsPath,
  getBackupPath,
  profilePath,
  validateAlias,
} from '../config.js';
import { switchTo } from '../switcher.js';
import { PROVIDERS, getProvider, type ProviderId } from '../providers.js';
import { validateAnthropic } from '../validator.js';
import { UserCancelledError } from '../errors.js';

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

function isCancel(value: unknown): boolean {
  return typeof value === 'symbol';
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new UserCancelledError(message);
}

export async function run(io: CreateIO): Promise<void> {
  if (!io.isTTY) {
    throw new UserCancelledError(
      'Interactive mode requires a TTY. Use: llm-switch <alias>',
    );
  }

  const sFn = io.selectFn ?? select;
  const iFn = io.inputFn ?? input;
  const pFn = io.passwordFn ?? password;
  const cFn = io.confirmFn ?? confirm;
  const vFn = io.validateFn ?? validateAnthropic;

  // 1. Provider
  const providerChoice = await sFn({
    message: 'Select provider:',
    choices: PROVIDERS.map((p) => ({ name: p.displayName, value: p.id })),
  });
  ensure(!isCancel(providerChoice), 'Cancelled.');
  const provider = getProvider(providerChoice as ProviderId);

  // 2. Alias
  const aliasInput = await iFn({
    message: 'Alias for this profile:',
    default: provider.id,
    validate: (v: string) => {
      const trimmed = v.trim();
      if (!trimmed) return 'Required';
      const err = validateAlias(trimmed);
      return err ?? true;
    },
  });
  ensure(!isCancel(aliasInput), 'Cancelled.');
  const alias = (aliasInput as string).trim();

  // 后续步骤补全
  void cFn;
  void pFn;
  void vFn;
  void switchTo;
  void getSettingsPath;
  void getBackupPath;
  void profilePath;
  void alias;
  void provider;
}