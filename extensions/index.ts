/**
 * pi-unify-cmd — load slash commands from other CLI agents into pi
 *
 * Discovers commands from Claude, OpenCode, Codex, Gemini, and custom sources,
 * then registers them as pi slash commands. Uses adapter pattern to handle
 * different file formats (YAML frontmatter, Gemini TOML, raw).
 *
 * Config:
 *   Global:   ~/.pi/agent/unify-cmd.json
 *   Project:  .unify-cmd.json
 *
 * Management commands:
 *   /unify-cmd:list    — list all discovered commands
 *   /unify-cmd:reload  — rescan all directories
 *   /unify-cmd:scan    — show directory discovery details
 *   /unify-cmd:config  — show current config
 *
 * @see types.ts for config schema
 */

import { existsSync } from "node:fs";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config";
import { discoverCommands, listGlobalRoots, listProjectRoots } from "./discovery";
import {
	interpolateArgs,
	formatLabel,
	formatCommandName,
} from "./index-helpers";
import type { UnifyCmdConfig, ExternalCommand } from "./types";

// ─── State ────────────────────────────────────────────────────────

interface PluginState {
	config: UnifyCmdConfig;
	commands: ExternalCommand[];
}

// ─── Extension Entry ──────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const cwd = process.cwd();
	let state: PluginState = registerAll(pi, cwd);

	// ── Management commands ──────────────────────────────────────

	pi.registerCommand("unify-cmd:list", {
		description: "List all unified commands from other CLI agents",
		handler: async (_args, ctx) => {
			if (state.commands.length === 0) {
				ctx.ui.notify("No external commands found.", "info");
				return;
			}

			const lines = state.commands.map((cmd) => {
				const s = cmd.source.scope === "global" ? "G" : "L";
				const desc = cmd.description || "no description";
				return `  [${s}] (${cmd.source.agent}) ${cmd.name} | ${desc}`;
			});

			ctx.ui.notify(
				`${state.commands.length} unified commands:\n${lines.join("\n")}`,
				"info",
			);
		},
	});

	pi.registerCommand("unify-cmd:reload", {
		description: "Rescan agent directories and reload unified commands",
		handler: async (_args, ctx) => {
			state = registerAll(pi, cwd);
			ctx.ui.notify(
				`Reloaded ${state.commands.length} unified commands.`,
				"info",
			);
		},
	});

	pi.registerCommand("unify-cmd:scan", {
		description: "Show which agent directories are being scanned",
		handler: async (_args, ctx) => {
			const lines: string[] = ["Scanning agent directories:"];

			for (const [name, cfg] of Object.entries(state.config.agents)) {
				if (!cfg.enabled) {
					lines.push(`  ${name}: DISABLED`);
					continue;
				}
				const flags: string[] = [];
				if (cfg.recursive) flags.push("recursive");
				if (cfg.nameSeparator && cfg.nameSeparator !== "__") {
					flags.push(`sep=${cfg.nameSeparator}`);
				}
				const flagStr = flags.length ? ` [${flags.join(", ")}]` : "";
				lines.push(`  ${name}${flagStr}:`);

				for (const dir of listGlobalRoots(cfg)) {
					const exists = existsSync(dir);
					lines.push(`    G ${dir} ${exists ? "✓" : "✗"}`);
				}
				for (const dir of listProjectRoots(cfg, cwd)) {
					const exists = existsSync(dir);
					lines.push(`    L ${dir} ${exists ? "✓" : "✗"}`);
				}
			}

			for (const custom of state.config.custom) {
				if (!custom.enabled) continue;
				lines.push(`  ${custom.name} (custom, ${custom.format}):`);
				for (const dir of listGlobalRoots(custom)) {
					const exists = existsSync(dir);
					lines.push(`    G ${dir} ${exists ? "✓" : "✗"}`);
				}
				for (const dir of listProjectRoots(custom, cwd)) {
					const exists = existsSync(dir);
					lines.push(`    L ${dir} ${exists ? "✓" : "✗"}`);
				}
			}

			lines.push(`\nFound ${state.commands.length} commands total.`);
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("unify-cmd:config", {
		description: "Show current pi-unify-cmd configuration",
		handler: async (_args, ctx) => {
			const lines = [
				`Label format: ${state.config.labelFormat}`,
				`Prefix format: ${state.config.prefixFormat}`,
				`Agents:`,
			];
			for (const [name, cfg] of Object.entries(state.config.agents)) {
				const globals = listGlobalRoots(cfg);
				const projects = listProjectRoots(cfg, cwd);
				lines.push(
					`  ${name}: ${cfg.enabled ? "ON" : "OFF"} — globals: ${
						globals.length ? globals.join(", ") : "none"
					} — projects: ${projects.length ? projects.join(", ") : "none"}`,
				);
			}
			if (state.config.custom.length > 0) {
				lines.push("Custom sources:");
				for (const c of state.config.custom) {
					const globals = listGlobalRoots(c);
					lines.push(
						`  ${c.name} (${c.format}): ${c.enabled ? "ON" : "OFF"} — ${
							globals.length ? globals.join(", ") : "none"
						}`,
					);
				}
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}

// ─── Registration ─────────────────────────────────────────────────

function registerAll(pi: ExtensionAPI, cwd: string): PluginState {
	const config = loadConfig(cwd);
	const commands = discoverCommands(config, cwd);

	const seen = new Set<string>();
	for (const cmd of commands) {
		const commandName = formatCommandName(config, cmd);
		// Avoid double-registering when two roots emit the same flattened name.
		if (seen.has(commandName)) continue;
		seen.add(commandName);

		const label = formatLabel(config, cmd);
		const content = cmd.content;

		pi.registerCommand(commandName, {
			description: label,
			handler: async (args, _ctx) => {
				const interpolated = interpolateArgs(content, args || "");
				pi.sendUserMessage(interpolated);
			},
		});
	}

	return { config, commands };
}
