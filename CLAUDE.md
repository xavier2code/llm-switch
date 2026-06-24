# CLAUDE.md

Project conventions for AI assistants and human contributors. Update this file
when the team's working agreements change.

## Versioning policy

This project uses [Semantic Versioning](https://semver.org/) and currently
lives in the `0.x.y` range. **Do not publish `1.0.0` until the project is
explicitly declared stable** — the major version stays at `0`.

### When to bump

| Change                                                                       | Bump          | Example                  |
| ---------------------------------------------------------------------------- | ------------- | ------------------------ |
| New subcommand or new user-facing feature                                    | **Minor**     | Adding `create`:         |
|                                                                              | `0.X.0`       | `0.2.0` → `0.3.0`        |
| New flag/option on an existing subcommand                                    | **Minor**     | Adding `--dry-run`:      |
|                                                                              | `0.X.0`       | `0.X.0`                  |
| Breaking change to a subcommand's behavior or CLI surface                   | **Minor**     | Renaming a subcommand:   |
|                                                                              | `0.X.0`       | `0.X.0`                  |
| Bug fix with no intended behavior change                                     | **Patch**     | Fixing a Ctrl-C crash:   |
|                                                                              | `0.X.Y`       | `0.X.Y`                  |
| Documentation-only change (CHANGELOG, README, comments)                      | **Patch**     |                          |
|                                                                              | `0.X.Y`       |                          |
| Dependency bump with no user-visible change                                  | **Patch**     |                          |
|                                                                              | `0.X.Y`       |                          |
| Refactor / test-only change (no behavior change)                            | **Patch**     |                          |
|                                                                              | `0.X.Y`       |                          |

**Pre-1.0 exception**: minor bumps (`0.X.0`) may include breaking changes.
This is standard SemVer behavior for the `0.y.z` range. Once the project
reaches `1.0.0`, this exception goes away and breaking changes require a
major bump.

When in doubt, prefer **patch** — it's always safe to release more often.

### When to go to `1.0.0`

**Not yet.** Bumping to `1.0.0` requires an explicit decision, not a
side-effect of feature work. All of the following must hold before the
bump is made:

- [ ] All planned core features are implemented
- [ ] The CLI surface has been stable for at least one full minor release
      cycle (no breaking changes planned in the near term)
- [ ] Test coverage is adequate for the documented use cases
- [ ] README and CHANGELOG are accurate and complete
- [ ] The project owner has explicitly green-lit the `1.0.0` bump

When the team decides the criteria are met:

1. Open an issue or discussion to confirm the bump with stakeholders
2. Audit the CHANGELOG for the `0.x` era and clean up any inaccuracies
3. Bump version, tag, release, and publish following the release checklist
4. Update this file: drop the "pre-1.0" framing and the no-`1.0.0` policy

### Release checklist (when bumping)

1. `packages/cli/package.json` — bump `version`
2. `CHANGELOG.md` — convert the `[Unreleased]` section into a versioned
   section, add a fresh empty `[Unreleased]` above it
3. `git tag -a vX.Y.Z -m "vX.Y.Z: brief description"`
4. `git push origin main` and `git push origin vX.Y.Z`
5. `gh release create vX.Y.Z` with notes summarizing the changes
6. `npm publish` (requires an Automation token; never commit the token)
7. **Plugin sync**: `packages/claude-code-plugin/package.json` and
   `packages/claude-code-plugin/.claude-plugin/plugin.json` — bump to the
   same `X.Y.Z` as the CLI. The plugin follows the CLI version verbatim
   (Option A in issue #14); if the plugin ever grows independent
   features, switch to Option B and document a compatibility matrix.

### Deciding the bump type from commit history

A reasonable rule of thumb when squinting at the diff since the last tag:

- Any commit prefixed `feat:` → at least minor
- Otherwise, any `fix:` / `chore:` / `docs:` / `test:` / `refactor:` → patch
- Multiple `feat:`s between releases still collapse into a single minor bump
  (don't burn version numbers on every commit)
