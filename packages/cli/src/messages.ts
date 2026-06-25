import type { TargetConfig } from './config.js';

/**
 * Target-specific restart hint. Centralized so wording stays consistent across
 * commands and can be reworded in one place.
 */
export function restartHint(target: TargetConfig): string {
  return target.restartHint;
}

/**
 * Plain TTY-required statement with no usage suggestion. Used by callers that
 * have no non-interactive equivalent (the `create` wizard) or that don't know
 * which command they serve (the shared `ui.ts` guard).
 */
export const INTERACTIVE_TTY_REQUIRED = 'Interactive mode requires a TTY.';

/**
 * TTY-required hint that also suggests the non-interactive form. Pass the
 * subcommand (e.g. `'switch'`) for `llm-switch switch <alias>`.
 */
export function interactiveTtyRequiredHint(command: string): string {
  return `${INTERACTIVE_TTY_REQUIRED} Use: llm-switch ${command} <alias>`;
}
