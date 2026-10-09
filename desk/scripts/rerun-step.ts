// Re-runs one late step of the recorded chain against a running server and splices the answer into
// src/data/recorded-run.json. Only for steps nothing else depends on (shiftnote, classify), so the recording
// stays consistent. Usage: npm run rerun -- <baseUrl> <step>
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { format, resolveConfig } from "prettier";
import { indexTriage, shiftSummary } from "../src/run/selectors";
import { NEW_TICKET_EXAMPLE } from "../shared/synthetic";
import type { RecordedRun, StepResult } from "../src/run/types";

const [base, step] = process.argv.slice(2);
if (!base || (step !== "shiftnote" && step !== "classify")) {
  console.error("Usage: npm run rerun -- <baseUrl> <shiftnote|classify>");
  process.exit(1);
}

const file = resolve(import.meta.dirname, "../src/data/recorded-run.json");
const run = JSON.parse(readFileSync(file, "utf8")) as RecordedRun;
const body =
  step === "shiftnote"
    ? { summary: shiftSummary(indexTriage(run.steps.triage), run.steps.handoff.data.title) }
    : { text: NEW_TICKET_EXAMPLE, article: run.steps.kb.data };

const res = await fetch(`${base}/api/${step}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const answer = (await res.json()) as StepResult<never> & { error?: string };
if (!res.ok || !answer.trace) throw new Error(answer.error ?? `HTTP ${res.status}`);

const previous = run.steps[step].trace.cost;
(run.steps as Record<string, unknown>)[step] = { data: answer.data, trace: answer.trace, ms: answer.ms };
run.totalCost = Number((run.totalCost - previous + answer.trace.cost).toFixed(6));
const text = await format(JSON.stringify(run), { ...(await resolveConfig(file)), filepath: file });
writeFileSync(file, text);
console.log(
  `${step}: ${answer.trace.source}, $${answer.trace.cost.toFixed(4)}; recording total now $${run.totalCost.toFixed(4)}`,
);
