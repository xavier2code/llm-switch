import type { Readable, Writable } from 'node:stream';
import fs from 'node:fs/promises';
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

type SubmenuChoice = 'retry' | 'newkey' | 'edit' | 'cancel';

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
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

  // 4-6. API key + validate loop
  let apiKey = '';
  let needsNewKey = true;
  while (true) {
    if (needsNewKey) {
      const keyInput = await pFn({
        message: 'API key:',
        mask: '*',
        validate: nonEmpty,
      });
      ensure(!isCancel(keyInput), 'Cancelled.');
      apiKey = (keyInput as string).trim();
      needsNewKey = false;
    }

    try {
      await vFn(baseUrl, model, apiKey);
      break;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      io.stderr.write(`Validation failed: ${message}\n`);

      const sub = await sFn({
        message: 'What now?',
        choices: [
          { name: 'Retry with same key', value: 'retry' as SubmenuChoice },
          { name: 'Enter a different key', value: 'newkey' as SubmenuChoice },
          { name: 'Edit BASE_URL or model', value: 'edit' as SubmenuChoice },
          { name: 'Cancel', value: 'cancel' as SubmenuChoice },
        ],
      });
      ensure(!isCancel(sub), 'Cancelled.');
      const choice = sub as SubmenuChoice;

      if (choice === 'cancel') throw new UserCancelledError('Cancelled.');
      if (choice === 'retry') {
        needsNewKey = false;
        continue;
      }
      if (choice === 'newkey') {
        needsNewKey = true;
        continue;
      }
      // 'edit'
      const urlInput = await iFn({
        message: 'BASE URL:',
        default: baseUrl,
        validate: nonEmpty,
      });
      ensure(!isCancel(urlInput), 'Cancelled.');
      baseUrl = (urlInput as string).trim();

      const modelInput = await iFn({
        message: 'Model:',
        default: model,
        validate: nonEmpty,
      });
      ensure(!isCancel(modelInput), 'Cancelled.');
      model = (modelInput as string).trim();

      needsNewKey = false;
      continue;
    }
  }

  // 7. Overwrite confirm
  const profileFile = profilePath(alias);
  if (await fileExists(profileFile)) {
    const overwrite = await cFn({
      message: `Profile '${alias}' exists. Overwrite?`,
      default: false,
    });
    ensure(!isCancel(overwrite), 'Cancelled.');
    if (!overwrite) throw new UserCancelledError('Cancelled.');
  }

  // 8. Write profile
  const content = JSON.stringify(
    {
      env: {
        ANTHROPIC_BASE_URL: baseUrl,
        ANTHROPIC_MODEL: model,
        ANTHROPIC_AUTH_TOKEN: apiKey,
      },
    },
    null,
    2,
  );
  await fs.writeFile(profileFile, content);
  await fs.chmod(profileFile, 0o600);

  // 9. Activate (atomic switch + backup)
  const settingsPath = getSettingsPath();
  const backupPath = getBackupPath();
  await switchTo(profileFile, settingsPath, backupPath);

  // 10. Output
  io.stdout.write(`Created and activated '${alias}'. Restart Claude Code to apply.\n`);
}