/**
 * Smoke test — verifies pi-unify-cmd loads and discovers commands
 * Run: node --experimental-strip-types scripts/smoke-test.ts
 */

import { loadConfig } from "../extensions/config";
import { discoverCommands, listGlobalRoots, listProjectRoots } from "../extensions/discovery";
import { BUILTIN_ADAPTERS } from "../extensions/adapters";

const cwd = process.cwd();
const config = loadConfig(cwd);

let errors = 0;

console.log("pi-unify-cmd smoke test");
console.log("=======================\n");

const perAgent = new Map<string, number>();
const perAgentRoots = new Map<string, { global: string[]; project: string[] }>();

for (const [agentName, adapterConfig] of Object.entries(config.agents)) {
	if (!adapterConfig.enabled) {
		console.log(`  ${agentName}: DISABLED`);
		continue;
	}
	// Fail loudly if an enabled built-in agent has no adapter registered —
	// otherwise an adapter-registration regression would slip past CI.
	if (!BUILTIN_ADAPTERS[agentName]) {
		console.log(`  ${agentName}: ERROR — no adapter factory registered`);
		errors++;
		continue;
	}
	perAgentRoots.set(agentName, {
		global: listGlobalRoots(adapterConfig),
		project: listProjectRoots(adapterConfig, cwd),
	});
	perAgent.set(agentName, 0);
}

for (const custom of config.custom ?? []) {
	if (!custom.enabled) continue;
	perAgentRoots.set(custom.name, {
		global: listGlobalRoots(custom),
		project: listProjectRoots(custom, cwd),
	});
	perAgent.set(custom.name, 0);
}

const commands = discoverCommands(config, cwd);

for (const cmd of commands) {
	perAgent.set(cmd.source.agent, (perAgent.get(cmd.source.agent) ?? 0) + 1);
}

for (const [agent, roots] of perAgentRoots) {
	const count = perAgent.get(agent) ?? 0;
	console.log(`  ${agent}: ${count} commands`);
	for (const g of roots.global) console.log(`     global: ${g}`);
	for (const p of roots.project) console.log(`     project: ${p}`);
}

console.log(`\nTotal: ${commands.length} commands discovered`);
if (errors > 0) {
	console.log(`Errors: ${errors}`);
	process.exit(1);
}

console.log("\n✓ Smoke test passed");
