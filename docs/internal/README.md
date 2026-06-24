# Internal design documents

This directory holds internal planning and design documents. They are
**not** part of the public API or user-facing documentation.

## What's here

| Subdir | Contents | Audience |
|---|---|---|
| `plans/` | TDD implementation plans written while building features. Capture the original step-by-step task breakdown that drove the work. | Contributors curious about implementation history |
| `specs/` | Design specs written before implementation. Capture the original requirements and design decisions. | Contributors curious about design rationale |

## Naming convention

Files are named `YYYY-MM-DD-<feature>.md` — the date the plan/spec was
written, then a short kebab-case feature name.

## Why these are kept

Most plans and specs are obsolete by the time a feature ships — the
codebase has moved on, edge cases were discovered and fixed, the
implementation diverged. They're kept for archaeology: if a contributor
wonders "why does it work this way?", the design spec often explains
the original reasoning.

## Why they're internal

- They are **AI-assistant planning artifacts**, written in Chinese, and
  reference internal tooling that isn't part of the published project.
- They were never meant to be API contracts or user documentation.
- The README, CHANGELOG, and `--help` output are the authoritative
  user-facing docs.

## If you're a contributor

You probably don't need to read anything here. The source code,
README, CHANGELOG, and `--help` output cover everything a contributor
needs. The specs and plans are kept for historical reference only.
