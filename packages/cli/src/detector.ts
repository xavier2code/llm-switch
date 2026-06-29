import { execFile, execFileSync } from 'node:child_process';
import { TARGETS, type TargetConfig, type TargetId } from './config.js';

/**
 * Returns true if the target's binary is resolvable on PATH. Uses
 * `command -v` via the POSIX shell (unix) or `where` (Windows). Any failure
 * is treated as "not installed" rather than an error.
 *
 * The shell command passes the binary name as a positional argument
 * (`"$1"`) rather than interpolating it, so even a future untrusted
 * `binaryName` cannot inject shell metacharacters.
 */
async function isToolBinaryInstalledAsync(target: TargetConfig): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      await execFile('where', [target.binaryName]);
    } else {
      await execFile('sh', ['-c', 'command -v "$1"', 'sh', target.binaryName]);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects every target in the registry. Returns a map keyed by TargetId.
 * All checks run concurrently.
 */
export async function detectInstalledTargets(): Promise<Record<TargetId, boolean>> {
  const results = await Promise.all(
    TARGETS.map(async (target) => [target.id, await isToolBinaryInstalledAsync(target)] as const),
  );
  return Object.fromEntries(results) as Record<TargetId, boolean>;
}

/**
 * Synchronous wrapper for call sites that still need a boolean immediately.
 * Prefer {@link detectInstalledTargets} when possible.
 */
export function isToolBinaryInstalled(target: TargetConfig): boolean {
  try {
    if (process.platform === 'win32') {
      execFileSync('where', [target.binaryName], { stdio: 'ignore' });
    } else {
      execFileSync('sh', ['-c', 'command -v "$1"', 'sh', target.binaryName], {
        stdio: 'ignore',
      });
    }
    return true;
  } catch {
    return false;
  }
}
