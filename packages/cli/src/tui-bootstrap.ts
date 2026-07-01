import {
  ensureMigrated,
  TARGETS,
  getTarget,
  type TargetConfig,
  type TargetId,
} from '@llm-switch/core/config.js';
import { ensureMigratedToCentralStore } from '@llm-switch/core/migrate.js';
import { defaultProfileStore, type ProfileStore } from '@llm-switch/core/store/index.js';

function parseTargetFlagFromArgs(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--target' || arg === '-t') {
      return args[i + 1]?.trim();
    }
    if (arg?.startsWith('--target=') || arg?.startsWith('-t=')) {
      return arg.slice(arg.indexOf('=') + 1).trim();
    }
  }
  return undefined;
}

export async function prepareTui(): Promise<{
  targets: TargetConfig[];
  store: ProfileStore;
}> {
  const store = defaultProfileStore();
  const flag = parseTargetFlagFromArgs(process.argv.slice(2));
  const targets =
    flag && TARGETS.some((t) => t.id === flag) ? [getTarget(flag as TargetId)] : [...TARGETS];
  for (const target of targets) {
    await ensureMigrated(target);
  }
  await ensureMigratedToCentralStore(store.baseDir, targets);
  return { targets, store };
}
