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
import { join, resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { BUILTIN_ADAPTERS, CustomAdapter } from "./adapters";
import { loadConfig, resolveHome } from "./config";
import { interpolateArgs, formatLabel, formatCommandName } from "./index-helpers";
import type { UnifyCmdConfig, ExternalCommand } from "./types";

// ─── Discovery ────────────────────────────────────────────────────

function discoverCommands(
	config: UnifyCmdConfig,
	cwd: string,
): ExternalCommand[] {
	const commands: ExternalCommand[] = [];

	// Built-in agents
	for (const [agentName, adapterConfig] of Object.entries(config.agents)) {
		if (!adapterConfig.enabled) continue;

		const factory = BUILTIN_ADAPTERS[agentName];
		if (!factory) continue;
		const adapter = factory();

		if (adapterConfig.globalDir) {
			const dir = resolveHome(adapterConfig.globalDir);
			commands.push(...adapter.scan(dir, "global"));
		}

		if (adapterConfig.projectDir && cwd) {
			const dir = resolve(join(cwd, adapterConfig.projectDir));
			commands.push(...adapter.scan(dir, "project"));
		}
	}

	// Custom adapters
	for (const customConfig of config.custom) {
		if (!customConfig.enabled) continue;

		const adapter = new CustomAdapter(customConfig.name, customConfig.format);

		if (customConfig.globalDir) {
			const dir = resolveHome(customConfig.globalDir);
			commands.push(...adapter.scan(dir, "global"));
		}

		if (customConfig.projectDir && cwd) {
			const dir = resolve(join(cwd, customConfig.projectDir));
			commands.push(...adapter.scan(dir, "project"));
		}
	}

	return commands;
}

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
				if (cfg.globalDir) {
					const dir = resolveHome(cfg.globalDir);
					const exists = existsSync(dir);
					lines.push(`  ${name}: ${dir} ${exists ? "✓" : "✗ (not found)"}`);
				}
				if (cfg.projectDir) {
					const dir = resolve(join(cwd, cfg.projectDir));
					const exists = existsSync(dir);
					lines.push(`  ${name} (project): ${dir} ${exists ? "✓" : "✗"}`);
				}
			}

			for (const custom of state.config.custom) {
				if (!custom.enabled) continue;
				if (custom.globalDir) {
					const dir = resolveHome(custom.globalDir);
					const exists = existsSync(dir);
					lines.push(
						`  ${custom.name} (custom, ${custom.format}): ${dir} ${exists ? "✓" : "✗"}`,
					);
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
				lines.push(
					`  ${name}: ${cfg.enabled ? "ON" : "OFF"} — global: ${cfg.globalDir || "none"}, project: ${cfg.projectDir || "none"}`,
				);
			}
			if (state.config.custom.length > 0) {
				lines.push("Custom sources:");
				for (const c of state.config.custom) {
					lines.push(
						`  ${c.name} (${c.format}): ${c.enabled ? "ON" : "OFF"} — ${c.globalDir || "none"}`,
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

	for (const cmd of commands) {
		const commandName = formatCommandName(config, cmd);
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
