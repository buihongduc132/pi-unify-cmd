/**
 * pi-unify-cmd — symlink mirror module
 *
 * Mirrors discovered OpenCode commands as symlinks into pi's native prompts
 * directory so pi's engine surfaces them as first-class slash commands.
 */

import {
	symlinkSync,
	unlinkSync,
	lstatSync,
	readlinkSync,
	mkdirSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import type { ExternalCommand } from "./types";

// ─── Types ────────────────────────────────────────────────────────

export interface MirrorEntry {
	name: string;
	linkPath: string;
	sourcePath: string;
	reason?: string;
}

export interface MirrorResult {
	created: MirrorEntry[];
	reused: MirrorEntry[];
	replaced: MirrorEntry[];
	skipped: MirrorEntry[];
	broken: MirrorEntry[];
}

export interface MirrorOptions {
	agentDir: string;
	cwd: string;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Mirror discovered commands as symlinks into pi's prompts directory.
 *
 * Global commands → <agentDir>/prompts/<name>.md
 * Project commands → <cwd>/.pi/prompts/<name>.md
 *
 * Idempotent: reuses correct symlinks, replaces stale ones, skips real files.
 * Never throws — errors are caught and recorded in the `broken` array.
 */
export function mirrorCommands(
	commands: ExternalCommand[],
	opts: MirrorOptions,
): MirrorResult {
	const result: MirrorResult = {
		created: [],
		reused: [],
		replaced: [],
		skipped: [],
		broken: [],
	};

	for (const cmd of commands) {
		try {
			const sourcePath = cmd.source.filePath;
			const linkPath = computeLinkPath(cmd, opts);
			const entry: MirrorEntry = {
				name: cmd.name,
				linkPath,
				sourcePath,
			};

			// Compute relative target path (survives project moves)
			const relativeTarget = relative(dirname(linkPath), sourcePath);

			// Ensure parent directory exists
			const parentDir = dirname(linkPath);
			try {
				mkdirSync(parentDir, { recursive: true });
			} catch (err: unknown) {
				entry.reason = (err as NodeJS.ErrnoException).code || "MKDIR_FAILED";
				result.skipped.push(entry);
				continue;
			}

			// Check if link already exists
			let lstat;
			try {
				lstat = lstatSync(linkPath);
			} catch {
				// Does not exist — create it
				try {
					symlinkSync(relativeTarget, linkPath);
					result.created.push(entry);
				} catch (err: unknown) {
					entry.reason = (err as NodeJS.ErrnoException).code || "SYMLINK_FAILED";
					result.broken.push(entry);
				}
				continue;
			}

			// Exists — check if it's a symlink
			if (!lstat.isSymbolicLink()) {
				// Real file/directory — skip (never overwrite)
				entry.reason = "real-file-exists";
				result.skipped.push(entry);
				continue;
			}

			// It's a symlink — check if it points to the right target
			let currentTarget;
			try {
				currentTarget = readlinkSync(linkPath);
			} catch (err: unknown) {
				entry.reason = (err as NodeJS.ErrnoException).code || "READLINK_FAILED";
				result.broken.push(entry);
				continue;
			}

			if (currentTarget === relativeTarget) {
				// Correct symlink — reuse
				result.reused.push(entry);
			} else {
				// Stale symlink — replace
				try {
					unlinkSync(linkPath);
					symlinkSync(relativeTarget, linkPath);
					result.replaced.push(entry);
				} catch (err: unknown) {
					entry.reason = (err as NodeJS.ErrnoException).code || "REPLACE_FAILED";
					result.broken.push(entry);
				}
			}
		} catch (err: unknown) {
			// Catch-all for any unexpected error
			const entry: MirrorEntry = {
				name: cmd.name,
				linkPath: "",
				sourcePath: cmd.source.filePath,
				reason: (err as NodeJS.ErrnoException).code || "UNKNOWN_ERROR",
			};
			result.broken.push(entry);
		}
	}

	return result;
}

/**
 * Remove symlinks created by this extension (those resolving to a known
 * opencode command path). Idempotent; skips real files.
 */
export function unmirrorCommands(
	commands: ExternalCommand[],
	opts: MirrorOptions,
): { removed: number; skipped: number } {
	let removed = 0;
	let skipped = 0;

	for (const cmd of commands) {
		try {
			const linkPath = computeLinkPath(cmd, opts);
			let lstat;
			try {
				lstat = lstatSync(linkPath);
			} catch {
				// Does not exist — skip
				skipped++;
				continue;
			}

			if (!lstat.isSymbolicLink()) {
				// Real file — skip (never delete)
				skipped++;
				continue;
			}

			// It's a symlink — verify it points to the expected source
			let currentTarget;
			try {
				currentTarget = readlinkSync(linkPath);
			} catch {
				// Broken symlink — remove it
				try {
					unlinkSync(linkPath);
					removed++;
				} catch {
					skipped++;
				}
				continue;
			}

			const sourcePath = cmd.source.filePath;
			const expectedTarget = relative(dirname(linkPath), sourcePath);

			if (currentTarget === expectedTarget) {
				// Correct symlink — remove it
				try {
					unlinkSync(linkPath);
					removed++;
				} catch {
					skipped++;
				}
			} else {
				// Stale symlink pointing elsewhere — skip (not ours)
				skipped++;
			}
		} catch {
			skipped++;
		}
	}

	return { removed, skipped };
}

// ─── Helpers ──────────────────────────────────────────────────────

function computeLinkPath(cmd: ExternalCommand, opts: MirrorOptions): string {
	if (cmd.source.scope === "global") {
		return join(opts.agentDir, "prompts", `${cmd.name}.md`);
	} else {
		return join(opts.cwd, ".pi", "prompts", `${cmd.name}.md`);
	}
}
