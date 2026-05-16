/**
 * Tests for recursive directory scanning and nested name flattening.
 *
 * Modern opencode/claude/codex/gemini setups organize commands in subdirs
 * (e.g. `bkfw/pr-resolve.md`, `ralph-init/00-config.md`). These should be
 * discoverable as flat pi command names using a configurable separator.
 */

import { describe, expect, it } from "vitest";
import {
	ClaudeAdapter,
	OpenCodeAdapter,
	CodexAdapter,
	GeminiAdapter,
	CustomAdapter,
} from "./adapters";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeTmpDir(): string {
	const dir = join(
		tmpdir(),
		`pi-unify-cmd-recursive-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function cleanup(dir: string) {
	rmSync(dir, { recursive: true, force: true });
}

function write(dir: string, rel: string, content: string) {
	const full = join(dir, rel);
	mkdirSync(join(full, ".."), { recursive: true });
	writeFileSync(full, content);
}

const fm = (desc: string, body = "body") =>
	`---\ndescription: ${desc}\n---\n${body}`;

// ─── recursive opt-in via scan options ────────────────────────────

describe("scan with { recursive: true }", () => {
	it("ClaudeAdapter recursively finds nested .md files", () => {
		const dir = makeTmpDir();
		write(dir, "top.md", fm("top-level"));
		write(dir, "sub/nested.md", fm("nested-one"));
		write(dir, "a/b/deep.md", fm("deep-three"));

		const adapter = new ClaudeAdapter();
		const cmds = adapter.scan(dir, "global", { recursive: true });

		const names = cmds.map((c) => c.name).sort();
		expect(names).toEqual(["a__b__deep", "sub__nested", "top"]);

		cleanup(dir);
	});

	it("OpenCodeAdapter recursive scan flattens with default separator __", () => {
		const dir = makeTmpDir();
		write(dir, "bkfw/pr-resolve.md", fm("bkfw cmd"));
		write(dir, "ralph-init/00-config.md", fm("ralph cfg"));
		write(dir, "ralph-init/10-init.md", fm("ralph init"));

		const adapter = new OpenCodeAdapter();
		const cmds = adapter.scan(dir, "global", { recursive: true });

		const byName = Object.fromEntries(cmds.map((c) => [c.name, c]));
		expect(byName["bkfw__pr-resolve"]).toBeDefined();
		expect(byName["bkfw__pr-resolve"].description).toBe("bkfw cmd");
		expect(byName["ralph-init__00-config"]).toBeDefined();
		expect(byName["ralph-init__10-init"]).toBeDefined();
		expect(cmds).toHaveLength(3);

		cleanup(dir);
	});

	it("custom nameSeparator is honored", () => {
		const dir = makeTmpDir();
		write(dir, "ns/cmd.md", fm("x"));

		const adapter = new OpenCodeAdapter();
		const cmds = adapter.scan(dir, "global", {
			recursive: true,
			nameSeparator: ".",
		});

		expect(cmds).toHaveLength(1);
		expect(cmds[0].name).toBe("ns.cmd");

		cleanup(dir);
	});

	it("preserves filePath provenance pointing to the original location", () => {
		const dir = makeTmpDir();
		write(dir, "sub/nested.md", fm("d"));

		const adapter = new ClaudeAdapter();
		const cmds = adapter.scan(dir, "global", { recursive: true });

		expect(cmds[0].source.filePath).toBe(join(dir, "sub", "nested.md"));

		cleanup(dir);
	});

	it("CodexAdapter recursive scan works", () => {
		const dir = makeTmpDir();
		write(dir, "ops/restart.md", fm("restart"));

		const cmds = new CodexAdapter().scan(dir, "global", { recursive: true });
		expect(cmds.map((c) => c.name)).toEqual(["ops__restart"]);

		cleanup(dir);
	});

	it("GeminiAdapter recursive scan handles both .md and .toml in nested dirs", () => {
		const dir = makeTmpDir();
		write(dir, "sub/a.md", fm("md cmd"));
		write(
			dir,
			"sub/b.toml",
			'description = "toml cmd"\nprompt = "do it"',
		);

		const cmds = new GeminiAdapter().scan(dir, "global", { recursive: true });
		const names = cmds.map((c) => c.name).sort();
		expect(names).toEqual(["sub__a", "sub__b"]);

		cleanup(dir);
	});

	it("CustomAdapter recursive scan flattens nested raw files", () => {
		const dir = makeTmpDir();
		write(dir, "x/y/leaf.md", "raw body");

		const adapter = new CustomAdapter("mine", "raw");
		const cmds = adapter.scan(dir, "global", { recursive: true });

		expect(cmds).toHaveLength(1);
		expect(cmds[0].name).toBe("x__y__leaf");
		expect(cmds[0].content).toBe("raw body");

		cleanup(dir);
	});
});

// ─── back-compat: default behavior unchanged ──────────────────────

describe("scan back-compat (no options)", () => {
	it("does NOT recurse by default — nested files are skipped", () => {
		const dir = makeTmpDir();
		write(dir, "top.md", fm("top"));
		write(dir, "sub/nested.md", fm("nested"));

		const cmds = new ClaudeAdapter().scan(dir, "global");
		expect(cmds).toHaveLength(1);
		expect(cmds[0].name).toBe("top");

		cleanup(dir);
	});

	it("does NOT recurse when recursive=false explicitly", () => {
		const dir = makeTmpDir();
		write(dir, "top.md", fm("top"));
		write(dir, "sub/nested.md", fm("nested"));

		const cmds = new ClaudeAdapter().scan(dir, "global", {
			recursive: false,
		});
		expect(cmds).toHaveLength(1);

		cleanup(dir);
	});
});

// ─── edge cases ───────────────────────────────────────────────────

describe("recursive scan edge cases", () => {
	it("returns [] for non-existent dir even with recursive=true", () => {
		const cmds = new ClaudeAdapter().scan("/nope/xyz", "global", {
			recursive: true,
		});
		expect(cmds).toEqual([]);
	});

	it("handles deeply nested empty dirs", () => {
		const dir = makeTmpDir();
		mkdirSync(join(dir, "a", "b", "c"), { recursive: true });

		const cmds = new ClaudeAdapter().scan(dir, "global", { recursive: true });
		expect(cmds).toEqual([]);

		cleanup(dir);
	});

	it("ignores non-target extensions during recursion", () => {
		const dir = makeTmpDir();
		write(dir, "sub/keeper.md", fm("k"));
		write(dir, "sub/skip.txt", "irrelevant");
		write(dir, "sub/notes.json", "{}");

		const cmds = new ClaudeAdapter().scan(dir, "global", { recursive: true });
		expect(cmds).toHaveLength(1);
		expect(cmds[0].name).toBe("sub__keeper");

		cleanup(dir);
	});
});
