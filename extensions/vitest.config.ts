import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary"],
			thresholds: {
				lines: 90,
				branches: 90,
			functions: 80,
				statements: 90,
			},
			include: [
				"adapters.ts",
				"config.ts",
				"index-helpers.ts",
			],
			exclude: ["index.ts"],
		},
	},
});
