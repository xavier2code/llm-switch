import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

interface AtomicWriteOptions {
  mode?: number;
}

export async function atomicWrite(
  targetPath: string,
  content: string,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const dir = path.dirname(targetPath);
  const tmpName = `.atomic-write-${randomUUID()}.tmp`;
  const tmpPath = path.join(dir, tmpName);

  try {
    // 1. Ensure parent directory exists
    await fs.mkdir(dir, { recursive: true });

    // 2. Write to temporary file
    await fs.writeFile(tmpPath, content, 'utf-8');

    // 3. Set file mode if provided
    if (options.mode !== undefined) {
      await fs.chmod(tmpPath, options.mode);
    }

    // 4. Atomic rename
    await fs.rename(tmpPath, targetPath);
  } catch (err) {
    // 5. Clean up temp file on any error
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignore cleanup errors (e.g., temp file was never created)
    }
    throw err;
  }
}
