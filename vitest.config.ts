import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["extensions/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary"],
			thresholds: {
				lines: 85,
				branches: 85,
				functions: 80,
				statements: 85,
			},
			include: [
				"extensions/adapters.ts",
				"extensions/config.ts",
				"extensions/index-helpers.ts",
			],
		},
	},
});
