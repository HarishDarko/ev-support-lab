// Records a run: drives the whole chain against a running `wrangler pages dev` and writes
// src/data/recorded-run.json, which the app shows by default so the viewer never waits on a network call.
//
//   npm run record -- http://127.0.0.1:8788
//
// Against a server started with MOCK=1 this writes a rules-only run, and the file says so.
// Against a server with a model key it writes an AI run and spends real money (about $0.15), so that is a
// deliberate, separate step and never part of CI. The script never reads or writes any key or .dev.vars file.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { CHAIN_CALLS, postTo, runChain } from "../src/run/live";
import { modelsOf, runCost } from "../src/run/cost";
import { parseRecordedRun } from "../src/run/parse";
import type { RecordedRun } from "../src/run/types";

const OUT = fileURLToPath(new URL("../src/data/recorded-run.json", import.meta.url));

async function main(): Promise<void> {
  const baseUrl = (process.argv[2] ?? "http://127.0.0.1:8788").replace(/\/+$/, "");
  console.log(`Recording ${CHAIN_CALLS} calls against ${baseUrl} ...`);

  const report = await runChain({
    post: postTo(baseUrl),
    onUpdate: (u) =>
      console.log(
        `  ${String(u.settled).padStart(2)}/${CHAIN_CALLS}  ${u.step}${u.batch === undefined ? "" : ` #${u.batch + 1}`}  ${
          u.outcome === "failed" ? `FAILED: ${u.message}` : u.result.trace.source
        }`,
      ),
  });
  if (!report.steps || report.failures.length) {
    for (const f of report.failures) console.error(`${f.step}: ${f.message}`);
    throw new Error("The chain did not complete, so nothing was written.");
  }

  const models = modelsOf(report.steps);
  const recorded: RecordedRun = {
    recordedAt: new Date().toISOString(),
    source: models.length ? "ai" : "rules",
    models,
    totalCost: runCost(report.steps),
    steps: report.steps,
  };
  parseRecordedRun(recorded); // the same check the app applies on load

  const options = (await prettier.resolveConfig(OUT)) ?? {};
  await writeFile(OUT, await prettier.format(JSON.stringify(recorded), { ...options, parser: "json" }), "utf8");

  const rulesCalls = report.answered - report.aiAnswered;
  console.log(
    `Wrote ${OUT}\n  source: ${recorded.source}  models: ${models.join(", ") || "none"}  cost: $${recorded.totalCost.toFixed(4)}`,
  );
  if (recorded.source === "ai" && rulesCalls > 0)
    console.warn(`  Warning: ${rulesCalls} of ${report.answered} calls fell back to rules (${report.fallbackReason}).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
