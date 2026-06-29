import pc from 'picocolors';

const noColor = process.env.NO_COLOR !== undefined || !process.stdout.isTTY;
const red = noColor ? (s: string) => s : pc.red;
const yellow = noColor ? (s: string) => s : pc.yellow;

export const log = {
  info: (msg: string): void => {
    process.stdout.write(`${msg}\n`);
  },
  warn: (msg: string): void => {
    process.stderr.write(`${yellow(msg)}\n`);
  },
  error: (msg: string): void => {
    process.stderr.write(`${red(msg)}\n`);
  },
};
