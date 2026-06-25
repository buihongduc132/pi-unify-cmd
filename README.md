# pi-unify-cmd

[![npm version](https://img.shields.io/npm/v/pi-unify-cmd.svg)](https://www.npmjs.com/package/pi-unify-cmd)
[![license](https://img.shields.io/npm/l/pi-unify-cmd.svg)](https://github.com/buihongduc132/pi-unify-cmd/blob/main/LICENSE)
[![tests](https://img.shields.io/badge/tests-50%20passing-brightgreen.svg)](https://github.com/buihongduc132/pi-unify-cmd)

Load slash commands from **Claude Code**, **OpenCode**, **Codex**, and **Gemini CLI** into [pi](https://github.com/mariozechner/pi-coding-agent) — using the adapter pattern with configurable sources and formats.

## Features

- **Multi-agent discovery** — automatically scans `.md` and `.toml` command files from Claude Code, OpenCode, Codex, and Gemini CLI
- **OpenCode symlink mirroring** — OpenCode commands are mirrored as symlinks into pi's native prompts dir, making them first-class slash commands (e.g. `/review` instead of `/opencode:review`)
- **Agent-prefixed commands** — each command gets a namespaced name (e.g. `/claude:review`, `/codex:opsx-apply`, `/gemini:change`)
- **Full argument interpolation** — normalizes `$ARGUMENTS`, `$1`, `$@`, `${@:N:L}`, `{{args}}` across all agents
- **Custom adapters** — add your own command sources with configurable formats
- **Global + project config** — deep merge of `~/.pi/agent/unify-cmd.json` and `.unify-cmd.json`
- **Management slash commands** — list, reload, scan, config, and mirror status inspection

## Installation

### For humans

```bash
# Add to your pi settings:
pi --add-package pi-unify-cmd
```

Or manually add to `~/.pi/agent/settings.json`:

```json
{
  "packages": ["pi-unify-cmd"]
}
```

### For AI agents

```
Add "pi-unify-cmd" to the packages array in ~/.pi/agent/settings.json, then run pi install.
```

### Git-sourced

```json
{
  "packages": [
    "github:buihongduc132/pi-unify-cmd"
  ]
}
```

## Usage

Once installed, pi-unify-cmd automatically discovers command files from other CLI agents and registers them as pi slash commands.

### Supported Agents

| Agent | Format | Global Dir | Project Dir |
|-------|--------|------------|-------------|
| Claude Code | YAML frontmatter | `~/.claude/commands/` | `.claude/commands/` |
| OpenCode | YAML frontmatter | `~/.config/opencode/commands/` | `.opencode/commands/` _(mirrored)_ |
| Codex | YAML frontmatter | `~/.codex/prompts/` | — |
| Gemini | TOML + YAML frontmatter | `~/.gemini/commands/` | — |
| Custom | Configurable | Configurable | Configurable |

### Argument Interpolation

| Agent | Syntax | Example |
|-------|--------|---------|
| Claude | `$ARGUMENTS` | `Review: $ARGUMENTS` |
| Codex | `$1`, `$@`, `${@:N:L}` | `Create $1 with $@` |
| Gemini | `{{args}}` | `Run: {{args}}` |
| Pi | `$1`, `$@`, `${@:N:L}` | `Build $1 ${@:2}` |

> **OpenCode commands are mirrored as native pi prompts by default** (`mirrorToPrompts: true`). They appear as first-class `/<name>` slash commands via pi's native prompt engine. Set `opencode.mirrorToPrompts: false` to use the legacy `/opencode:<name>` path instead.

### Management Commands

```
/unify-cmd:list    — List all discovered commands
/unify-cmd:reload  — Rescan all directories
/unify-cmd:scan    — Show directory discovery details
/unify-cmd:config  — Show current configuration
/unify-cmd:mirror  — Show mirror status (--clean to remove, --refresh to re-run)
```

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

| Option | Description | Default |
|--------|-------------|---------|
| `agents.*.enabled` | Enable/disable agent | `true` |
| `agents.*.globalDir` | Global commands directory | agent-specific |
| `agents.*.projectDir` | Project-level commands directory | agent-specific |
| `agents.*.mirrorToPrompts` | Mirror commands as native pi symlinks + suppress legacy prefix | `true` (opencode), `false` (others) |
| `custom` | Array of custom adapter configs | `[]` |
| `labelFormat` | Autocomplete description format | `[{scope}] ({agent}) \| {description}` |
| `prefixFormat` | Command name format | `{agent}:{name}` |

**Tokens:** `{scope}` → `G`/`L`, `{agent}` → agent name, `{name}` → command name, `{description}` → command description

## License

MIT © [buihongduc132](https://github.com/buihongduc132)

Repository: [buihongduc132/pi-unify-cmd](https://github.com/buihongduc132/pi-unify-cmd)
