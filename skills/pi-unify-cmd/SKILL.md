---
name: pi-unify-cmd
description: Load slash commands from Claude Code, OpenCode, Codex, and Gemini CLI into pi using adapter pattern. Configure custom sources, formats, and labels.
---

# pi-unify-cmd

Unified slash command loader for pi — loads commands from other CLI agents.

## When to use

- User wants to use Claude/OpenCode/Codex/Gemini commands inside pi
- User wants to configure custom command sources
- User asks about cross-agent command compatibility

## Key concepts

- **Adapter pattern**: each agent has a `CommandAdapter` that scans + parses its format
- **Config**: `~/.pi/agent/unify-cmd.json` (global) + `.unify-cmd.json` (project)
- **Commands**: `/unify-cmd:list`, `/unify-cmd:reload`, `/unify-cmd:scan`, `/unify-cmd:config`

## Architecture

```
extensions/
├── index.ts            ← Extension entry (pi ExtensionAPI)
├── index-helpers.ts    ← Pure functions (testable without pi)
├── adapters.ts         ← CommandAdapter interface + 5 adapters
├── config.ts           ← Config loader with deep merge
├── types.ts            ← Shared types + defaults
└── *.test.ts           ← 50 tests, 92%+ coverage
```

## Adapters

| Adapter | Format | Key difference |
|---------|--------|----------------|
| ClaudeAdapter | YAML frontmatter | `$ARGUMENTS` for args |
| OpenCodeAdapter | YAML frontmatter | Same as Claude |
| CodexAdapter | YAML frontmatter | `$@`, `$1` for args |
| GeminiAdapter | TOML + YAML frontmatter | `{{args}}`, `!{command}` syntax |
| CustomAdapter | Configurable | User-defined format |

## Testing

```bash
npm test              # vitest run
npm run test:coverage # with coverage report
npm run check         # typecheck + coverage
npm run smoke-test    # verify command discovery
```
