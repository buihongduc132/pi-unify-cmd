/**
 * Tests for multi-directory adapter config (globalDirs[], projectDirs[])
 * and the discovery layer that consumes them.
 *
 * Motivation: opencode users often have multiple command roots — e.g.
 *   ~/.config/opencode/commands
 *   ~/.config/opencode/command  (historical)
 *   ~/.config/opencode/profiles/<profile>/commands  (when OPENCODE_CONFIG_DIR is set)
 * The plugin must scan all of them, not just a single configured path.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { discoverCommands } from "./discovery";
import type { UnifyCmdConfig } from "./types";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let root: string;
const fm = (desc: string, body = "x") =>
	`---\ndescription: ${desc}\n---\n${body}`;

function write(rel: string, content: string) {
	const full = join(root, rel);
	mkdirSync(join(full, ".."), { recursive: true });
	writeFileSync(full, content);
}

beforeEach(() => {
	root = join(
		tmpdir(),
		`pi-unify-cmd-multidir-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(root, { recursive: true });
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

const baseConfig: UnifyCmdConfig = {
	agents: {},
	custom: [],
	labelFormat: "[{scope}] ({agent}) {name} | {description}",
	prefixFormat: "{agent}:{name}",
};

describe("discoverCommands — globalDirs[]", () => {
	it("scans every path in globalDirs", () => {
		write("dir-a/alpha.md", fm("alpha cmd"));
		write("dir-b/beta.md", fm("beta cmd"));

		const config: UnifyCmdConfig = {
			...baseConfig,
			agents: {
				opencode: {
					enabled: true,
					globalDirs: [join(root, "dir-a"), join(root, "dir-b")],
				},
			},
		};

		const cmds = discoverCommands(config, root);
		const names = cmds.map((c) => c.name).sort();
		expect(names).toEqual(["alpha", "beta"]);
	});

	it("combines globalDir (singular) and globalDirs (plural) without dropping either", () => {
		write("legacy/legacy-cmd.md", fm("legacy"));
		write("modern/modern-cmd.md", fm("modern"));

		const config: UnifyCmdConfig = {
			...baseConfig,
			agents: {
				opencode: {
					enabled: true,
					globalDir: join(root, "legacy"),
					globalDirs: [join(root, "modern")],
				},
			},
		};

		const cmds = discoverCommands(config, root);
		const names = cmds.map((c) => c.name).sort();
		expect(names).toEqual(["legacy-cmd", "modern-cmd"]);
	});

	it("deduplicates when globalDir equals one of globalDirs[]", () => {
		write("dir/only.md", fm("only one"));

		const config: UnifyCmdConfig = {
			...baseConfig,
			agents: {
				opencode: {
					enabled: true,
					globalDir: join(root, "dir"),
					globalDirs: [join(root, "dir")],
				},
			},
		};

		const cmds = discoverCommands(config, root);
		expect(cmds).toHaveLength(1);
		expect(cmds[0].name).toBe("only");
	});
});

describe("discoverCommands — projectDirs[]", () => {
	it("scans every relative path in projectDirs under cwd", () => {
		write("project/.opencode/commands/p1.md", fm("p1"));
		write("project/.opencode/command/p2.md", fm("p2"));

		const config: UnifyCmdConfig = {
			...baseConfig,
			agents: {
				opencode: {
					enabled: true,
					projectDirs: [".opencode/commands", ".opencode/command"],
				},
			},
		};

		const cmds = discoverCommands(config, join(root, "project"));
		const names = cmds.map((c) => c.name).sort();
		expect(names).toEqual(["p1", "p2"]);
	});

	it("combines projectDir + projectDirs[] under cwd", () => {
		write("proj/.opencode/commands/a.md", fm("a"));
		write("proj/.opencode/command/b.md", fm("b"));

		const config: UnifyCmdConfig = {
			...baseConfig,
			agents: {
				opencode: {
					enabled: true,
					projectDir: ".opencode/commands",
					projectDirs: [".opencode/command"],
				},
			},
		};

		const cmds = discoverCommands(config, join(root, "proj"));
		const names = cmds.map((c) => c.name).sort();
		expect(names).toEqual(["a", "b"]);
	});
});

describe("discoverCommands — per-agent recursive + nameSeparator", () => {
	it("applies recursive flag from agent config to all its dirs", () => {
		write("a/sub/nested.md", fm("nested-a"));
		write("b/top.md", fm("top-b"));

		const config: UnifyCmdConfig = {
			...baseConfig,
			agents: {
				opencode: {
					enabled: true,
					globalDirs: [join(root, "a"), join(root, "b")],
					recursive: true,
				},
			},
		};

		const cmds = discoverCommands(config, root);
		const names = cmds.map((c) => c.name).sort();
		expect(names).toEqual(["sub__nested", "top"]);
	});

	it("applies custom nameSeparator from agent config", () => {
		write("a/sub/x.md", fm("x"));

		const config: UnifyCmdConfig = {
			...baseConfig,
			agents: {
				opencode: {
					enabled: true,
					globalDirs: [join(root, "a")],
					recursive: true,
					nameSeparator: "/",
				},
			},
		};

		const cmds = discoverCommands(config, root);
		expect(cmds[0].name).toBe("sub/x");
	});
});

describe("discoverCommands — custom adapters multi-dir", () => {
	it("custom adapter with globalDirs[] scans all", () => {
		write("c1/u.md", fm("u"));
		write("c2/v.md", fm("v"));

		const config: UnifyCmdConfig = {
			...baseConfig,
			agents: {},
			custom: [
				{
					name: "mine",
					enabled: true,
					format: "yaml-frontmatter",
					globalDirs: [join(root, "c1"), join(root, "c2")],
				},
			],
		};

		const cmds = discoverCommands(config, root);
		const names = cmds.map((c) => c.name).sort();
		expect(names).toEqual(["u", "v"]);
	});
});
