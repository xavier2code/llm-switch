import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

interface AtomicWriteOptions {
  mode?: number;
}

/**
 * Write a file atomically by writing to a temporary file and renaming it
 * into place. This ensures that the target path never contains a partially
 * written file.
 */
export async function atomicWrite(
  targetPath: string,
  content: string,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const dir = path.dirname(targetPath);
  const tmpName = `.atomic-write-${randomUUID()}.tmp`;
  const tmpPath = path.join(dir, tmpName);

  let tempCreated = false;

  try {
    // 1. Ensure parent directory exists
    await fs.mkdir(dir, { recursive: true });

    // 2. Write to temporary file
    await fs.writeFile(tmpPath, content, 'utf-8');
    tempCreated = true;

    // 3. Set file mode if provided
    if (options.mode !== undefined) {
      await fs.chmod(tmpPath, options.mode);
    }

    // 4. Atomic rename
    await fs.rename(tmpPath, targetPath);
  } catch (err) {
    // 5. Clean up temp file on any error, but only if we created it
    if (tempCreated) {
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw err;
  }
}
