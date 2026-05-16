# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-05-16

### Added
- Multi-directory adapter config: `globalDirs: string[]` and `projectDirs: string[]` alongside the existing singular `globalDir`/`projectDir` fields. Both are combined and de-duplicated at discovery time.
- Recursive subdirectory scanning, opt-in per adapter via `recursive: true`. Nested paths are flattened into pi command names using `nameSeparator` (default `__`). Example: `bkfw/pr-resolve.md` → `bkfw__pr-resolve`.
- Per-adapter `nameSeparator` override.
- `discovery.ts` module exposing `discoverCommands`, `listGlobalRoots`, `listProjectRoots` — extracted from `index.ts` for unit-testability.
- 20 new tests covering recursive scan, multi-dir, and name flattening (70 total).

### Changed
- Default opencode adapter now scans three roots out of the box: `~/.config/opencode/commands`, `~/.config/opencode/command`, `~/.config/opencode/profiles/default/commands`. Project-level: `.opencode/commands` and `.opencode/command`.
- Default `recursive: true` for all built-in adapters — modern claude/opencode/codex/gemini setups commonly nest commands by namespace.
- `/unify-cmd:scan` and `/unify-cmd:config` now display every configured root and the resolved flags.
- Duplicate command names emitted by overlapping roots are now skipped at registration time (first wins).

### Migration
Existing configs continue to work unchanged. `globalDir` and `globalDirs` may be used together; entries are de-duplicated. To disable recursion explicitly, set `"recursive": false` in your adapter config.

## [0.1.0] - 2026-05-13

### Added
- Initial release
- Adapters for Claude Code, OpenCode, Codex, and Gemini CLI
- Custom adapter support with configurable format (yaml-frontmatter, gemini-toml, raw)
- Global (`~/.pi/agent/unify-cmd.json`) and project (`.unify-cmd.json`) configuration
- Configurable label format and command prefix format
- Argument interpolation for $ARGUMENTS, $@, $1..$N, ${@:N:L}, {{args}}
- Management commands: list, reload, scan, config
- 50 tests with 92%+ coverage
