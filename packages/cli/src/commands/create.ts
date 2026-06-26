import type { Writable } from 'node:stream';
import { select, input, password, confirm } from '@inquirer/prompts';
import type { TargetConfig, TargetFamily } from '../config.js';
import { validateAlias } from '../config.js';
import { ProfileStore, defaultProfileStore } from '../store/profile-store.js';
import { PROVIDERS, getProvider, isProviderId, type Provider } from '../providers.js';
import { validateAnthropic, validateOpenAi } from '../validator.js';
import { isCancel } from '../ui.js';
import { UserCancelledError } from '../errors.js';
import { INTERACTIVE_TTY_REQUIRED, restartHint } from '../messages.js';
import { exists } from '../fs-utils.js';
import type { ProfileContent } from '../adapters/types.js';

export interface CreateIO {
  targets: TargetConfig[];
  stdout: Writable;
  stderr: Writable;
  isTTY: boolean;
  store?: ProfileStore;
  selectFn?: typeof select;
  inputFn?: typeof input;
  passwordFn?: typeof password;
  confirmFn?: typeof confirm;
  validateFn?: typeof validateAnthropic;
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new UserCancelledError(message);
}

function nonEmpty(v: string): true | string {
  return v.trim() ? true : 'Required';
}

type SubmenuChoice = 'retry' | 'newkey' | 'edit' | 'cancel';

export async function run(io: CreateIO): Promise<void> {
  if (!io.isTTY) {
    throw new UserCancelledError(INTERACTIVE_TTY_REQUIRED);
  }

  const store = io.store ?? defaultProfileStore();
  const sFn = io.selectFn ?? select;
  const iFn = io.inputFn ?? input;
  const pFn = io.passwordFn ?? password;
  const cFn = io.confirmFn ?? confirm;

  const families = Array.from(new Set(io.targets.map((t) => t.family))) as TargetFamily[];
  const providerByFamily: Record<TargetFamily, Provider> = {} as Record<TargetFamily, Provider>;

  // 1. Per-family provider selection. A family with a single provider skips
  //    the prompt entirely (e.g. the openai family only has 'openai').
  for (const family of families) {
    const familyProviders = PROVIDERS.filter((p) => p.family === family);
    let provider: Provider;
    if (familyProviders.length === 1) {
      provider = familyProviders[0]!;
    } else {
      const choice = await sFn({
        message: `Select provider for ${family} family:`,
        choices: familyProviders.map((p) => ({ name: p.displayName, value: p.id })),
      });
      ensure(!isCancel(choice), 'Cancelled.');
      if (!isProviderId(choice)) {
        throw new UserCancelledError(`Unexpected provider value: ${String(choice)}`);
      }
      provider = getProvider(choice);
    }
    providerByFamily[family] = provider;
  }

  // 2. Alias
  const aliasInput = await iFn({
    message: 'Alias for this profile:',
    default: providerByFamily[families[0]!]!.id,
    validate: (v: string) => {
      const trimmed = v.trim();
      if (!trimmed) return 'Required';
      const err = validateAlias(trimmed);
      return err ?? true;
    },
  });
  ensure(!isCancel(aliasInput), 'Cancelled.');
  const alias = (aliasInput as string).trim();

  // 3. Per-family base URL + model
  const familyConfig = {} as Record<TargetFamily, { baseUrl: string; model: string }>;
  for (const family of families) {
    const provider = providerByFamily[family]!;
    let baseUrl = provider.baseUrl;
    let model = provider.defaultModel;

    const useDefaults = await cFn({
      message: `${family}: use default BASE_URL (${baseUrl}) and model (${model})?`,
      default: true,
    });
    ensure(!isCancel(useDefaults), 'Cancelled.');

    if (!useDefaults) {
      const urlInput = await iFn({
        message: `${family} BASE URL:`,
        default: baseUrl,
        validate: nonEmpty,
      });
      ensure(!isCancel(urlInput), 'Cancelled.');
      baseUrl = (urlInput as string).trim();

      const modelInput = await iFn({
        message: `${family} Model:`,
        default: model,
        validate: nonEmpty,
      });
      ensure(!isCancel(modelInput), 'Cancelled.');
      model = (modelInput as string).trim();
    }

    familyConfig[family] = { baseUrl, model };
  }

  // 4-6. API key + per-family validation loop
  let apiKey = '';
  let needsNewKey = true;
  while (true) {
    if (needsNewKey) {
      const keyInput = await pFn({ message: 'API key:', mask: '*', validate: nonEmpty });
      ensure(!isCancel(keyInput), 'Cancelled.');
      apiKey = (keyInput as string).trim();
    }

    try {
      for (const family of families) {
        const { baseUrl, model } = familyConfig[family]!;
        if (family === 'anthropic') {
          await (io.validateFn ?? validateAnthropic)(baseUrl, model, apiKey);
        } else {
          await validateOpenAi(baseUrl, model, apiKey);
        }
      }
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
      // 'edit': re-prompt each family's BASE_URL and model
      for (const family of families) {
        const urlInput = await iFn({
          message: `${family} BASE URL:`,
          default: familyConfig[family]!.baseUrl,
          validate: nonEmpty,
        });
        ensure(!isCancel(urlInput), 'Cancelled.');
        familyConfig[family]!.baseUrl = (urlInput as string).trim();

        const modelInput = await iFn({
          message: `${family} Model:`,
          default: familyConfig[family]!.model,
          validate: nonEmpty,
        });
        ensure(!isCancel(modelInput), 'Cancelled.');
        familyConfig[family]!.model = (modelInput as string).trim();
      }
      needsNewKey = false;
      continue;
    }
  }

  // 7-9. Per-target overwrite prompt + write + activate
  for (const target of io.targets) {
    const provider = providerByFamily[target.family]!;
    const { baseUrl, model } = familyConfig[target.family]!;
    const content: ProfileContent = {
      providerId: provider.id,
      baseUrl,
      model,
      apiKey,
      extra: {},
    };

    const profileFile = store.adapter(target).profilePath(alias);
    if (await exists(profileFile)) {
      const overwrite = await cFn({
        message: `Profile '${alias}' exists for ${target.displayName}. Overwrite?`,
        default: false,
      });
      ensure(!isCancel(overwrite), 'Cancelled.');
      if (!overwrite) throw new UserCancelledError('Cancelled.');
    }

    await store.writeProfile(target, alias, content);
    await store.adapter(target).writeActive(content);
  }

  // 10. Output
  io.stdout.write(`Created and activated '${alias}':\n`);
  for (const target of io.targets) {
    io.stdout.write(`  ${target.displayName}  ${restartHint(target)}\n`);
  }
}
