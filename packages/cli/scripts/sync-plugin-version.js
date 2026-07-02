#!/usr/bin/env node
/* global console, process */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPkgPath = path.resolve(__dirname, '../package.json');
const pluginPkgPath = path.resolve(__dirname, '../../claude-code-plugin/package.json');
const pluginJsonPath = path.resolve(
  __dirname,
  '../../claude-code-plugin/.claude-plugin/plugin.json',
);

async function updateJson(filePath, version) {
  const raw = await fs.readFile(filePath, 'utf8');
  const json = JSON.parse(raw);
  json.version = version;
  const content = `${JSON.stringify(json, null, 2)}\n`;
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.tmp.${crypto.randomUUID()}`);
  try {
    await fs.writeFile(tmp, content, { mode: 0o644 });
    await fs.rename(tmp, filePath);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

async function main() {
  const cliPkg = JSON.parse(await fs.readFile(cliPkgPath, 'utf8'));
  const version = cliPkg.version;
  if (!version || typeof version !== 'string') {
    throw new Error(`Cannot read version from ${cliPkgPath}`);
  }
  await updateJson(pluginPkgPath, version);
  await updateJson(pluginJsonPath, version);
  console.log(`Synced plugin version to ${version}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
