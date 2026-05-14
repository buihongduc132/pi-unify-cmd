import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
	loadConfig,
	resolveHome,
	getDefaultConfig,
} from "./config";
import { DEFAULT_CONFIG } from "./types";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { homedir } from "node:os";

// ─── resolveHome ──────────────────────────────────────────────────

describe("resolveHome", () => {
	it("resolves ~ to homedir", () => {
		expect(resolveHome("~/foo")).toBe(join(homedir(), "foo"));
	});

	it("leaves absolute paths unchanged", () => {
		expect(resolveHome("/absolute/path")).toBe("/absolute/path");
	});

	it("leaves relative paths unchanged", () => {
		expect(resolveHome("relative/path")).toBe("relative/path");
	});
});

// ─── getDefaultConfig ─────────────────────────────────────────────

describe("getDefaultConfig", () => {
	it("returns valid JSON matching DEFAULT_CONFIG", () => {
		const json = getDefaultConfig();
		const parsed = JSON.parse(json);
		expect(parsed.agents.claude.enabled).toBe(true);
		expect(parsed.agents.gemini.enabled).toBe(true);
		expect(parsed.labelFormat).toBe(DEFAULT_CONFIG.labelFormat);
		expect(parsed.prefixFormat).toBe(DEFAULT_CONFIG.prefixFormat);
	});
});

// ─── loadConfig ───────────────────────────────────────────────────

describe("loadConfig", () => {
	const tmpDir = join(tmpdir(), `pi-unify-cmd-config-test-${Date.now()}`);
	const configFile = join(tmpDir, "unify-cmd.json");

	beforeEach(() => {
		mkdirSync(tmpDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns defaults when no config files exist", () => {
		const config = loadConfig(tmpDir);
		expect(config.agents.claude.enabled).toBe(true);
		expect(config.labelFormat).toBe(DEFAULT_CONFIG.labelFormat);
	});

	it("merges global config over defaults", () => {
		writeFileSync(configFile, JSON.stringify({
			agents: { claude: { enabled: false } },
		}));

		// loadConfig reads from ~/.pi/agent/unify-cmd.json + cwd/.unify-cmd.json
		// We test with a project-level override
		const projectFile = join(tmpDir, ".unify-cmd.json");
		writeFileSync(projectFile, JSON.stringify({
			agents: { opencode: { enabled: false } },
		}));

		const config = loadConfig(tmpDir);
		expect(config.agents.opencode.enabled).toBe(false);
		// claude still enabled (global default, no override in project)
		expect(config.agents.claude.enabled).toBe(true);
	});

	it("handles malformed JSON gracefully", () => {
		const projectFile = join(tmpDir, ".unify-cmd.json");
		writeFileSync(projectFile, "{ broken json }");

		const config = loadConfig(tmpDir);
		expect(config.agents.claude.enabled).toBe(true);
	});

	it("deep merges nested objects", () => {
		const projectFile = join(tmpDir, ".unify-cmd.json");
		writeFileSync(projectFile, JSON.stringify({
			agents: {
				gemini: { globalDir: "/custom/gemini/path" },
			},
		}));

		const config = loadConfig(tmpDir);
		// gemini.enabled should remain default true
		expect(config.agents.gemini.enabled).toBe(true);
		// but globalDir is overridden
		expect(config.agents.gemini.globalDir).toBe("/custom/gemini/path");
	});

	it("overrides labelFormat and prefixFormat", () => {
		const projectFile = join(tmpDir, ".unify-cmd.json");
		writeFileSync(projectFile, JSON.stringify({
			labelFormat: "{agent}/{name}: {description}",
			prefixFormat: "u:{agent}-{name}",
		}));

		const config = loadConfig(tmpDir);
		expect(config.labelFormat).toBe("{agent}/{name}: {description}");
		expect(config.prefixFormat).toBe("u:{agent}-{name}");
	});

	it("adds custom adapters from config", () => {
		const projectFile = join(tmpDir, ".unify-cmd.json");
		writeFileSync(projectFile, JSON.stringify({
			custom: [{
				name: "my-agent",
				enabled: true,
				globalDir: "~/.my-agent/cmds",
				format: "yaml-frontmatter",
			}],
		}));

		const config = loadConfig(tmpDir);
		expect(config.custom).toHaveLength(1);
		expect(config.custom[0].name).toBe("my-agent");
	});
});
