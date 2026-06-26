import { select, input, checkbox } from '@inquirer/prompts';
import type { Profile } from './adapters/types.js';
import { ALIAS_RE } from './config.js';
import type { TargetConfig, TargetId } from './config.js';
import { INTERACTIVE_TTY_REQUIRED } from './messages.js';
import { UserCancelledError } from './errors.js';

const NEW_SENTINEL: unique symbol = Symbol.for('llm-switch:create-new');

export function isCancel(value: unknown): boolean {
  return typeof value === 'symbol' && value !== NEW_SENTINEL;
}

/**
 * Detects cancellation errors thrown by `@inquirer/prompts` v7+ on Ctrl-C,
 * Esc, or programmatic abort. v5 returned a Symbol on cancel; v7 throws an
 * Error subclass identified by name. We duck-type on the name to avoid
 * importing the class directly from the transitive `@inquirer/core` dep.
 */
export function isInquirerCancelError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = err.name;
  return name === 'ExitPromptError' || name === 'CancelPromptError' || name === 'AbortPromptError';
}

function ensureTTY(): void {
  if (!process.stdout.isTTY) {
    throw new UserCancelledError(INTERACTIVE_TTY_REQUIRED);
  }
}

export async function pickProfile(profiles: Profile[]): Promise<Profile | null> {
  ensureTTY();
  if (profiles.length === 0) return null;

  const active = profiles.find((p) => p.active);
  const result = (await select({
    message: 'Select profile to switch to:',
    choices: profiles.map((p) => ({
      name: p.alias,
      value: p,
    })),
    default: active,
  })) as Profile | undefined;

  if (isCancel(result)) return null;
  return result ?? null;
}

export async function promptAlias(existing: string[]): Promise<string | null> {
  ensureTTY();

  if (existing.length === 0) {
    return promptNewAlias(existing);
  }

  const result = (await select({
    message: 'Choose a profile name:',
    choices: [
      ...existing.map((name) => ({ name, value: name })),
      { name: '+ Create new', value: NEW_SENTINEL },
    ] as Array<{ name: string; value: string | typeof NEW_SENTINEL }>,
  })) as string | typeof NEW_SENTINEL | undefined;

  if (isCancel(result)) return null;
  if (result === NEW_SENTINEL) {
    return promptNewAlias(existing);
  }
  return result as string;
}

export async function promptNewAlias(existing: string[]): Promise<string | null> {
  ensureTTY();

  const result = (await input({
    message: 'New alias name:',
    validate: (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return 'Required';
      if (!ALIAS_RE.test(trimmed)) {
        return `Must match ${ALIAS_RE} (lowercase, digits, . _ -, 1-64 chars)`;
      }
      if (existing.includes(trimmed)) {
        return `Alias '${trimmed}' already exists`;
      }
      return true;
    },
  })) as string | undefined;

  if (isCancel(result)) return null;
  return (result ?? '').trim();
}

export async function pickTargets(
  targets: TargetConfig[],
  defaultIds: TargetId[],
): Promise<TargetConfig[] | null> {
  ensureTTY();
  if (targets.length === 0) return [];

  const result = (await checkbox({
    message: 'Select targets:',
    choices: targets.map((t) => ({
      name: t.displayName,
      value: t.id,
      checked: defaultIds.includes(t.id),
    })),
  })) as TargetId[] | undefined;

  if (isCancel(result)) return null;
  const ids = result ?? [];
  return targets.filter((t) => ids.includes(t.id));
}
