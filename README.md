# pi-unify-cmd

Load slash commands from **Claude Code**, **OpenCode**, **Codex**, and **Gemini CLI** into [pi](https://github.com/mariozechner/pi-coding-agent) — using the adapter pattern.

## What it does

Discovers `.md` and `.toml` command files from other CLI agents and registers them as pi slash commands. Each command gets an agent-prefixed name (e.g. `/claude:review`, `/codex:opsx-apply`, `/gemini:change`) with full argument interpolation.

## Installation

```bash
# Add to ~/.pi/agent/settings.json packages array:
"pi-unify-cmd"

# Or via CLI:
pi --add-package pi-unify-cmd
```

## Supported Agents

| Agent | Format | Global Dir | Project Dir |
|-------|--------|------------|-------------|
| Claude Code | YAML frontmatter | `~/.claude/commands/` | `.claude/commands/` |
| OpenCode | YAML frontmatter | `~/.config/opencode/commands/` | `.opencode/commands/` |
| Codex | YAML frontmatter | `~/.codex/prompts/` | — |
| Gemini | TOML + YAML frontmatter | `~/.gemini/commands/` | — |
| Custom | Configurable | Configurable | Configurable |

## Argument Interpolation

All agent-specific argument syntax is normalized:

| Agent | Syntax | Example |
|-------|--------|---------|
| Claude | `$ARGUMENTS` | `Review: $ARGUMENTS` |
| Codex | `$1`, `$@`, `${@:N:L}` | `Create $1 with $@` |
| Gemini | `{{args}}` | `Run: {{args}}` |
| Pi | `$1`, `$@`, `${@:N:L}` | `Build $1 ${@:2}` |

## Configuration

**Global:** `~/.pi/agent/unify-cmd.json`
**Project:** `.unify-cmd.json`

```json
{
  "agents": {
    "claude": { "enabled": true, "globalDir": "~/.claude/commands", "projectDir": ".claude/commands" },
    "opencode": { "enabled": true, "globalDir": "~/.config/opencode/commands", "projectDir": ".opencode/commands" },
    "codex": { "enabled": true, "globalDir": "~/.codex/prompts" },
    "gemini": { "enabled": true, "globalDir": "~/.gemini/commands" }
  },
  "custom": [
    {
      "name": "my-agent",
      "enabled": true,
      "globalDir": "~/.my-agent/cmds",
      "format": "yaml-frontmatter"
    }
  ],
  "labelFormat": "[{scope}] ({agent}) | {description}",
  "prefixFormat": "{agent}:{name}"
}
```

### Config Options

| Option | Description | Default |
|--------|-------------|---------|
| `agents.*.enabled` | Enable/disable agent | `true` |
| `agents.*.globalDir` | Global commands directory | agent-specific |
| `agents.*.projectDir` | Project-level commands directory | agent-specific |
| `custom` | Array of custom adapter configs | `[]` |
| `labelFormat` | Autocomplete description format | `[{scope}] ({agent}) \| {description}` |
| `prefixFormat` | Command name format | `{agent}:{name}` |

**Tokens:** `{scope}` → `G`/`L`, `{agent}` → agent name, `{name}` → command name, `{description}` → command description

### Custom Adapters

Add your own command sources with `format: "yaml-frontmatter" | "gemini-toml" | "raw"`.

## Management Commands

```
/unify-cmd:list    — List all discovered commands
/unify-cmd:reload  — Rescan all directories
/unify-cmd:scan    — Show directory discovery details
/unify-cmd:config  — Show current configuration
```

## Architecture

```
extensions/
├── index.ts            ← Extension entry: discovery + registerCommand
├── index-helpers.ts    ← Pure functions: arg interpolation, label/name formatting
├── adapters.ts         ← CommandAdapter interface + 5 adapters
├── config.ts           ← Config loader (global + project deep merge)
├── types.ts            ← Shared types + defaults
└── *.test.ts           ← 50 tests, 92%+ coverage
```

Adapter pattern: each agent has an adapter that knows how to scan its directory and parse its format. All adapters implement the `CommandAdapter` interface. Custom adapters use the same interface with configurable format.

## License

MIT
