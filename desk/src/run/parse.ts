// Reading a recorded run: checks the shape of what `npm run record` wrote and turns it into a Run.
// A file that does not match fails loudly here rather than as a blank screen.
import { TICKETS } from "../data/synthetic";
import { STEP_KEYS, type RecordedRun, type Run } from "./types";

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function fail(where: string, problem: string): never {
  throw new Error(`recorded-run.json: ${where} ${problem}`);
}

function expectString(value: unknown, where: string): void {
  if (typeof value !== "string" || !value) fail(where, "must be a non-empty string");
}
function expectNumber(value: unknown, where: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(where, "must be a number");
}

/** `{ data, trace, ms }` exactly as the API returned them. */
function expectStepResult(value: unknown, where: string): Json {
  if (!isObject(value)) return fail(where, "must be an object");
  if (!isObject(value["data"])) fail(`${where}.data`, "must be an object");
  expectNumber(value["ms"], `${where}.ms`);
  const trace = value["trace"];
  if (!isObject(trace)) return fail(`${where}.trace`, "must be an object");
  if (trace["source"] !== "ai" && trace["source"] !== "rules") fail(`${where}.trace.source`, 'must be "ai" or "rules"');
  expectString(trace["model"], `${where}.trace.model`);
  expectNumber(trace["cost"], `${where}.trace.cost`);
  expectNumber(trace["attempts"], `${where}.trace.attempts`);
  if (!Array.isArray(trace["checks"])) fail(`${where}.trace.checks`, "must be a list");
  if (!isObject(trace["tokens"])) fail(`${where}.trace.tokens`, "must be an object");
  return value;
}

/** Throws a clear error unless `raw` is a complete recorded run covering all 40 tickets exactly once. */
export function parseRecordedRun(raw: unknown): RecordedRun {
  if (!isObject(raw)) return fail("the file", "must be an object");
  expectString(raw["recordedAt"], "recordedAt");
  if (raw["source"] !== "ai" && raw["source"] !== "rules") fail("source", 'must be "ai" or "rules"');
  if (!Array.isArray(raw["models"])) fail("models", "must be a list");
  expectNumber(raw["totalCost"], "totalCost");
  const steps = raw["steps"];
  if (!isObject(steps)) return fail("steps", "must be an object");

  for (const key of STEP_KEYS) {
    if (key === "triage") continue;
    expectStepResult(steps[key], `steps.${key}`);
  }
  const batches = steps["triage"];
  if (!Array.isArray(batches) || batches.length === 0) return fail("steps.triage", "must be a list of batches");
  const seen: string[] = [];
  batches.forEach((batch, i) => {
    const step = expectStepResult(batch, `steps.triage[${i}]`);
    const results = (step["data"] as Json)["results"];
    if (!Array.isArray(results)) fail(`steps.triage[${i}].data.results`, "must be a list");
    for (const r of results) {
      if (!isObject(r) || typeof r["id"] !== "string")
        fail(`steps.triage[${i}].data.results`, "has an entry without an id");
      seen.push(r["id"]);
    }
  });
  const expected = TICKETS.map((t) => t.id);
  const missing = expected.filter((id) => !seen.includes(id));
  const extra = seen.filter((id, i) => !expected.includes(id) || seen.indexOf(id) !== i);
  if (missing.length || extra.length)
    fail(
      "steps.triage",
      `must cover every ticket once (missing: ${missing.join(", ") || "none"}; unexpected: ${extra.join(", ") || "none"})`,
    );

  return raw as unknown as RecordedRun;
}

export function runFromRecording(recorded: RecordedRun): Run {
  const { steps, ...recording } = recorded;
  return { source: "recorded", recording, steps };
}
