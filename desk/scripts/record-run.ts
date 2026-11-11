// Records a run: drives the whole chain against a running `wrangler pages dev` and writes the recorded run the app
// shows by default, so the viewer never waits on a network call.
//
//   npm run record -- http://127.0.0.1:8788                      EV charging: src/data/recorded-run.json
//   npm run record -- http://127.0.0.1:8788 --pack saas-support  that industry: src/data/recorded-run.<pack>.json
//
// Against a server started with MOCK=1 this writes a rules-only run, and the file says so.
// Against a server with a model key it writes an AI run and spends real money (about $0.12 to $0.15), so that is a
// deliberate, separate step and never part of CI. For an industry whose live runs are still off, the local server
// needs ALLOW_PACK_RECORDING=1 (see functions/api/[step].ts). The script never reads or writes any key or .dev.vars
// file.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { DEFAULT_PACK_ID, isPackId } from "../shared/packs";
import { EV_BUNDLE, LOADERS, type PackBundle } from "../src/packs/bundles";
import { chainCalls, postTo, runChain } from "../src/run/live";
import { modelsOf, runCost } from "../src/run/cost";
import { parseRecordedRun } from "../src/run/parse";
import type { RecordedRun } from "../src/run/types";
import { recordArgs, recordingFile } from "./record-args";

async function bundleFor(pack: string): Promise<PackBundle> {
  if (pack === DEFAULT_PACK_ID) return EV_BUNDLE;
  const load = isPackId(pack) ? LOADERS[pack] : undefined;
  if (!load)
    throw new Error(
      `No industry named "${pack}". Use one of: ${[DEFAULT_PACK_ID, ...Object.keys(LOADERS)].join(", ")}.`,
    );
  return load();
}

async function main(): Promise<void> {
  const { baseUrl, pack } = recordArgs(process.argv.slice(2));
  const { desk, incident } = await bundleFor(pack);
  const out = fileURLToPath(new URL(`../src/data/${recordingFile(pack)}`, import.meta.url));
  const calls = chainCalls(desk);
  console.log(`Recording ${calls} calls for ${desk.id} against ${baseUrl} ...`);

  const report = await runChain({
    post: postTo(baseUrl),
    // EV sends its requests exactly as before (no pack named, no incident passed); another industry names itself.
    ...(pack === DEFAULT_PACK_ID ? {} : { pack: desk, incident }),
    onUpdate: (u) =>
      console.log(
        `  ${String(u.settled).padStart(2)}/${calls}  ${u.step}${u.batch === undefined ? "" : ` #${u.batch + 1}`}  ${
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
  // The same check the app applies on load, against this industry's tickets.
  parseRecordedRun(
    recorded,
    desk.tickets.map((t) => t.id),
  );

  const options = (await prettier.resolveConfig(out)) ?? {};
  await writeFile(out, await prettier.format(JSON.stringify(recorded), { ...options, parser: "json" }), "utf8");

  const rulesCalls = report.answered - report.aiAnswered;
  console.log(
    `Wrote ${out}\n  source: ${recorded.source}  models: ${models.join(", ") || "none"}  cost: $${recorded.totalCost.toFixed(4)}`,
  );
  if (recorded.source === "ai" && rulesCalls > 0)
    console.warn(`  Warning: ${rulesCalls} of ${report.answered} calls fell back to rules (${report.fallbackReason}).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
