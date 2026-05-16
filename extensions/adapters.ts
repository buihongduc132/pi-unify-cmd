/**
 * pi-unify-cmd — adapter pattern implementations
 *
 * Each adapter knows how to scan a directory and parse its command file format.
 * All adapters implement the CommandAdapter interface.
 */

import {
	readdirSync,
	readFileSync,
	existsSync,
	type Dirent,
} from "node:fs";
import { join, extname, basename, relative, dirname, sep } from "node:path";
import type { ExternalCommand } from "./types";

// ─── Adapter Interface ────────────────────────────────────────────

export interface ScanOptions {
	/** Recurse into subdirectories. Default false. */
	recursive?: boolean;
	/** Separator used to flatten nested paths into command names. Default "__". */
	nameSeparator?: string;
}

export interface CommandAdapter {
	readonly agentName: string;
	scan(
		dir: string,
		scope: "global" | "project",
		options?: ScanOptions,
	): ExternalCommand[];
}

// ─── Shared Parsers ───────────────────────────────────────────────

/** Parse YAML frontmatter from markdown content */
export function parseYamlFrontmatter(raw: string): {
	frontmatter: Record<string, string>;
	body: string;
} {
	const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);
	if (!match) return { frontmatter: {}, body: raw };

	const fm: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const idx = line.indexOf(":");
		if (idx > 0) {
			const key = line.slice(0, idx).trim();
			const val = line
				.slice(idx + 1)
				.trim()
				.replace(/^["']|["']$/g, "");
			fm[key] = val;
		}
	}

	return { frontmatter: fm, body: match[2] };
}

/** Parse minimal TOML (Gemini command format) */
export function parseGeminiToml(raw: string): {
	description?: string;
	prompt?: string;
} {
	const descMatch = raw.match(/^description\s*=\s*"([^"]*)"/m);
	const promptMatch = raw.match(/^prompt\s*=\s*"([\s\S]*?)(?:"\n|$)/m);
	return {
		description: descMatch?.[1],
		prompt: promptMatch?.[1],
	};
}

// ─── Directory Scanner ────────────────────────────────────────────

/**
 * Compute the flat command name for a file discovered during scanning.
 *
 * For top-level files this is just the basename without extension. For
 * nested files (when recursive scan is enabled), the relative path from
 * the scan root is joined by `separator`.
 *
 * `bkfw/pr-resolve.md` (root: `~/.opencode/commands`, sep: `__`) →
 * `bkfw__pr-resolve`.
 */
function commandNameFromPath(
	root: string,
	filePath: string,
	separator: string,
): string {
	const rel = relative(root, filePath);
	const ext = extname(rel);
	const noExt = rel.slice(0, rel.length - ext.length);
	if (!noExt.includes(sep)) return noExt;
	return noExt.split(sep).join(separator);
}

function scanDir(
	root: string,
	agent: string,
	scope: "global" | "project",
	fileExts: string[],
	options: ScanOptions = {},
): ExternalCommand[] {
	if (!existsSync(root)) return [];

	const { recursive = false, nameSeparator = "__" } = options;
	const commands: ExternalCommand[] = [];

	const walk = (dir: string) => {
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
		} catch {
			return;
		}

		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (recursive) walk(full);
				continue;
			}
			if (!entry.isFile()) continue;
			const ext = extname(entry.name);
			if (!fileExts.includes(ext)) continue;

			const content = readFileSync(full, "utf-8");
			const name = recursive
				? commandNameFromPath(root, full, nameSeparator)
				: basename(entry.name, ext);

			commands.push({
				name,
				content,
				source: { agent, scope, filePath: full },
				description: undefined,
				argumentHint: undefined,
			});
		}
	};

	walk(root);
	return commands;
}

// ─── Base YAML Frontmatter Adapter ────────────────────────────────
// Shared by Claude, OpenCode, Codex (and Pi-native)
// All use identical YAML frontmatter + markdown body

abstract class YamlFrontmatterAdapter implements CommandAdapter {
	abstract readonly agentName: string;

	scan(
		dir: string,
		scope: "global" | "project",
		options?: ScanOptions,
	): ExternalCommand[] {
		const raw = scanDir(dir, this.agentName, scope, [".md"], options);
		return raw.map((cmd) => {
			const { frontmatter, body } = parseYamlFrontmatter(cmd.content);
			return {
				...cmd,
				description: frontmatter.description,
				argumentHint: frontmatter["argument-hint"],
				content: body.trim(),
			};
		});
	}
}

// ─── Claude Adapter ───────────────────────────────────────────────

export class ClaudeAdapter extends YamlFrontmatterAdapter {
	readonly agentName = "claude";
}

// ─── OpenCode Adapter ─────────────────────────────────────────────

export class OpenCodeAdapter extends YamlFrontmatterAdapter {
	readonly agentName = "opencode";
}

// ─── Codex Adapter ────────────────────────────────────────────────

export class CodexAdapter extends YamlFrontmatterAdapter {
	readonly agentName = "codex";
}

// ─── Gemini Adapter ───────────────────────────────────────────────
// Handles both .md (YAML frontmatter) and .toml (Gemini's native format)

export class GeminiAdapter implements CommandAdapter {
	readonly agentName = "gemini";

	scan(
		dir: string,
		scope: "global" | "project",
		options?: ScanOptions,
	): ExternalCommand[] {
		const raw = scanDir(dir, this.agentName, scope, [".md", ".toml"], options);
		return raw.map((cmd) => {
			const ext = extname(cmd.source.filePath);

			if (ext === ".toml") {
				const parsed = parseGeminiToml(cmd.content);
				return {
					...cmd,
					description: parsed.description,
					content: parsed.prompt || cmd.content,
				};
			}

			// .md → YAML frontmatter
			const { frontmatter, body } = parseYamlFrontmatter(cmd.content);
			return {
				...cmd,
				description: frontmatter.description,
				argumentHint: frontmatter["argument-hint"],
				content: body.trim(),
			};
		});
	}
}

// ─── Custom Adapter ───────────────────────────────────────────────
// User-defined source with configurable format

export class CustomAdapter implements CommandAdapter {
	constructor(
		readonly agentName: string,
		private readonly format: "yaml-frontmatter" | "gemini-toml" | "raw",
	) {}

	scan(
		dir: string,
		scope: "global" | "project",
		options?: ScanOptions,
	): ExternalCommand[] {
		const exts =
			this.format === "gemini-toml" ? [".toml"] : [".md"];
		const raw = scanDir(dir, this.agentName, scope, exts, options);

		return raw.map((cmd) => {
			if (this.format === "gemini-toml") {
				const parsed = parseGeminiToml(cmd.content);
				return {
					...cmd,
					description: parsed.description,
					content: parsed.prompt || cmd.content,
				};
			}

			if (this.format === "yaml-frontmatter") {
				const { frontmatter, body } = parseYamlFrontmatter(cmd.content);
				return {
					...cmd,
					description: frontmatter.description,
					argumentHint: frontmatter["argument-hint"],
					content: body.trim(),
				};
			}

			// raw: filename is description, full content is body. For recursive
			// scans the description is the flat name, not the basename, so the
			// user can still distinguish.
			return {
				...cmd,
				description: cmd.name,
				content: cmd.content.trim(),
			};
		});
	}
}

// ─── Built-in registry ────────────────────────────────────────────

export const BUILTIN_ADAPTERS: Record<string, () => CommandAdapter> = {
	claude: () => new ClaudeAdapter(),
	opencode: () => new OpenCodeAdapter(),
	codex: () => new CodexAdapter(),
	gemini: () => new GeminiAdapter(),
};
