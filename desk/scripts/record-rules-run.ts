// Writes the rules-only recording for an industry other than EV: src/data/recorded-run.<pack>.json. No server, no
// model, no spend (see rules-run.ts). The paid AI recording for a pack is a separate, approved step (record-run.ts).
//
//   npx tsx scripts/record-rules-run.ts saas-support
//   npx tsx scripts/record-rules-run.ts e-commerce
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { isPackId } from "../shared/packs";
import { LOADERS } from "../src/packs/bundles";
import { rulesRecording } from "./rules-run";

const id = process.argv[2] ?? "saas-support";
const load = isPackId(id) ? LOADERS[id] : undefined;
if (!load) throw new Error(`No industry bundle named "${id}". Use one of: ${Object.keys(LOADERS).join(", ")}.`);
const OUT = fileURLToPath(new URL(`../src/data/recorded-run.${id}.json`, import.meta.url));

const { desk, incident } = await load();
const recorded = await rulesRecording(desk, incident, new Date().toISOString());
const options = (await prettier.resolveConfig(OUT)) ?? {};
await writeFile(OUT, await prettier.format(JSON.stringify(recorded), { ...options, parser: "json" }), "utf8");
console.log(`Wrote ${OUT}\n  source: ${recorded.source}  cost: $${recorded.totalCost.toFixed(4)}`);
