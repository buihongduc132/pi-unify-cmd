/**
 * Smoke test — verifies pi-unify-cmd loads and discovers commands
 * Run: node --experimental-strip-types scripts/smoke-test.ts
 */

import { loadConfig, resolveHome } from "../extensions/config";
import { BUILTIN_ADAPTERS } from "../extensions/adapters";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

const cwd = process.cwd();
const config = loadConfig(cwd);

let total = 0;
let errors = 0;

console.log("pi-unify-cmd smoke test");
console.log("=======================\n");

for (const [agentName, adapterConfig] of Object.entries(config.agents)) {
	if (!adapterConfig.enabled) {
		console.log(`  ${agentName}: DISABLED`);
		continue;
	}

	const factory = BUILTIN_ADAPTERS[agentName];
	if (!factory) {
		console.log(`  ${agentName}: ERROR — no adapter registered`);
		errors++;
		continue;
	}

	const adapter = factory();

	if (adapterConfig.globalDir) {
		const dir = resolveHome(adapterConfig.globalDir);
		const exists = existsSync(dir);
		if (!exists) {
			console.log(`  ${agentName} (global): dir not found — ${dir}`);
			continue;
		}

		const cmds = adapter.scan(dir, "global");
		console.log(`  ${agentName} (global): ${cmds.length} commands`);
		total += cmds.length;
	}
}

console.log(`\nTotal: ${total} commands discovered`);
if (errors > 0) {
	console.log(`Errors: ${errors}`);
	process.exit(1);
}

console.log("\n✓ Smoke test passed");
