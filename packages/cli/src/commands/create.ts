import type { Writable } from 'node:stream';
import { select, input, password, confirm } from '@inquirer/prompts';
import type { TargetConfig, TargetFamily } from '@xavier2code/llm-switch-core/config.js';
import { validateAlias } from '@xavier2code/llm-switch-core/config.js';
import {
  ProfileStore,
  defaultProfileStore,
} from '@xavier2code/llm-switch-core/store/profile-store.js';
import {
  PROVIDERS,
  getProvider,
  isProviderId,
  type Provider,
} from '@xavier2code/llm-switch-core/providers.js';
import { validateAnthropic, validateOpenAi } from '@xavier2code/llm-switch-core/validator.js';
import { isCancel } from '../ui.js';
import { UserCancelledError } from '@xavier2code/llm-switch-core';
import { INTERACTIVE_TTY_REQUIRED, printCreatedAndActivated } from '../messages.js';
import { exists } from '@xavier2code/llm-switch-core/fs-utils.js';
import type { ProfileContent } from '@xavier2code/llm-switch-core/adapters/types.js';

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

export type PromptKit = {
  selectFn: typeof select;
  inputFn: typeof input;
  passwordFn: typeof password;
  confirmFn: typeof confirm;
};

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new UserCancelledError(message);
}

function nonEmpty(v: string): true | string {
  return v.trim() ? true : 'Required';
}

type SubmenuChoice = 'retry' | 'newkey' | 'edit' | 'cancel';

function makePromptKit(io: CreateIO): PromptKit {
  return {
    selectFn: io.selectFn ?? select,
    inputFn: io.inputFn ?? input,
    passwordFn: io.passwordFn ?? password,
    confirmFn: io.confirmFn ?? confirm,
  };
}

function getFamilies(targets: TargetConfig[]): TargetFamily[] {
  return Array.from(new Set(targets.map((t) => t.family))) as TargetFamily[];
}

async function selectProviders(
  io: CreateIO,
  kit: PromptKit,
  families: TargetFamily[],
): Promise<Record<TargetFamily, Provider>> {
  const providerByFamily = {} as Record<TargetFamily, Provider>;
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
      const choice = await kit.selectFn({
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
  return providerByFamily;
}

async function promptAlias(
  io: CreateIO,
  kit: PromptKit,
  providerByFamily: Record<TargetFamily, Provider>,
  families: TargetFamily[],
): Promise<string> {
  if (io.alias) {
    const err = validateAlias(io.alias);
    if (err) throw new UserCancelledError(err);
    return io.alias;
  }
  if (!io.isTTY) {
    throw new UserCancelledError('Alias required.');
  }
  const firstFamily = families[0];
  if (!firstFamily) {
    throw new UserCancelledError('No target families to configure.');
  }
  const aliasInput = await kit.inputFn({
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
  return (aliasInput as string).trim();
}

async function promptFamilyConfig(
  io: CreateIO,
  kit: PromptKit,
  providerByFamily: Record<TargetFamily, Provider>,
  families: TargetFamily[],
): Promise<Record<TargetFamily, { baseUrl: string; model: string }>> {
  const familyConfig = {} as Record<TargetFamily, { baseUrl: string; model: string }>;
  for (const family of families) {
    const provider = providerByFamily[family];
    let baseUrl = io.baseUrl ?? provider.baseUrl;
    let model = io.model ?? provider.defaultModel;

    const needsPrompt = !io.baseUrl || !io.model;
    if (needsPrompt && io.isTTY) {
      const useDefaults = await kit.confirmFn({
        message: `${family}: use default BASE_URL (${baseUrl}) and model (${model})?`,
        default: true,
      });
      ensure(!isCancel(useDefaults), 'Cancelled.');

      if (!useDefaults) {
        const urlInput = await kit.inputFn({
          message: `${family} BASE URL:`,
          default: baseUrl,
          validate: nonEmpty,
        });
        ensure(!isCancel(urlInput), 'Cancelled.');
        baseUrl = (urlInput as string).trim();

        const modelInput = await kit.inputFn({
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
  return familyConfig;
}

function resolveApiKey(io: CreateIO): string {
  if (io.apiKey) return io.apiKey;
  if (io.apiKeyEnv) {
    const value = process.env[io.apiKeyEnv];
    if (!value)
      throw new UserCancelledError(`Environment variable '${io.apiKeyEnv}' is empty or unset.`);
    return value;
  }
  return '';
}

async function promptApiKey(kit: PromptKit): Promise<string> {
  const keyInput = await kit.passwordFn({ message: 'API key:', mask: '*', validate: nonEmpty });
  ensure(!isCancel(keyInput), 'Cancelled.');
  return (keyInput as string).trim();
}

async function editFamilyConfig(
  kit: PromptKit,
  familyConfig: Record<TargetFamily, { baseUrl: string; model: string }>,
  families: TargetFamily[],
): Promise<void> {
  for (const family of families) {
    const config = familyConfig[family];
    if (!config) continue;
    const urlInput = await kit.inputFn({
      message: `${family} BASE URL:`,
      default: config.baseUrl,
      validate: nonEmpty,
    });
    ensure(!isCancel(urlInput), 'Cancelled.');
    config.baseUrl = (urlInput as string).trim();

    const modelInput = await kit.inputFn({
      message: `${family} Model:`,
      default: config.model,
      validate: nonEmpty,
    });
    ensure(!isCancel(modelInput), 'Cancelled.');
    config.model = (modelInput as string).trim();
  }
}

async function runValidationLoop(
  io: CreateIO,
  kit: PromptKit,
  families: TargetFamily[],
  familyConfig: Record<TargetFamily, { baseUrl: string; model: string }>,
): Promise<string> {
  let apiKey = '';
  let needsNewKey = true;

  while (true) {
    if (needsNewKey) {
      const resolved = resolveApiKey(io);
      if (resolved) {
        apiKey = resolved;
      } else if (!io.isTTY) {
        throw new UserCancelledError('API key required.');
      } else {
        apiKey = await promptApiKey(kit);
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
      return apiKey;
    } catch (err: unknown) {
      if (!io.isTTY) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      io.stderr.write(`Validation failed: ${message}\n`);

      const sub = await kit.selectFn({
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
      await editFamilyConfig(kit, familyConfig, families);
      needsNewKey = false;
    }
  }
}

async function promptOverwrite(
  io: CreateIO,
  kit: PromptKit,
  store: ProfileStore,
  target: TargetConfig,
  alias: string,
): Promise<void> {
  const profileFile = store.adapter(target).profilePath(alias);
  if (!(await exists(profileFile))) return;
  if (!io.isTTY) return; // silent overwrite in non-interactive mode
  const overwrite = await kit.confirmFn({
    message: `Profile '${alias}' exists for ${target.displayName}. Overwrite?`,
    default: false,
  });
  ensure(!isCancel(overwrite), 'Cancelled.');
  if (!overwrite) throw new UserCancelledError('Cancelled.');
}

async function writeAndActivate(
  store: ProfileStore,
  target: TargetConfig,
  alias: string,
  content: ProfileContent,
): Promise<void> {
  await store.writeProfile(target, alias, content);
  await store.adapter(target).writeActive(content);
  await store.writeActiveRecord(target, alias);
}

export async function run(io: CreateIO): Promise<void> {
  const hasRequiredFlags = Boolean(io.providerId && io.alias && (io.apiKey || io.apiKeyEnv));
  if (!io.isTTY && !hasRequiredFlags) {
    throw new UserCancelledError(INTERACTIVE_TTY_REQUIRED);
  }

  const store = io.store ?? defaultProfileStore();
  const kit = makePromptKit(io);
  const families = getFamilies(io.targets);

  const providerByFamily = await selectProviders(io, kit, families);
  const alias = await promptAlias(io, kit, providerByFamily, families);
  const familyConfig = await promptFamilyConfig(io, kit, providerByFamily, families);
  const apiKey = await runValidationLoop(io, kit, families, familyConfig);

  for (const target of io.targets) {
    const provider = providerByFamily[target.family];
    const config = familyConfig[target.family];
    if (!provider || !config) {
      throw new UserCancelledError(`No provider configured for ${target.family}.`);
    }
    const content: ProfileContent = {
      providerId: provider.id,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey,
      extra: {},
    };
    await promptOverwrite(io, kit, store, target, alias);
    await writeAndActivate(store, target, alias, content);
  }

  printCreatedAndActivated(io.stdout, alias, io.targets);
}
