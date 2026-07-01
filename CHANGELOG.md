# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-01

### Added

- Initial release of `@xavier2code/llm-switch`, a scoped CLI for switching LLM
  profiles across Claude Code, OpenCode, and Codex.
- Centralized profile store under `~/.llm-switch/profiles/<target-id>/`.
- Automatic backup of active configs before every switch (`<active>.bak`).
- Interactive TUI when running `sw` without arguments.
- Built-in providers: GLM, DeepSeek, Kimi, MiniMax, Qwen, and OpenAI.
- Multi-target support with remembered selection and `--target` override.

### Changed

- Package published as `@xavier2code/llm-switch`. The previous unscoped
  `llm-switch` package is deprecated and will not receive further updates.

### Fixed

- Backup files live next to the active config they protect, respecting
  `CLAUDE_CONFIG_DIR`, `OPENCODE_CONFIG_DIR`, and `CODEX_HOME`.

[Unreleased]: https://github.com/xavier2code/llm-switch/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/xavier2code/llm-switch/releases/tag/v0.1.0
