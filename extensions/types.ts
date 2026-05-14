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
	/** Absolute or ~-relative path to global commands dir */
	globalDir?: string | null;
	/** Relative path from project root to project-level commands dir */
	projectDir?: string | null;
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
		},
		opencode: {
			enabled: true,
			globalDir: "~/.config/opencode/commands",
			projectDir: ".opencode/commands",
		},
		codex: {
			enabled: true,
			globalDir: "~/.codex/prompts",
			projectDir: null,
		},
		gemini: {
			enabled: true,
			globalDir: "~/.gemini/commands",
			projectDir: null,
		},
	},
	custom: [],
	labelFormat: "[{scope}] ({agent}) | {description}",
	prefixFormat: "{agent}:{name}",
};
