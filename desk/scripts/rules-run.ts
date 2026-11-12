// A rules-only recording for a pack whose live runs are off: the same chain the live runner drives (src/run/live.ts),
// sent to the real step handler in this process with the model turned off (MOCK=1). Nothing leaves the machine and
// nothing is spent; every answer comes from the pack's deterministic rules, and the file says so (source "rules").
// tests/saas-incident.test.ts and tests/ecommerce-incident.test.ts run this again and compare it with the committed
// file.
import { onRequestPost } from "../functions/api/[step]";
import type { Incident } from "../src/incident/types";
import { modelsOf, runCost } from "../src/run/cost";
import { runChain, type PostStep } from "../src/run/live";
import type { DeskPack } from "../src/run/pack";
import { parseRecordedRun } from "../src/run/parse";
import type { RecordedRun, StepResult } from "../src/run/types";

/** POST /api/<step> to the handler itself, with the model off. */
const inProcess: PostStep = async (step, body) => {
  const request = new Request(`http://localhost/api/${step}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const res = await onRequestPost({ request, env: { MOCK: "1" }, params: { step } });
  const json = (await res.json()) as { error?: string } & Partial<StepResult<unknown>>;
  if (!res.ok || !json.data || !json.trace) throw new Error(json.error ?? `HTTP ${res.status}`);
  return { data: json.data, trace: json.trace, ms: json.ms ?? 0 };
};

export async function rulesRecording(pack: DeskPack, incident: Incident, recordedAt: string): Promise<RecordedRun> {
  const report = await runChain({ post: inProcess, pack, incident });
  if (!report.steps || report.failures.length)
    throw new Error(`The chain did not complete: ${report.failures.map((f) => `${f.step}: ${f.message}`).join("; ")}`);
  const models = modelsOf(report.steps);
  if (models.length) throw new Error("A model answered, so this is not a rules-only recording.");
  const recorded: RecordedRun = {
    recordedAt,
    source: "rules",
    models,
    totalCost: runCost(report.steps),
    steps: report.steps,
  };
  parseRecordedRun(
    recorded,
    pack.tickets.map((t) => t.id),
  );
  return recorded;
}
