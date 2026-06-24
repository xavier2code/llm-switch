import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { backupCurrent } from './backup.js';

export async function switchTo(
  sourcePath: string,
  settingsPath: string,
  backupPath: string,
): Promise<void> {
  await backupCurrent(settingsPath, backupPath);

  const tmpPath = path.join(
    path.dirname(settingsPath),
    `.settings.${crypto.randomUUID()}.tmp`,
  );

  try {
    await fs.copyFile(sourcePath, tmpPath);
    await fs.chmod(tmpPath, 0o600);
    await fs.rename(tmpPath, settingsPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true });
    throw err;
  }
}