import fs from 'node:fs/promises';
import path from 'node:path';
import { exists } from './fs-utils.js';
import { getProfilesDir, TARGETS, type TargetConfig } from './config.js';

export async function ensureMigratedToCentralStore(
  baseDir: string,
  targets: readonly TargetConfig[] = TARGETS,
): Promise<void> {
  const profileRoot = path.join(baseDir, 'profiles');
  await fs.mkdir(profileRoot, { recursive: true });

  for (const target of targets) {
    // Per-target marker (profiles/<id>/.migrated). A target migrated once stays
    // migrated, but a target first seen later — e.g. opencode after an initial
    // claude-only run — still gets its legacy profiles copied. A single global
    // marker would incorrectly skip every target added after the first run.
    // The marker has no extension, so the adapters' listAliases() (.json/.toml
    // filters) never surface it as a profile.
    const marker = path.join(profileRoot, target.id, '.migrated');
    if (await exists(marker)) continue;

    const oldDir = getProfilesDir(target);
    if (!(await exists(oldDir))) continue;

    const newDir = path.join(profileRoot, target.id);
    await fs.mkdir(newDir, { recursive: true });
    const entries = await fs.readdir(oldDir);
    for (const entry of entries) {
      if (entry.endsWith('.json') || entry.endsWith('.toml')) {
        await fs.copyFile(path.join(oldDir, entry), path.join(newDir, entry));
      }
    }

    await fs.writeFile(marker, '');
  }
}
