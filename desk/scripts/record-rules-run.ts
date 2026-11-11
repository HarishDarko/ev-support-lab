// Writes the rules-only recording for SaaS support: src/data/recorded-run.saas-support.json. No server, no model,
// no spend (see rules-run.ts). The paid AI recording for this pack is a separate, approved step.
//
//   npx tsx scripts/record-rules-run.ts
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { SAAS_INCIDENT } from "../src/incident/saas-support";
import { SAAS_DESK } from "../src/packs/saas-desk";
import { rulesRecording } from "./rules-run";

const OUT = fileURLToPath(new URL("../src/data/recorded-run.saas-support.json", import.meta.url));

const recorded = await rulesRecording(SAAS_DESK, SAAS_INCIDENT, new Date().toISOString());
const options = (await prettier.resolveConfig(OUT)) ?? {};
await writeFile(OUT, await prettier.format(JSON.stringify(recorded), { ...options, parser: "json" }), "utf8");
console.log(`Wrote ${OUT}\n  source: ${recorded.source}  cost: $${recorded.totalCost.toFixed(4)}`);
