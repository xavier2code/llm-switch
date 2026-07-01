import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, '..');
const cliPackagePath = path.resolve(pluginDir, '..', 'cli', 'package.json');
const pluginPackagePath = path.resolve(pluginDir, 'package.json');
const pluginJsonPath = path.resolve(pluginDir, '.claude-plugin', 'plugin.json');
const commandPath = path.resolve(pluginDir, 'commands', 'switch-config.md');

describe('claude-code-plugin', () => {
  it('plugin package version matches CLI package version', async () => {
    const [cliPkg, pluginPkg] = await Promise.all([
      fs.readFile(cliPackagePath, 'utf8').then(JSON.parse),
      fs.readFile(pluginPackagePath, 'utf8').then(JSON.parse),
    ]);
    assert.equal(pluginPkg.version, cliPkg.version);
  });

  it('plugin.json version matches package version', async () => {
    const [pluginPkg, pluginJson] = await Promise.all([
      fs.readFile(pluginPackagePath, 'utf8').then(JSON.parse),
      fs.readFile(pluginJsonPath, 'utf8').then(JSON.parse),
    ]);
    assert.equal(pluginJson.version, pluginPkg.version);
    assert.equal(pluginJson.name, 'llm-switch');
    assert.ok(Array.isArray(pluginJson.commands));
    assert(pluginJson.commands.includes('./commands/switch-config.md'));
  });

  it('switch-config.md exists and references sw CLI', async () => {
    const content = await fs.readFile(commandPath, 'utf8');
    assert(content.includes('sw'));
    assert(content.includes('Switch'));
  });
});
