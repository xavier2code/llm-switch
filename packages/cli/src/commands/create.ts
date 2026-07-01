import type { Writable } from 'node:stream';
import { select, input, password, confirm } from '@inquirer/prompts';
import type { TargetConfig, TargetFamily } from '@llm-switch/core/config.js';
import { validateAlias } from '@llm-switch/core/config.js';
import { ProfileStore, defaultProfileStore } from '@llm-switch/core/store/profile-store.js';
import { PROVIDERS, getProvider, isProviderId, type Provider } from '@llm-switch/core/providers.js';
import { validateAnthropic, validateOpenAi } from '@llm-switch/core/validator.js';
import { isCancel } from '../ui.js';
import { UserCancelledError } from '../errors.js';
import { INTERACTIVE_TTY_REQUIRED, restartHint } from '../messages.js';
import { exists } from '../fs-utils.js';
import type { ProfileContent } from '@llm-switch/core/adapters/types.js';

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
  providerId?: string;
  alias?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  skipValidation?: boolean;
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new UserCancelledError(message);
}

function nonEmpty(v: string): true | string {
  return v.trim() ? true : 'Required';
}

type SubmenuChoice = 'retry' | 'newkey' | 'edit' | 'cancel';

export async function run(io: CreateIO): Promise<void> {
  const hasRequiredFlags = Boolean(io.providerId && io.alias && (io.apiKey || io.apiKeyEnv));
  if (!io.isTTY && !hasRequiredFlags) {
    throw new UserCancelledError(INTERACTIVE_TTY_REQUIRED);
  }

  const store = io.store ?? defaultProfileStore();
  const sFn = io.selectFn ?? select;
  const iFn = io.inputFn ?? input;
  const pFn = io.passwordFn ?? password;
  const cFn = io.confirmFn ?? confirm;

  const families = Array.from(new Set(io.targets.map((t) => t.family))) as TargetFamily[];
  const providerByFamily = {} as Record<TargetFamily, Provider>;

  // 1. Per-family provider selection. A family with a single provider skips
  //    the prompt entirely (e.g. the openai family only has 'openai').
  for (const family of families) {
    const familyProviders = PROVIDERS.filter((p) => p.family === family);
    let provider: Provider;
    if (
      io.providerId &&
      isProviderId(io.providerId) &&
      familyProviders.some((p) => p.id === io.providerId)
    ) {
      provider = getProvider(io.providerId);
    } else if (familyProviders.length === 1) {
      provider = familyProviders[0];
    } else {
      if (!io.isTTY) {
        throw new UserCancelledError(`Provider required for ${family} family.`);
      }
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
  const firstFamily = families[0];
  if (!firstFamily) {
    throw new UserCancelledError('No target families to configure.');
  }
  let alias: string;
  if (io.alias) {
    const err = validateAlias(io.alias);
    if (err) throw new UserCancelledError(err);
    alias = io.alias;
  } else if (!io.isTTY) {
    throw new UserCancelledError('Alias required.');
  } else {
    const aliasInput = await iFn({
      message: 'Alias for this profile:',
      default: providerByFamily[firstFamily].id,
      validate: (v: string) => {
        const trimmed = v.trim();
        if (!trimmed) return 'Required';
        const validationErr = validateAlias(trimmed);
        return validationErr ?? true;
      },
    });
    ensure(!isCancel(aliasInput), 'Cancelled.');
    alias = (aliasInput as string).trim();
  }

  // 3. Per-family base URL + model
  const familyConfig = {} as Record<TargetFamily, { baseUrl: string; model: string }>;
  for (const family of families) {
    const provider = providerByFamily[family];
    const requestedBaseUrl = io.baseUrl;
    const requestedModel = io.model;
    let baseUrl = requestedBaseUrl ?? provider.baseUrl;
    let model = requestedModel ?? provider.defaultModel;

    const needsPrompt = !io.baseUrl || !io.model;
    if (needsPrompt && io.isTTY) {
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
    }

    familyConfig[family] = { baseUrl, model };
  }

  // 4-6. API key + per-family validation loop
  let apiKey = '';
  let needsNewKey = true;
  const resolveApiKey = (): string => {
    if (io.apiKey) return io.apiKey;
    if (io.apiKeyEnv) {
      const value = process.env[io.apiKeyEnv];
      if (!value)
        throw new UserCancelledError(`Environment variable '${io.apiKeyEnv}' is empty or unset.`);
      return value;
    }
    return '';
  };

  while (true) {
    if (needsNewKey) {
      const resolved = resolveApiKey();
      if (resolved) {
        apiKey = resolved;
      } else if (!io.isTTY) {
        throw new UserCancelledError('API key required.');
      } else {
        const keyInput = await pFn({ message: 'API key:', mask: '*', validate: nonEmpty });
        ensure(!isCancel(keyInput), 'Cancelled.');
        apiKey = (keyInput as string).trim();
      }
    }

    try {
      for (const family of families) {
        if (io.skipValidation) continue;
        const config = familyConfig[family];
        if (!config) continue;
        const { baseUrl, model } = config;
        if (family === 'anthropic') {
          await (io.validateFn ?? validateAnthropic)(baseUrl, model, apiKey);
        } else {
          await validateOpenAi(baseUrl, model, apiKey);
        }
      }
      break;
    } catch (err: unknown) {
      if (!io.isTTY) {
        throw err;
      }
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
        const config = familyConfig[family];
        if (!config) continue;
        const urlInput = await iFn({
          message: `${family} BASE URL:`,
          default: config.baseUrl,
          validate: nonEmpty,
        });
        ensure(!isCancel(urlInput), 'Cancelled.');
        config.baseUrl = (urlInput as string).trim();

        const modelInput = await iFn({
          message: `${family} Model:`,
          default: config.model,
          validate: nonEmpty,
        });
        ensure(!isCancel(modelInput), 'Cancelled.');
        config.model = (modelInput as string).trim();
      }
      needsNewKey = false;
      continue;
    }
  }

  // 7-9. Per-target overwrite prompt + write + activate
  for (const target of io.targets) {
    const provider = providerByFamily[target.family];
    const config = familyConfig[target.family];
    if (!provider || !config) {
      throw new UserCancelledError(`No provider configured for ${target.family}.`);
    }
    const { baseUrl, model } = config;
    const content: ProfileContent = {
      providerId: provider.id,
      baseUrl,
      model,
      apiKey,
      extra: {},
    };

    const profileFile = store.adapter(target).profilePath(alias);
    if (await exists(profileFile)) {
      if (!io.isTTY) {
        // In non-interactive mode, overwrite silently when flags are provided.
      } else {
        const overwrite = await cFn({
          message: `Profile '${alias}' exists for ${target.displayName}. Overwrite?`,
          default: false,
        });
        ensure(!isCancel(overwrite), 'Cancelled.');
        if (!overwrite) throw new UserCancelledError('Cancelled.');
      }
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
