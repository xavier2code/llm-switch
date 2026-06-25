import { execFileSync } from 'node:child_process';
import { TARGETS, type TargetConfig, type TargetId } from './config.js';

/**
 * Returns true if the target's binary is resolvable on PATH. Uses
 * `command -v` (unix) or `where` (Windows). Any failure is treated as
 * "not installed" rather than an error.
 */
export function isToolBinaryInstalled(target: TargetConfig): boolean {
  const isWindows = process.platform === 'win32';
  const cmd = isWindows ? 'where' : 'command';
  const args = isWindows ? [target.binaryName] : ['-v', target.binaryName];
  try {
    execFileSync(cmd, args, { shell: !isWindows, stdio: 'ignore' });
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
