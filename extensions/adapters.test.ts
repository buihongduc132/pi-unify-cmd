import { describe, expect, it } from "vitest";
import {
	parseYamlFrontmatter,
	parseGeminiToml,
	ClaudeAdapter,
	OpenCodeAdapter,
	CodexAdapter,
	GeminiAdapter,
	CustomAdapter,
} from "./adapters";
import type { CommandAdapter } from "./adapters";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─── Helpers ──────────────────────────────────────────────────────

function makeTmpDir(): string {
	const dir = join(tmpdir(), `pi-unify-cmd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function cleanup(dir: string) {
	rmSync(dir, { recursive: true, force: true });
}

// ─── parseYamlFrontmatter ─────────────────────────────────────────

describe("parseYamlFrontmatter", () => {
	it("parses standard YAML frontmatter", () => {
		const raw = `---
description: Review staged changes
argument-hint: "<file>"
---
Review the changes: $1`;

		const { frontmatter, body } = parseYamlFrontmatter(raw);
		expect(frontmatter.description).toBe("Review staged changes");
		expect(frontmatter["argument-hint"]).toBe("<file>");
		expect(body.trim()).toBe("Review the changes: $1");
	});

	it("returns empty frontmatter when no --- delimiters", () => {
		const raw = "Just a plain body\nNo frontmatter";
		const { frontmatter, body } = parseYamlFrontmatter(raw);
		expect(frontmatter).toEqual({});
		expect(body).toBe(raw);
	});

	it("handles quoted values", () => {
		const raw = `---
description: "A quoted description"
---
Body here`;

		const { frontmatter } = parseYamlFrontmatter(raw);
		expect(frontmatter.description).toBe("A quoted description");
	});

	it("handles empty body after frontmatter", () => {
		const raw = `---
description: Empty body
---
`;
		const { frontmatter, body } = parseYamlFrontmatter(raw);
		expect(frontmatter.description).toBe("Empty body");
		expect(body.trim()).toBe("");
	});

	it("handles multiline body with code blocks", () => {
		const raw = `---
description: Has code
---
\`\`\`bash
echo hello
\`\`\``;

		const { body } = parseYamlFrontmatter(raw);
		expect(body).toContain("echo hello");
	});
});

// ─── parseGeminiToml ──────────────────────────────────────────────

describe("parseGeminiToml", () => {
	it("parses description and prompt", () => {
		const raw = `description = "Switch accounts"
prompt = "!{python \\"/some/script.py\\" {{args}}}"`;

		const result = parseGeminiToml(raw);
		expect(result.description).toBe("Switch accounts");
		expect(result.prompt).toContain("python");
	});

	it("returns undefined for missing fields", () => {
		const raw = `other_field = "value"`;
		const result = parseGeminiToml(raw);
		expect(result.description).toBeUndefined();
		expect(result.prompt).toBeUndefined();
	});

	it("handles empty string", () => {
		const result = parseGeminiToml("");
		expect(result.description).toBeUndefined();
	});
});

// ─── ClaudeAdapter ────────────────────────────────────────────────

describe("ClaudeAdapter", () => {
	it("scans .md files with YAML frontmatter", () => {
		const dir = makeTmpDir();
		writeFileSync(join(dir, "review.md"), `---
description: Review staged changes
allowed-tools: Bash(git diff)
argument-hint: "[file]"
---
Review the staged changes: $ARGUMENTS`);

		const adapter: CommandAdapter = new ClaudeAdapter();
		expect(adapter.agentName).toBe("claude");

		const cmds = adapter.scan(dir, "global");
		expect(cmds).toHaveLength(1);
		expect(cmds[0].name).toBe("review");
		expect(cmds[0].description).toBe("Review staged changes");
		expect(cmds[0].argumentHint).toBe("[file]");
		expect(cmds[0].content).toContain("Review the staged changes: $ARGUMENTS");
		expect(cmds[0].source.agent).toBe("claude");
		expect(cmds[0].source.scope).toBe("global");

		cleanup(dir);
	});

	it("ignores non-.md files", () => {
		const dir = makeTmpDir();
		writeFileSync(join(dir, "config.toml"), 'description = "test"');
		writeFileSync(join(dir, "valid.md"), "---\ndescription: ok\n---\nbody");

		const adapter: CommandAdapter = new ClaudeAdapter();
		const cmds = adapter.scan(dir, "project");
		expect(cmds).toHaveLength(1);
		expect(cmds[0].name).toBe("valid");

		cleanup(dir);
	});
});

// ─── OpenCodeAdapter ──────────────────────────────────────────────

describe("OpenCodeAdapter", () => {
	it("parses opencode command format", () => {
		const dir = makeTmpDir();
		writeFileSync(join(dir, "plan.md"), `---
name: plan
description: Plan implementation
---
Plan the following: $ARGUMENTS`);

		const adapter: CommandAdapter = new OpenCodeAdapter();
		expect(adapter.agentName).toBe("opencode");

		const cmds = adapter.scan(dir, "global");
		expect(cmds).toHaveLength(1);
		expect(cmds[0].name).toBe("plan");
		expect(cmds[0].description).toBe("Plan implementation");

		cleanup(dir);
	});
});

// ─── CodexAdapter ─────────────────────────────────────────────────

describe("CodexAdapter", () => {
	it("parses codex prompt format", () => {
		const dir = makeTmpDir();
		writeFileSync(join(dir, "opsx-ff.md"), `---
description: Fast forward
argument-hint: "<change>"
---
Create and fast-forward: $1 $@`);

		const adapter: CommandAdapter = new CodexAdapter();
		expect(adapter.agentName).toBe("codex");

		const cmds = adapter.scan(dir, "global");
		expect(cmds).toHaveLength(1);
		expect(cmds[0].name).toBe("opsx-ff");
		expect(cmds[0].argumentHint).toBe("<change>");

		cleanup(dir);
	});
});

// ─── GeminiAdapter ────────────────────────────────────────────────

describe("GeminiAdapter", () => {
	it("parses .toml files", () => {
		const dir = makeTmpDir();
		writeFileSync(join(dir, "change.toml"), `description = "Switch accounts"
prompt = "!{python \\"/some/script.py\\" {{args}}}"`);

		const adapter: CommandAdapter = new GeminiAdapter();
		expect(adapter.agentName).toBe("gemini");

		const cmds = adapter.scan(dir, "global");
		expect(cmds).toHaveLength(1);
		expect(cmds[0].name).toBe("change");
		expect(cmds[0].description).toBe("Switch accounts");
		expect(cmds[0].content).toContain("python");

		cleanup(dir);
	});

	it("parses .md files alongside .toml", () => {
		const dir = makeTmpDir();
		writeFileSync(join(dir, "change.toml"), `description = "TOML cmd"`);
		writeFileSync(join(dir, "review.md"), `---
description: MD cmd
---
Review stuff`);

		const adapter: CommandAdapter = new GeminiAdapter();
		const cmds = adapter.scan(dir, "global");
		expect(cmds).toHaveLength(2);

		const tomlCmd = cmds.find((c) => c.name === "change");
		const mdCmd = cmds.find((c) => c.name === "review");
		expect(tomlCmd?.description).toBe("TOML cmd");
		expect(mdCmd?.description).toBe("MD cmd");

		cleanup(dir);
	});
});

// ─── CustomAdapter ────────────────────────────────────────────────

describe("CustomAdapter", () => {
	it("parses yaml-frontmatter format", () => {
		const dir = makeTmpDir();
		writeFileSync(join(dir, "custom.md"), `---
description: My custom cmd
---
Do the thing`);

		const adapter: CommandAdapter = new CustomAdapter("mytool", "yaml-frontmatter");
		expect(adapter.agentName).toBe("mytool");

		const cmds = adapter.scan(dir, "global");
		expect(cmds).toHaveLength(1);
		expect(cmds[0].description).toBe("My custom cmd");
		expect(cmds[0].content).toBe("Do the thing");

		cleanup(dir);
	});

	it("parses gemini-toml format", () => {
		const dir = makeTmpDir();
		writeFileSync(join(dir, "run.toml"), `description = "Run something"\nprompt = "do it"`);

		const adapter: CommandAdapter = new CustomAdapter("mytoml", "gemini-toml");
		const cmds = adapter.scan(dir, "global");
		expect(cmds).toHaveLength(1);
		expect(cmds[0].description).toBe("Run something");

		cleanup(dir);
	});

	it("parses raw format — filename as description", () => {
		const dir = makeTmpDir();
		writeFileSync(join(dir, "my-command.md"), `Just some raw content`);

		const adapter: CommandAdapter = new CustomAdapter("rawsrc", "raw");
		const cmds = adapter.scan(dir, "global");
		expect(cmds).toHaveLength(1);
		expect(cmds[0].description).toBe("my-command");
		expect(cmds[0].content).toBe("Just some raw content");

		cleanup(dir);
	});
});

// ─── Edge cases ───────────────────────────────────────────────────

describe("adapter edge cases", () => {
	it("returns empty array for non-existent directory", () => {
		const adapter: CommandAdapter = new ClaudeAdapter();
		const cmds = adapter.scan("/nonexistent/path/xyz", "global");
		expect(cmds).toEqual([]);
	});

	it("skips subdirectories", () => {
		const dir = makeTmpDir();
		mkdirSync(join(dir, "subdir"), { recursive: true });
		writeFileSync(join(dir, "subdir", "nested.md"), "---\n---\nnested");
		writeFileSync(join(dir, "top.md"), "---\n---\ntop");

		const adapter: CommandAdapter = new ClaudeAdapter();
		const cmds = adapter.scan(dir, "global");
		expect(cmds).toHaveLength(1);
		expect(cmds[0].name).toBe("top");

		cleanup(dir);
	});

	it("handles file with no frontmatter gracefully", () => {
		const dir = makeTmpDir();
		writeFileSync(join(dir, "bare.md"), "Just bare content, no frontmatter");

		const adapter: CommandAdapter = new ClaudeAdapter();
		const cmds = adapter.scan(dir, "global");
		expect(cmds).toHaveLength(1);
		expect(cmds[0].description).toBeUndefined();
		expect(cmds[0].content).toContain("Just bare content");

		cleanup(dir);
	});

	it("handles empty directory", () => {
		const dir = makeTmpDir();

		const adapter: CommandAdapter = new ClaudeAdapter();
		const cmds = adapter.scan(dir, "global");
		expect(cmds).toEqual([]);

		cleanup(dir);
	});
});
