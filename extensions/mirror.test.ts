/**
 * pi-unify-cmd — mirror module tests
 *
 * Tests symlink creation, idempotency, error handling, and integration with
 * the registration flow.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	symlinkSync,
	unlinkSync,
	lstatSync,
	readlinkSync,
	mkdirSync,
	writeFileSync,
	rmSync,
	existsSync,
	readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mirrorCommands, unmirrorCommands } from "./mirror";
import type { ExternalCommand } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────

function makeTempDir(): string {
	const base = join(tmpdir(), `pi-unify-cmd-mirror-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(base, { recursive: true });
	return base;
}

function makeCmd(
	name: string,
	sourcePath: string,
	scope: "global" | "project" = "global",
): ExternalCommand {
	return {
		name,
		content: "test content",
		description: "test",
		source: {
			agent: "opencode",
			scope,
			filePath: sourcePath,
		},
	};
}

// ─── Tests ────────────────────────────────────────────────────────

describe("mirrorCommands", () => {
	let tempDir: string;
	let agentDir: string;
	let cwd: string;
	let sourceDir: string;

	beforeEach(() => {
		tempDir = makeTempDir();
		agentDir = join(tempDir, "agent");
		cwd = join(tempDir, "project");
		sourceDir = join(tempDir, "opencode-commands");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(cwd, { recursive: true });
		mkdirSync(sourceDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("creates a symlink for a fresh command (Task 5.1)", () => {
		const sourcePath = join(sourceDir, "review.md");
		writeFileSync(sourcePath, "# Review command");
		const cmd = makeCmd("review", sourcePath, "global");

		const result = mirrorCommands([cmd], { agentDir, cwd });

		expect(result.created).toHaveLength(1);
		expect(result.created[0].name).toBe("review");

		const linkPath = join(agentDir, "prompts", "review.md");
		expect(existsSync(linkPath)).toBe(true);
		expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
	});

	it("reuses an existing correct symlink (Task 5.2)", () => {
		const sourcePath = join(sourceDir, "review.md");
		writeFileSync(sourcePath, "# Review command");
		const cmd = makeCmd("review", sourcePath, "global");

		// First call creates
		const result1 = mirrorCommands([cmd], { agentDir, cwd });
		expect(result1.created).toHaveLength(1);

		// Second call reuses
		const result2 = mirrorCommands([cmd], { agentDir, cwd });
		expect(result2.reused).toHaveLength(1);
		expect(result2.created).toHaveLength(0);

		// Symlink still exists and points to the right target
		const linkPath = join(agentDir, "prompts", "review.md");
		expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
	});

	it("replaces a stale symlink with wrong target (Task 5.3)", () => {
		const sourcePath = join(sourceDir, "review.md");
		writeFileSync(sourcePath, "# Review command");
		const cmd = makeCmd("review", sourcePath, "global");

		// Create a stale symlink pointing to a different target
		const linkPath = join(agentDir, "prompts", "review.md");
		mkdirSync(join(agentDir, "prompts"), { recursive: true });
		const staleTarget = join(sourceDir, "stale-target.md");
		writeFileSync(staleTarget, "# Stale");
		symlinkSync(staleTarget, linkPath);

		const result = mirrorCommands([cmd], { agentDir, cwd });

		expect(result.replaced).toHaveLength(1);
		expect(result.created).toHaveLength(0);

		// Symlink now points to the correct target
		const actualTarget = readlinkSync(linkPath);
		expect(actualTarget).not.toBe(staleTarget);
		// Verify it resolves to the correct file
		const resolved = join(join(agentDir, "prompts"), actualTarget);
		expect(readFileSync(resolved, "utf-8")).toBe("# Review command");
	});

	it("skips when real file exists at target path (Task 5.4)", () => {
		const sourcePath = join(sourceDir, "review.md");
		writeFileSync(sourcePath, "# Review command");
		const cmd = makeCmd("review", sourcePath, "global");

		// Create a real file at the target path
		const linkPath = join(agentDir, "prompts", "review.md");
		mkdirSync(join(agentDir, "prompts"), { recursive: true });
		writeFileSync(linkPath, "# User-authored file");
		const originalContent = readFileSync(linkPath, "utf-8");

		const result = mirrorCommands([cmd], { agentDir, cwd });

		expect(result.skipped).toHaveLength(1);
		expect(result.skipped[0].reason).toBe("real-file-exists");

		// Real file untouched
		expect(readFileSync(linkPath, "utf-8")).toBe(originalContent);
		expect(lstatSync(linkPath).isSymbolicLink()).toBe(false);
	});

	it("records broken commands on symlink creation failure (Task 5.5)", () => {
		const sourcePath = join(sourceDir, "review.md");
		writeFileSync(sourcePath, "# Review command");
		const cmd1 = makeCmd("review", sourcePath, "global");
		const cmd2 = makeCmd("analyze", join(sourceDir, "analyze.md"), "global");
		writeFileSync(join(sourceDir, "analyze.md"), "# Analyze");

		// Make the prompts dir read-only to trigger EPERM on first command
		const promptsDir = join(agentDir, "prompts");
		mkdirSync(promptsDir, { recursive: true });

		// Create a real directory named "review.md" to block symlink creation
		mkdirSync(join(promptsDir, "review.md"));

		const result = mirrorCommands([cmd1, cmd2], { agentDir, cwd });

		// review.md should be skipped (real directory exists)
		expect(result.skipped).toHaveLength(1);
		expect(result.skipped[0].reason).toBe("real-file-exists");

		// analyze.md should succeed
		expect(result.created).toHaveLength(1);
		expect(result.created[0].name).toBe("analyze");
	});

	it("uses relative target path (Task 5.6)", () => {
		const sourcePath = join(sourceDir, "review.md");
		writeFileSync(sourcePath, "# Review command");
		const cmd = makeCmd("review", sourcePath, "global");

		const result = mirrorCommands([cmd], { agentDir, cwd });
		expect(result.created).toHaveLength(1);

		const linkPath = join(agentDir, "prompts", "review.md");
		const actualTarget = readlinkSync(linkPath);

		// Target should be relative, not absolute
		expect(actualTarget).not.toMatch(/^\//);
		expect(actualTarget).toMatch(/^\.\./);
	});

	it("uses relative target for project scope too (Task 5.6b)", () => {
		const sourcePath = join(cwd, ".opencode", "commands", "local.md");
		mkdirSync(join(cwd, ".opencode", "commands"), { recursive: true });
		writeFileSync(sourcePath, "# Local command");
		const cmd = makeCmd("local", sourcePath, "project");

		const result = mirrorCommands([cmd], { agentDir, cwd });
		expect(result.created).toHaveLength(1);

		const linkPath = join(cwd, ".pi", "prompts", "local.md");
		const actualTarget = readlinkSync(linkPath);

		expect(actualTarget).not.toMatch(/^\//);
	});

	it("auto-creates parent directory when missing (Task 5.7)", () => {
		const sourcePath = join(sourceDir, "review.md");
		writeFileSync(sourcePath, "# Review command");
		const cmd = makeCmd("review", sourcePath, "project");

		// .pi/prompts does not exist yet
		const piDir = join(cwd, ".pi");
		expect(existsSync(piDir)).toBe(false);

		const result = mirrorCommands([cmd], { agentDir, cwd });
		expect(result.created).toHaveLength(1);

		// Parent dir was created
		expect(existsSync(join(cwd, ".pi", "prompts"))).toBe(true);
		expect(existsSync(join(cwd, ".pi", "prompts", "review.md"))).toBe(true);
	});
});

describe("unmirrorCommands", () => {
	let tempDir: string;
	let agentDir: string;
	let cwd: string;
	let sourceDir: string;

	beforeEach(() => {
		tempDir = makeTempDir();
		agentDir = join(tempDir, "agent");
		cwd = join(tempDir, "project");
		sourceDir = join(tempDir, "opencode-commands");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(cwd, { recursive: true });
		mkdirSync(sourceDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("removes symlinks created by mirrorCommands", () => {
		const sourcePath = join(sourceDir, "review.md");
		writeFileSync(sourcePath, "# Review command");
		const cmd = makeCmd("review", sourcePath, "global");

		// Mirror first
		mirrorCommands([cmd], { agentDir, cwd });
		const linkPath = join(agentDir, "prompts", "review.md");
		expect(existsSync(linkPath)).toBe(true);

		// Unmirror
		const { removed, skipped } = unmirrorCommands([cmd], { agentDir, cwd });
		expect(removed).toBe(1);
		expect(skipped).toBe(0);
		expect(existsSync(linkPath)).toBe(false);
	});

	it("skips real files during unmirror", () => {
		const sourcePath = join(sourceDir, "review.md");
		writeFileSync(sourcePath, "# Review command");
		const cmd = makeCmd("review", sourcePath, "global");

		// Create a real file (not a symlink)
		const linkPath = join(agentDir, "prompts", "review.md");
		mkdirSync(join(agentDir, "prompts"), { recursive: true });
		writeFileSync(linkPath, "# User file");

		const { removed, skipped } = unmirrorCommands([cmd], { agentDir, cwd });
		expect(removed).toBe(0);
		expect(skipped).toBe(1);
		expect(existsSync(linkPath)).toBe(true);
	});

	it("is idempotent — removing non-existent symlinks is safe", () => {
		const sourcePath = join(sourceDir, "review.md");
		writeFileSync(sourcePath, "# Review command");
		const cmd = makeCmd("review", sourcePath, "global");

		// No symlink exists
		const { removed, skipped } = unmirrorCommands([cmd], { agentDir, cwd });
		expect(removed).toBe(0);
		expect(skipped).toBe(1);
	});
});
