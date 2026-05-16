/**
 * pi-unify-cmd — shared types
 */

/** A normalized command discovered from an external CLI agent */
export interface ExternalCommand {
	/** Command name derived from filename (no extension) */
	name: string;
	/** Description from frontmatter */
	description?: string;
	/** Argument hint from frontmatter */
	argumentHint?: string;
	/** Body content (after frontmatter stripped) */
	content: string;
	/** Provenance info */
	source: CommandSource;
}

export interface CommandSource {
	/** Agent name: "claude" | "opencode" | "codex" | "gemini" | custom */
	agent: string;
	/** Where it was found */
	scope: "global" | "project";
	/** Absolute path to original file */
	filePath: string;
}

/** Per-agent adapter config */
export interface AdapterConfig {
	enabled: boolean;
	/** Absolute or ~-relative path to a single global commands dir (back-compat). */
	globalDir?: string | null;
	/**
	 * Multiple global command roots. Combined with `globalDir` and de-duped at
	 * discovery time. Use this when an agent has more than one canonical
	 * location (e.g. opencode profile dirs).
	 */
	globalDirs?: string[] | null;
	/** Relative path from project root to a single project-level commands dir. */
	projectDir?: string | null;
	/** Multiple project-level command roots (relative to cwd). */
	projectDirs?: string[] | null;
	/**
	 * If true, scan subdirectories recursively and flatten nested names using
	 * `nameSeparator`. Default: false for unspecified agents.
	 */
	recursive?: boolean;
	/**
	 * Separator used to flatten nested subdir paths into the pi command name.
	 * Default: "__". Example: `bkfw/pr-resolve.md` → `bkfw__pr-resolve`.
	 */
	nameSeparator?: string;
}

/** Custom user-defined adapter */
export interface CustomAdapterConfig extends AdapterConfig {
	/** Unique name for this custom source */
	name: string;
	/** File format */
	format: "yaml-frontmatter" | "gemini-toml" | "raw";
}

/** Top-level extension config */
export interface UnifyCmdConfig {
	/** Built-in agent adapters */
	agents: Record<string, AdapterConfig>;
	/** User-defined custom adapters */
	custom: CustomAdapterConfig[];
	/** Description format in autocomplete. Tokens: {scope} {agent} {name} {description} */
	labelFormat: string;
	/** Command name format. Tokens: {agent} {name}. Used as filename prefix for registerCommand */
	prefixFormat: string;
}

/** Default config values */
export const DEFAULT_CONFIG: UnifyCmdConfig = {
	agents: {
		claude: {
			enabled: true,
			globalDir: "~/.claude/commands",
			projectDir: ".claude/commands",
			recursive: true,
		},
		opencode: {
			enabled: true,
			// Three known opencode command roots:
			//   - default global              ~/.config/opencode/commands
			//   - historical singular alias   ~/.config/opencode/command
			//   - default profile when running via OPENCODE_CONFIG_DIR wrappers
			globalDirs: [
				"~/.config/opencode/commands",
				"~/.config/opencode/command",
				"~/.config/opencode/profiles/default/commands",
			],
			projectDirs: [".opencode/commands", ".opencode/command"],
			recursive: true,
		},
		codex: {
			enabled: true,
			globalDir: "~/.codex/prompts",
			projectDir: null,
			recursive: true,
		},
		gemini: {
			enabled: true,
			globalDir: "~/.gemini/commands",
			projectDir: null,
			recursive: true,
		},
	},
	custom: [],
	labelFormat: "[{scope}] ({agent}) | {description}",
	prefixFormat: "{agent}:{name}",
};
