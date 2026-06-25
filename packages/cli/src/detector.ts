import { execFileSync } from 'node:child_process';
import { TARGETS, type TargetConfig, type TargetId } from './config.js';

/**
 * Returns true if the target's binary is resolvable on PATH. Uses
 * `command -v` via the POSIX shell (unix) or `where` (Windows). Any failure
 * is treated as "not installed" rather than an error. The shell is invoked
 * directly (not via the `shell` option) to avoid Node's DEP0190 deprecation.
 * `target.binaryName` comes from the trusted TARGETS registry, so building
 * the shell argument by interpolation is safe.
 */
export function isToolBinaryInstalled(target: TargetConfig): boolean {
  try {
    if (process.platform === 'win32') {
      execFileSync('where', [target.binaryName], { stdio: 'ignore' });
    } else {
      execFileSync('sh', ['-c', `command -v ${target.binaryName}`], { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects every target in the registry. Returns a map keyed by TargetId.
 */
export function detectInstalledTargets(): Record<TargetId, boolean> {
  const result = {} as Record<TargetId, boolean>;
  for (const target of TARGETS) {
    result[target.id] = isToolBinaryInstalled(target);
  }
  return result;
}
