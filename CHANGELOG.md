# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-06-24

### Added
- **Symlink mirroring**: OpenCode commands are now mirrored as symlinks into pi's native prompts directory on session start. Global commands → `~/.pi/agent/prompts/<name>.md`, project commands → `<cwd>/.pi/prompts/<name>.md`. pi's engine surfaces them as first-class slash commands (e.g., `/review` instead of `/opencode:review`).
- **`mirrorToPrompts` config flag**: Per-agent boolean flag (default `true` for opencode, `false` for others). When enabled, discovered commands are mirrored AND legacy `<agent>:<name>` registration is suppressed.
- **`/unify-cmd:mirror` command**: Reports mirror status (created/reused/replaced/skipped/broken counts). Supports `--clean` to remove extension-managed symlinks and `--refresh` to re-run mirroring.
- **`mirror.ts` module**: Idempotent symlink creation with relative paths, error handling (never blocks session start), skip-on-collision (never overwrites real files), replace-stale (fixes broken symlinks).
- 11 new tests in `mirror.test.ts` covering symlink lifecycle, error handling, relative paths, and cleanup.

### Changed
- **OpenCode commands are first-class by default**: With `opencode.mirrorToPrompts: true` (new default), opencode commands are registered via pi's native prompt engine instead of the legacy `opencode:<name>` path. Users can opt out by setting `opencode.mirrorToPrompts: false`.
- Config normalization in `config.ts`: ensures `mirrorToPrompts` is always a boolean after deep-merge.
- `/unify-cmd:scan` and `/unify-cmd:config` now display the `mirror` flag when enabled.

### Migration
Existing configs continue to work unchanged. The new default `opencode.mirrorToPrompts: true` means opencode commands will be mirrored as native pi prompts on next session start. To retain the legacy `opencode:<name>` behavior, set `opencode.mirrorToPrompts: false` in your config.

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
