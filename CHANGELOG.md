# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2025-05-13

### Added
- Initial release
- Adapters for Claude Code, OpenCode, Codex, and Gemini CLI
- Custom adapter support with configurable format (yaml-frontmatter, gemini-toml, raw)
- Global (`~/.pi/agent/unify-cmd.json`) and project (`.unify-cmd.json`) configuration
- Configurable label format and command prefix format
- Argument interpolation for $ARGUMENTS, $@, $1..$N, ${@:N:L}, {{args}}
- Management commands: list, reload, scan, config
- 50 tests with 92%+ coverage
