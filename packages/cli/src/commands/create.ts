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

function nonEmpty(v: string): true | string {
  return v.trim() ? true : 'Required';
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

  // 3. Confirm defaults
  let baseUrl = provider.baseUrl;
  let model = provider.defaultModel;
  const useDefaults = await cFn({
    message: 'Use default BASE_URL and model?',
    default: true,
  });
  ensure(!isCancel(useDefaults), 'Cancelled.');
  if (!useDefaults) {
    const urlInput = await iFn({
      message: 'BASE URL:',
      default: provider.baseUrl,
      validate: nonEmpty,
    });
    ensure(!isCancel(urlInput), 'Cancelled.');
    baseUrl = (urlInput as string).trim();

    const modelInput = await iFn({
      message: 'Model:',
      default: provider.defaultModel,
      validate: nonEmpty,
    });
    ensure(!isCancel(modelInput), 'Cancelled.');
    model = (modelInput as string).trim();
  }

  // 4. API key
  const apiKeyInput = await pFn({
    message: 'API key:',
    mask: '*',
  });
  ensure(!isCancel(apiKeyInput), 'Cancelled.');
  const apiKey = apiKeyInput as string;

  // 5. Validate
  await vFn(baseUrl, model, apiKey);

  // 后续步骤补全
  void switchTo;
  void getSettingsPath;
  void getBackupPath;
  void profilePath;
  void alias;
}
