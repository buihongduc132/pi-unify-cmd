/**
 * pi-unify-cmd — load slash commands from other CLI agents into pi
 *
 * Discovers commands from Claude, OpenCode, Codex, Gemini, and custom sources,
 * then registers them as pi slash commands. Uses adapter pattern to handle
 * different file formats (YAML frontmatter, Gemini TOML, raw).
 *
 * OpenCode commands are mirrored as symlinks into pi's native prompts dir so
 * pi's engine surfaces them as first-class slash commands (when mirrorToPrompts
 * is enabled, default for opencode). The legacy `opencode:<name>` registration
 * is suppressed for mirrored commands.
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
 *   /unify-cmd:mirror  — show mirror status / clean / refresh
 *
 * @see types.ts for config schema
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig, resolveHome } from "./config";
import { discoverCommands, listGlobalRoots, listProjectRoots } from "./discovery";
import {
	interpolateArgs,
	formatLabel,
	formatCommandName,
} from "./index-helpers";
import { mirrorCommands, unmirrorCommands } from "./mirror";
import type { UnifyCmdConfig, ExternalCommand } from "./types";
import type { MirrorResult } from "./mirror";

// ─── State ────────────────────────────────────────────────────────

interface PluginState {
	config: UnifyCmdConfig;
	commands: ExternalCommand[];
	mirrorResult: MirrorResult | null;
}

// ─── Extension Entry ──────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const cwd = process.cwd();
	const agentDir = resolveHome("~/.pi/agent");
	let state: PluginState = registerAll(pi, cwd, agentDir);

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
			state = registerAll(pi, cwd, agentDir);
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
				if (cfg.mirrorToPrompts) flags.push("mirror");
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
				const mirror = cfg.mirrorToPrompts ? " [mirror]" : "";
				lines.push(
					`  ${name}: ${cfg.enabled ? "ON" : "OFF"}${mirror} — globals: ${
						globals.length ? globals.join(", ") : "none"
					} — projects: ${projects.length ? projects.join(", ") : "none"}`,
				);
			}
			if (state.config.custom.length > 0) {
				lines.push("Custom sources:");
				for (const c of state.config.custom) {
					const globals = listGlobalRoots(c);
					const projects = listProjectRoots(c, cwd);
					lines.push(
						`  ${c.name} (${c.format}): ${c.enabled ? "ON" : "OFF"} — globals: ${
							globals.length ? globals.join(", ") : "none"
						} — projects: ${projects.length ? projects.join(", ") : "none"}`,
					);
				}
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("unify-cmd:mirror", {
		description: "Show mirror status, clean symlinks, or refresh mirror",
		handler: async (args, ctx) => {
			const argStr = (args || "").trim();

			if (argStr === "--clean") {
				if (!state.mirrorResult) {
					ctx.ui.notify(
						"No mirror run yet this session — run /unify-cmd:reload first.",
						"warning",
					);
					return;
				}
				const opencodeCmds = state.commands.filter(
					(cmd) =>
						cmd.source.agent === "opencode" &&
						(state.config.agents.opencode?.mirrorToPrompts ?? false),
				);
				const { removed, skipped } = unmirrorCommands(opencodeCmds, {
					agentDir,
					cwd,
				});
				ctx.ui.notify(
					`Mirror clean: ${removed} symlink(s) removed, ${skipped} skipped.`,
					"info",
				);
				return;
			}

			if (argStr === "--refresh") {
				state = registerAll(pi, cwd, agentDir);
				formatMirrorResult(state.mirrorResult, ctx);
				return;
			}

			// Default: show status
			formatMirrorResult(state.mirrorResult, ctx);
		},
	});
}

// ─── Helpers ──────────────────────────────────────────────────────

function formatMirrorResult(
	mirrorResult: MirrorResult | null,
	ctx: { ui: { notify: (msg: string, type?: "error" | "info" | "warning") => void } },
): void {
	if (!mirrorResult) {
		ctx.ui.notify(
			"No mirror run yet this session — run /unify-cmd:reload first.",
			"warning",
		);
		return;
	}

	const { created, reused, replaced, skipped, broken } = mirrorResult;
	const summary = [
		`${created.length} created`,
		`${reused.length} reused`,
		`${replaced.length} replaced`,
		`${skipped.length} skipped`,
		`${broken.length} broken`,
	].join(", ");

	ctx.ui.notify(`Mirror status: ${summary}`, "info");
}

// ─── Registration ─────────────────────────────────────────────────

function registerAll(
	pi: ExtensionAPI,
	cwd: string,
	agentDir: string,
): PluginState {
	const config = loadConfig(cwd);
	const discovered = discoverCommands(config, cwd);

	// Partition opencode commands: mirror vs legacy
	const opencodeMirrorEnabled =
		config.agents.opencode?.mirrorToPrompts ?? false;
	const opencodeCmds = discovered.filter(
		(cmd) => cmd.source.agent === "opencode" && opencodeMirrorEnabled,
	);

	let mirrorResult: MirrorResult | null = null;
	const mirroredNames = new Set<string>();

	if (opencodeMirrorEnabled && opencodeCmds.length > 0) {
		try {
			mirrorResult = mirrorCommands(opencodeCmds, { agentDir, cwd });
			// Collect successfully mirrored command names
			for (const entry of [
				...mirrorResult.created,
				...mirrorResult.reused,
				...mirrorResult.replaced,
			]) {
				mirroredNames.add(entry.name);
			}
		} catch {
			// Mirror failed entirely — fall back to legacy registration
			mirrorResult = null;
		}
	}

	const seen = new Set<string>();
	const registered: ExternalCommand[] = [];
	for (const cmd of discovered) {
		const commandName = formatCommandName(config, cmd);
		// Avoid double-registering when two roots emit the same flattened name.
		if (seen.has(commandName)) continue;
		seen.add(commandName);

		// Suppress legacy registration for mirrored opencode commands
		if (cmd.source.agent === "opencode" && mirroredNames.has(cmd.name)) {
			// Mirrored — pi's engine owns display; do NOT register
			registered.push(cmd);
			continue;
		}

		registered.push(cmd);

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

	// Expose only what was actually registered so list/count match runtime state.
	return { config, commands: registered, mirrorResult };
}
