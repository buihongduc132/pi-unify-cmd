import { describe, expect, it } from "vitest";
import { interpolateArgs, formatLabel, formatCommandName } from "./index-helpers";
import type { ExternalCommand, UnifyCmdConfig } from "./types";
import { DEFAULT_CONFIG } from "./types";

// ─── interpolateArgs ──────────────────────────────────────────────

describe("interpolateArgs", () => {
	it("replaces $ARGUMENTS (Claude style)", () => {
		const result = interpolateArgs("Review: $ARGUMENTS", "https://pr/42");
		expect(result).toBe("Review: https://pr/42");
	});

	it("replaces {{args}} (Gemini style)", () => {
		const result = interpolateArgs("Run: {{args}}", "change next");
		expect(result).toBe("Run: change next");
	});

	it("replaces $@ (all args)", () => {
		const result = interpolateArgs("Create $1 with $@", "Button click-handler");
		expect(result).toBe("Create Button with Button click-handler");
	});

	it("replaces $N positional args", () => {
		const result = interpolateArgs("First: $1, Second: $2", "alpha beta gamma");
		expect(result).toBe("First: alpha, Second: beta");
	});

	it("replaces ${@:N:L} slicing", () => {
		const result = interpolateArgs("Rest: ${@:2}", "one two three four");
		expect(result).toBe("Rest: two three four");
	});

	it("replaces ${@:N:L} with length", () => {
		const result = interpolateArgs("Mid: ${@:2:2}", "one two three four");
		expect(result).toBe("Mid: two three");
	});

	it("strips all placeholders when no args (empty string)", () => {
		const result = interpolateArgs("Review: $ARGUMENTS and $1 ${@:2}", "");
		expect(result).toBe("Review:  and  ");
	});

	it("handles missing positional arg gracefully", () => {
		const result = interpolateArgs("Only: $1, Missing: $5", "alpha");
		expect(result).toBe("Only: alpha, Missing: ");
	});

	it("handles empty template", () => {
		const result = interpolateArgs("", "args");
		expect(result).toBe("");
	});

	it("handles no placeholders in template", () => {
		const result = interpolateArgs("Just text", "args");
		expect(result).toBe("Just text");
	});

	it("handles ${@:0} edge case", () => {
		const result = interpolateArgs("All: ${@:0}", "a b c");
		expect(result).toContain("a b c");
	});

	it("handles ${@:1} returns all args from position 1", () => {
		const result = interpolateArgs("From 1: ${@:1}", "one two three");
		expect(result).toBe("From 1: one two three");
	});
});

// ─── formatLabel ──────────────────────────────────────────────────

describe("formatLabel", () => {
	const config: UnifyCmdConfig = DEFAULT_CONFIG;

	it("formats global scope label", () => {
		const cmd: ExternalCommand = {
			name: "review",
			description: "Review changes",
			content: "",
			source: { agent: "claude", scope: "global", filePath: "/test" },
		};
		const result = formatLabel(config, cmd);
		expect(result).toBe("[G] (claude) | Review changes");
	});

	it("formats project scope label", () => {
		const cmd: ExternalCommand = {
			name: "plan",
			description: "Plan work",
			content: "",
			source: { agent: "opencode", scope: "project", filePath: "/test" },
		};
		const result = formatLabel(config, cmd);
		expect(result).toBe("[L] (opencode) | Plan work");
	});

	it("falls back to 'no description' when missing", () => {
		const cmd: ExternalCommand = {
			name: "bare",
			content: "",
			source: { agent: "codex", scope: "global", filePath: "/test" },
		};
		const result = formatLabel(config, cmd);
		expect(result).toBe("[G] (codex) | no description");
	});

	it("respects custom labelFormat", () => {
		const customConfig: UnifyCmdConfig = {
			...config,
			labelFormat: "{agent}/{name} — {description}",
		};
		const cmd: ExternalCommand = {
			name: "test",
			description: "A test",
			content: "",
			source: { agent: "gemini", scope: "global", filePath: "/test" },
		};
		const result = formatLabel(customConfig, cmd);
		expect(result).toBe("gemini/test — A test");
	});
});

// ─── formatCommandName ────────────────────────────────────────────

describe("formatCommandName", () => {
	const config: UnifyCmdConfig = DEFAULT_CONFIG;

	it("formats default prefix", () => {
		const cmd: ExternalCommand = {
			name: "review",
			description: "desc",
			content: "",
			source: { agent: "claude", scope: "global", filePath: "/test" },
		};
		expect(formatCommandName(config, cmd)).toBe("claude:review");
	});

	it("formats custom prefix", () => {
		const customConfig: UnifyCmdConfig = {
			...config,
			prefixFormat: "u-{agent}-{name}",
		};
		const cmd: ExternalCommand = {
			name: "plan",
			description: "desc",
			content: "",
			source: { agent: "opencode", scope: "global", filePath: "/test" },
		};
		expect(formatCommandName(customConfig, cmd)).toBe("u-opencode-plan");
	});

	it("handles names with hyphens", () => {
		const cmd: ExternalCommand = {
			name: "opsx-apply",
			description: "desc",
			content: "",
			source: { agent: "codex", scope: "global", filePath: "/test" },
		};
		expect(formatCommandName(config, cmd)).toBe("codex:opsx-apply");
	});
});
