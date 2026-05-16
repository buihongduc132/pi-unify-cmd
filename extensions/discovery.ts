/**
 * pi-unify-cmd — discovery layer
 *
 * Walks every configured global/project dir for every enabled adapter,
 * de-duplicates overlapping paths, and returns the merged ExternalCommand
 * list. Extracted from index.ts so it can be unit-tested without spinning up
 * a pi extension context.
 */

import { join, resolve, normalize } from "node:path";
import {
	BUILTIN_ADAPTERS,
	CustomAdapter,
	type CommandAdapter,
	type ScanOptions,
} from "./adapters";
import { resolveHome } from "./config";
import type {
	AdapterConfig,
	CustomAdapterConfig,
	ExternalCommand,
	UnifyCmdConfig,
} from "./types";

/**
 * Normalize a path so dedupe via Set catches equivalent variants
 * (trailing slashes, `./`, double slashes). Home expansion happens upstream.
 */
function canonical(p: string): string {
	return resolve(normalize(p));
}

/**
 * Collapse `globalDir` + `globalDirs[]` into a single de-duplicated, home-
 * resolved list of absolute paths.
 */
function resolveGlobalRoots(cfg: AdapterConfig): string[] {
	const out: string[] = [];
	if (cfg.globalDir) out.push(canonical(resolveHome(cfg.globalDir)));
	if (cfg.globalDirs) {
		for (const d of cfg.globalDirs) {
			if (d) out.push(canonical(resolveHome(d)));
		}
	}
	return Array.from(new Set(out));
}

/**
 * Collapse `projectDir` + `projectDirs[]` into a single de-duplicated list of
 * absolute paths, resolved against `cwd`. Returns `[]` when `cwd` is empty.
 */
function resolveProjectRoots(cfg: AdapterConfig, cwd: string): string[] {
	if (!cwd) return [];
	const out: string[] = [];
	if (cfg.projectDir) out.push(canonical(join(cwd, cfg.projectDir)));
	if (cfg.projectDirs) {
		for (const d of cfg.projectDirs) {
			if (d) out.push(canonical(join(cwd, d)));
		}
	}
	return Array.from(new Set(out));
}

function scanOpts(cfg: AdapterConfig): ScanOptions {
	return {
		recursive: cfg.recursive ?? false,
		nameSeparator: cfg.nameSeparator ?? "__",
	};
}

function scanAll(
	adapter: CommandAdapter,
	cfg: AdapterConfig,
	cwd: string,
): ExternalCommand[] {
	const opts = scanOpts(cfg);
	const commands: ExternalCommand[] = [];
	for (const dir of resolveGlobalRoots(cfg)) {
		commands.push(...adapter.scan(dir, "global", opts));
	}
	for (const dir of resolveProjectRoots(cfg, cwd)) {
		commands.push(...adapter.scan(dir, "project", opts));
	}
	return commands;
}

/**
 * Walk every enabled built-in agent and every custom adapter, collecting
 * normalized ExternalCommand objects. Pure function — no side effects.
 */
export function discoverCommands(
	config: UnifyCmdConfig,
	cwd: string,
): ExternalCommand[] {
	const commands: ExternalCommand[] = [];

	for (const [agentName, cfg] of Object.entries(config.agents)) {
		if (!cfg.enabled) continue;
		const factory = BUILTIN_ADAPTERS[agentName];
		if (!factory) continue;
		commands.push(...scanAll(factory(), cfg, cwd));
	}

	for (const cfg of config.custom) {
		if (!cfg.enabled) continue;
		const adapter = new CustomAdapter(cfg.name, cfg.format);
		commands.push(...scanAll(adapter, cfg as CustomAdapterConfig, cwd));
	}

	return commands;
}

/** Public helpers exposed for the `unify-cmd:scan` management command. */
export function listGlobalRoots(cfg: AdapterConfig): string[] {
	return resolveGlobalRoots(cfg);
}

export function listProjectRoots(cfg: AdapterConfig, cwd: string): string[] {
	return resolveProjectRoots(cfg, cwd);
}
