import fs from 'node:fs/promises';
import path from 'node:path';
import { exists } from './fs-utils.js';
import { getConfigDir, homeDir, TARGETS, type TargetConfig } from '@llm-switch/core/config.js';

/**
 * Migrate legacy profiles into the centralized store under ~/.llm-switch/.
 *
 * Sources (checked in order):
 * 1. Old central store at ~/.config/llm-switch/profiles/<target>/
 * 2. Per-target legacy stores at <config-dir>/llm-switch/profiles/
 *
 * If the new central store already exists, only targets that haven't been
 * marked with `.migrated` are processed.
 */
export async function ensureMigratedToCentralStore(
  baseDir: string,
  targets: readonly TargetConfig[] = TARGETS,
): Promise<void> {
  const profileRoot = path.join(baseDir, 'profiles');
  await fs.mkdir(profileRoot, { recursive: true, mode: 0o700 });

  // Old central store location (pre-0.9.0)
  const oldCentralDir = path.join(homeDir(), '.config', 'llm-switch');
  const oldCentralProfileRoot = path.join(oldCentralDir, 'profiles');

  // Track which markers we create so we can clean them up on failure.
  const createdMarkers: string[] = [];

  try {
    for (const target of targets) {
      // Per-target marker (profiles/<id>/.migrated). A target migrated once stays
      // migrated, but a target first seen later still gets its legacy profiles copied.
      const marker = path.join(profileRoot, target.id, '.migrated');
      if (await exists(marker)) continue;

      const newDir = path.join(profileRoot, target.id);
      await fs.mkdir(newDir, { recursive: true, mode: 0o700 });

      // Try old central store first, then per-target legacy store
      const oldPerTargetDir = path.join(getConfigDir(target), 'llm-switch', 'profiles');
      const sources = [path.join(oldCentralProfileRoot, target.id), oldPerTargetDir];

      for (const oldDir of sources) {
        if (!(await exists(oldDir))) continue;

        const entries = await fs.readdir(oldDir);
        for (const entry of entries) {
          if (entry.endsWith('.json') || entry.endsWith('.toml')) {
            const dest = path.join(newDir, entry);
            // Don't overwrite if already exists from a previous source
            if (!(await exists(dest))) {
              await fs.copyFile(path.join(oldDir, entry), dest);
              await fs.chmod(dest, 0o600);
            }
          }
        }
      }

      await fs.writeFile(marker, '', { mode: 0o600 });
      createdMarkers.push(marker);
    }

    // Also migrate state.json from old central store if it exists and
    // the new store doesn't have one yet. This is global, not per-target,
    // so it runs outside the target loop.
    const oldStatePath = path.join(oldCentralDir, 'state.json');
    const newStatePath = path.join(baseDir, 'state.json');
    if ((await exists(oldStatePath)) && !(await exists(newStatePath))) {
      await fs.copyFile(oldStatePath, newStatePath);
      await fs.chmod(newStatePath, 0o600);
    }
  } catch (err) {
    // Remove any markers we created so the next run can retry.
    for (const marker of createdMarkers) {
      await fs.unlink(marker).catch(() => {
        // Best-effort cleanup; ignore failures so we still throw the original error.
      });
    }
    throw err;
  }
}
