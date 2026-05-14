/**
 * pi-unify-cmd — config loader
 *
 * Config locations:
 *   Global:   ~/.pi/agent/unify-cmd.json
 *   Project:  .unify-cmd.json
 *
 * Project config deep-merges over global.
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { UnifyCmdConfig, AdapterConfig, CustomAdapterConfig } from "./types";
import { DEFAULT_CONFIG } from "./types";

// ─── Path helpers ─────────────────────────────────────────────────

export function resolveHome(p: string): string {
	return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

// ─── Deep merge ───────────────────────────────────────────────────

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
	const out = { ...target };
	for (const key of Object.keys(source)) {
		const sv = source[key];
		const tv = out[key];
		if (
			tv && sv &&
			typeof tv === "object" && typeof sv === "object" &&
			!Array.isArray(tv) && !Array.isArray(sv)
		) {
			out[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
		} else {
			out[key] = sv;
		}
	}
	return out;
}

// ─── Config loading ───────────────────────────────────────────────

export function loadConfig(cwd?: string): UnifyCmdConfig {
	const globalPath = join(homedir(), ".pi", "agent", "unify-cmd.json");
	const projectPath = cwd ? join(cwd, ".unify-cmd.json") : null;

	let config = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>;

	if (existsSync(globalPath)) {
		try {
			const raw = JSON.parse(readFileSync(globalPath, "utf-8"));
			config = deepMerge(config, raw);
		} catch {
			// malformed config — use defaults
		}
	}

	if (projectPath && existsSync(projectPath)) {
		try {
			const raw = JSON.parse(readFileSync(projectPath, "utf-8"));
			config = deepMerge(config, raw);
		} catch {
			// malformed project config — ignore
		}
	}

	return config as unknown as UnifyCmdConfig;
}

// ─── Default config writer ────────────────────────────────────────

export function getDefaultConfig(): string {
	return JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n";
}
