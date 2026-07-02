import { AppError } from '@xavier2code/llm-switch-core';
import { log } from './logger.js';
import { toExitCode } from './exit.js';
import { isInquirerCancelError } from './ui.js';

export function runAction<T extends unknown[]>(
  fn: (...args: T) => Promise<void>,
): (...args: T) => Promise<void> {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err: unknown) {
      if (isInquirerCancelError(err)) {
        process.exit(0);
      }
      if (err instanceof AppError) {
        log.error(`Error: ${err.message}`);
      } else if (err instanceof Error) {
        log.error(`Unexpected error: ${err.message}`);
      } else {
        log.error('Unexpected error');
      }
      process.exit(toExitCode(err));
    }
  };
}
