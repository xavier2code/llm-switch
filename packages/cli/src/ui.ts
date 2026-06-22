import readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { Profile } from './scanner.js';
import { ALIAS_RE } from './config.js';

export interface ReadlineIO {
  input: Readable;
  output: Writable;
}

function makeRl(io: ReadlineIO): readline.Interface {
  return readline.createInterface({ input: io.input, output: io.output });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export async function pickProfile(
  profiles: Profile[],
  io: ReadlineIO = { input: process.stdin, output: process.stdout },
): Promise<Profile | null> {
  const rl = makeRl(io);
  try {
    if (profiles.length === 0) return null;

    process.stdout.write('\n');
    profiles.forEach((p, i) => {
      const marker = p.active ? '*' : ' ';
      process.stdout.write(`  ${marker} ${i + 1}. ${p.alias}\n`);
    });
    process.stdout.write(`\nSelect profile [1-${profiles.length}] (Enter to cancel): `);

    const answer = (await ask(rl, '')).trim();
    if (!answer) return null;

    const idx = Number.parseInt(answer, 10);
    if (!Number.isFinite(idx) || idx < 1 || idx > profiles.length) return null;
    return profiles[idx - 1] ?? null;
  } finally {
    rl.close();
  }
}

export async function promptAlias(
  existing: string[],
  io: ReadlineIO = { input: process.stdin, output: process.stdout },
): Promise<string | null> {
  const rl = makeRl(io);
  try {
    process.stdout.write('\nAlias name (Enter to cancel): ');
    const answer = (await ask(rl, '')).trim();
    if (!answer) return null;
    if (!ALIAS_RE.test(answer)) {
      process.stderr.write(
        `Invalid alias. Must match ${ALIAS_RE} (lowercase, digits, . _ -, 1-64 chars).\n`,
      );
      return null;
    }
    if (existing.includes(answer)) {
      process.stderr.write(`Alias '${answer}' already exists.\n`);
      return null;
    }
    return answer;
  } finally {
    rl.close();
  }
}
