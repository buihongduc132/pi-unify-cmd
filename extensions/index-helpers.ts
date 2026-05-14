/**
 * pi-unify-cmd — pure helper functions (testable without ExtensionAPI)
 */

import type { UnifyCmdConfig, ExternalCommand } from "./types";

// ─── Argument interpolation ───────────────────────────────────────

/**
 * Normalize agent-specific argument placeholders to pi's $@/$1/$2 format.
 * Handles: $ARGUMENTS (Claude), {{args}} (Gemini), $1/$@ (Codex/Pi)
 */
export function interpolateArgs(template: string, args: string): string {
	if (!args) {
		return template
			.replace(/\$ARGUMENTS/g, "")
			.replace(/\$@/g, "")
			.replace(/\$\d+/g, "")
			.replace(/\$\{@:\d+(?::\d+)?\}/g, "")
			.replace(/\{\{args\}\}/g, "");
	}

	const parts = args.split(/\s+/);

	return template
		.replace(/\$ARGUMENTS/g, args)
		.replace(/\{\{args\}\}/g, args)
		.replace(/\$\{@:(\d+)(?::(\d+))?\}/g, (_match, start, len) => {
			const s = parseInt(start) - 1;
			if (s < 0) return args;
			if (len) return parts.slice(s, s + parseInt(len)).join(" ");
			return parts.slice(s).join(" ");
		})
		.replace(/\$@/g, args)
		.replace(/\$(\d+)/g, (_match, n) => parts[parseInt(n) - 1] || "");
}

// ─── Label / name formatting ─────────────────────────────────────

export function formatLabel(config: UnifyCmdConfig, cmd: ExternalCommand): string {
	const scopeLabel = cmd.source.scope === "global" ? "G" : "L";
	return config.labelFormat
		.replace("{scope}", scopeLabel)
		.replace("{agent}", cmd.source.agent)
		.replace("{name}", cmd.name)
		.replace("{description}", cmd.description || "no description");
}

export function formatCommandName(config: UnifyCmdConfig, cmd: ExternalCommand): string {
	return config.prefixFormat
		.replace("{agent}", cmd.source.agent)
		.replace("{name}", cmd.name);
}
