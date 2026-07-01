import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const BIN = path.resolve(__dirname, '../bin/sw.js');

describe('cli smoke tests', () => {
  beforeAll(async () => {
    // Ensure dist exists; build synchronously if missing
    try {
      await fs.access(path.resolve(__dirname, '../dist/cli.js'));
    } catch {
      execFileSync('pnpm', ['build'], {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    }
  });

  describe('--version', () => {
    it('exits 0 and outputs version number in semver format', () => {
      const stdout = execFileSync('node', [BIN, '--version'], {
        encoding: 'utf8',
      });

      // Exit code is 0 if execFileSync doesn't throw
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/);
    });
  });

  describe('--help', () => {
    it('exits 0 and mentions main commands', () => {
      const stdout = execFileSync('node', [BIN, '--help'], {
        encoding: 'utf8',
      });

      expect(stdout).toContain('list');
      expect(stdout).toContain('switch');
      expect(stdout).toContain('save');
      expect(stdout).toContain('create');
      expect(stdout).toContain('restore');
      expect(stdout).toContain('current');
      expect(stdout).toContain('init');
    });
  });

  describe('no arguments in non-TTY', () => {
    it('displays help because TUI requires a terminal', () => {
      let stderr = '';
      try {
        execFileSync('node', [BIN], { encoding: 'utf8' });
      } catch (err) {
        stderr = (err as { stderr?: string }).stderr ?? '';
      }
      expect(stderr).toContain('Usage: sw [options] [command]');
    });
  });

  describe('unknown command', () => {
    it('exits non-zero with error', () => {
      expect(() => {
        execFileSync('node', [BIN, 'not-a-real-command'], {
          encoding: 'utf8',
        });
      }).toThrow();
    });
  });
});
