#!/usr/bin/env node
/* global process */
process.stderr.write(
  "[llm-switch] The 'llm-switch' command is deprecated and will be removed in a future release. Use 'sw' instead.\n",
);
import('../dist/cli.js');
