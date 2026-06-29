import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

export async function sha256(filePath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function sha256String(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export interface AtomicWriteOptions {
  /** File mode for the final file (e.g. 0o600). */
  mode?: number;
  /** Temporary file prefix, placed next to the target file. */
  tmpPrefix?: string;
  /** If true, fsync the file data before renaming. */
  fsync?: boolean;
}

/**
 * Atomically write `content` to `filePath` using a temporary file + rename.
 * The temporary file is cleaned up on failure. Optionally fsyncs before rename.
 */
export async function atomicWrite(
  filePath: string,
  content: string | Buffer,
  opts: AtomicWriteOptions = {},
): Promise<void> {
  const { mode = 0o600, tmpPrefix = '.tmp.', fsync = false } = opts;
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `${tmpPrefix}${crypto.randomUUID()}`);

  try {
    await fs.writeFile(tmp, content, { mode });
    if (fsync) {
      const fh = await fs.open(tmp, 'r+');
      try {
        await fh.sync();
      } finally {
        await fh.close();
      }
    }
    await fs.rename(tmp, filePath);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

/**
 * Atomically write a JSON object to `filePath`.
 */
export async function atomicWriteJson(
  filePath: string,
  obj: unknown,
  opts: AtomicWriteOptions = {},
): Promise<void> {
  await atomicWrite(filePath, JSON.stringify(obj, null, 2), opts);
}
