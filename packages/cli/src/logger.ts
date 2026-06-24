import pc from 'picocolors';

const noColor = process.env.NO_COLOR !== undefined || !process.stdout.isTTY;
const red = noColor ? (s: string) => s : pc.red;

export const log = {
  error: (msg: string): void => {
    process.stderr.write(`${red(msg)}\n`);
  },
};
