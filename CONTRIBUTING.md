# Contributing

Thanks for your interest in contributing to `llm-switch`!

## Development setup

Prerequisites:

- **Node.js ≥ 20** (`.nvmrc` pins the version used in CI; any 20+ release works)
- **pnpm ≥ 11** (CI runs 11; older versions may not understand the lockfile format)

Clone, install, and run the test suite to verify everything works on your machine before making changes:

```bash
git clone https://github.com/xavier2code/llm-switch.git
cd llm-switch
pnpm install
pnpm test
```

`pnpm install` also enables a pre-commit hook (via `git config core.hooksPath`) that runs lint and format checks on every commit.

## Commands

| Command | What it does |
|---|---|
| `pnpm test` | Run the vitest suite once |
| `pnpm -F llm-switch test:watch` | Watch mode for one package |
| `pnpm -F llm-switch typecheck` | `tsc --noEmit` |
| `pnpm -F llm-switch lint` | ESLint over `packages/cli/` |
| `pnpm -F llm-switch format` | Prettier --write (auto-format) |
| `pnpm -F llm-switch format:check` | Prettier --check (CI mode) |
| `pnpm -F llm-switch build` | Bundle the CLI with tsup to `packages/cli/dist/` |
| `pnpm -r build` | Build every workspace package |

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/). The commit type drives the changelog categorization and the version bump (see `CLAUDE.md` for the full policy):

| Prefix | Used for | Version impact |
|---|---|---|
| `feat:` | New subcommand or new user-facing feature | minor |
| `fix:` | Bug fix | patch |
| `refactor:` | Code change with no behavior change | patch |
| `docs:` | Documentation only (README, CHANGELOG, comments) | patch |
| `test:` | Test-only change | patch |
| `chore:` | Build, CI, tooling, version bumps | patch |

Scope is usually `(cli)` for changes to `packages/cli/`, `(plugin)` for the plugin wrapper, or omitted for cross-cutting work.

Examples:

```
feat(cli): add save --force flag to skip overwrite confirmation
fix(cli): handle Ctrl-C cleanly during the create wizard
chore: bump to 0.5.0
```

## Pull request process

1. Branch off `main`. Branch name should describe the change (`fix/...`, `feat/...`, `refactor/...`).
2. Make your change. If it touches behavior, include tests. Every new function/method needs at least one test that exercises it.
3. Run the full local check before pushing:
   ```bash
   pnpm test
   pnpm -F llm-switch lint
   pnpm -F llm-switch format:check
   pnpm -F llm-switch typecheck
   pnpm -F llm-switch build
   ```
   The pre-commit hook runs the lint + format subset automatically.
4. Open a PR against `main`. CI will run the same checks on Node 22 and Node 24.
5. Wait for review. Squash commits if requested; otherwise we squash-merge in the GitHub UI.

## Where things live

```
packages/
├── cli/                 # the published npm package `llm-switch`
│   ├── src/
│   │   ├── cli.ts       # commander entrypoint, subcommand wiring
│   │   ├── commands/    # one file per subcommand (list, switch, ...)
│   │   ├── *.ts         # shared modules (config, scanner, validator, ...)
│   │   └── errors.ts    # custom error hierarchy with mapped exit codes
│   ├── test/            # vitest, mirrors src/
│   ├── bin/             # the executable shim
│   └── dist/            # built bundle (gitignored)
└── claude-code-plugin/  # Claude Code plugin wrapper (markdown + JSON only)
```

## Code style

- TypeScript strict mode is on (`tsconfig.json` has `"strict": true`). The project compiles to ESM and targets Node 20.
- Prettier handles whitespace and quote style. Run `pnpm -F llm-switch format` to auto-format.
- ESLint enforces basic hygiene (`@typescript-eslint/recommended` plus a few custom rules). Run `pnpm -F llm-switch lint`.
- Keep public APIs typed. Don't add `any` without a comment explaining why.

## Testing approach

We follow TDD: write a failing test, watch it fail, then write the minimum code to pass. The pre-commit hook and CI both enforce that tests + lint + format pass. The project policy is documented in `CLAUDE.md`.

If you're fixing a bug, write a test that reproduces it first. If you're adding a feature, write a test that demonstrates the new behavior. Both should fail before your change and pass after.

## Reporting issues

For bugs and feature requests, open a GitHub issue. For security vulnerabilities, see [`SECURITY.md`](./SECURITY.md).

## Code of conduct

Be kind. Assume good faith. Disagree on substance, not on people. This is a small project — we don't have a formal CoC, but the standard "be excellent to each other" applies.
