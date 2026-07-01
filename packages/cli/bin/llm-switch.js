#!/usr/bin/env node
/* global process */
process.stderr.write(
  "[llm-switch] The 'llm-switch' command is deprecated and will be removed in a future release. Use 'sw' instead.\n",
);
import('../dist/cli.js').catch((err) => {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.stderr.write('\n');
  process.exit(1);
});
