import pc from 'picocolors';

const noColor = process.env.NO_COLOR !== undefined || !process.stdout.isTTY;

const c = noColor
  ? {
      red: (s: string) => s,
      green: (s: string) => s,
      yellow: (s: string) => s,
      cyan: (s: string) => s,
      dim: (s: string) => s,
      bold: (s: string) => s,
    }
  : pc;

export const log = {
  info: (msg: string): void => {
    process.stdout.write(`${msg}\n`);
  },
  success: (msg: string): void => {
    process.stdout.write(`${c.green(msg)}\n`);
  },
  warn: (msg: string): void => {
    process.stderr.write(`${c.yellow(msg)}\n`);
  },
  error: (msg: string): void => {
    process.stderr.write(`${c.red(msg)}\n`);
  },
  dim: (msg: string): void => {
    process.stdout.write(`${c.dim(msg)}\n`);
  },
  bold: (msg: string): void => {
    process.stdout.write(`${c.bold(msg)}\n`);
  },
  cyan: (msg: string): void => {
    process.stdout.write(`${c.cyan(msg)}\n`);
  },
};
