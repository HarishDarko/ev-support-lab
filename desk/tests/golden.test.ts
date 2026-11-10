// Golden outputs for the EV pack move (SD-10, no behavior change). Recorded on the code before the move and compared
// byte for byte after it. Four areas:
//   requests: every model request the API would send (system, prompt, schema, model, limits) for the 8 triage batches
//             and the 7 single steps, built from the committed recorded run's own inputs, plus the response the
//             handler returns for the recorded answer and the rules fallback it returns with AI off.
//   rules:    the rules on all 40 open and 30 closed tickets, every rules fallback, the guardrail word lists and
//             runbook exceptions on every ticket text, and the fixed texts the UI imports.
//   replay:   the committed recorded run as the desk reads it: per-ticket lane, provenance, quote, repeat rule,
//             queue order, lane counts, cost per step, shift summary.
//   story:    the walkthrough's story data and every beat's text, from the recorded run and from the rules.
// To record (only on the base commit): GOLDEN_WRITE=1 npx vitest run tests/golden.test.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, beforeEach } from "vitest";

const sdk = vi.hoisted(() => ({ plain: vi.fn(), beta: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {}
  class RateLimitError extends APIError {}
  class AuthenticationError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    static AuthenticationError = AuthenticationError;
    messages = { create: sdk.plain };
    beta = { messages: { create: sdk.beta } };
  }
  return { default: Anthropic };
});

import { onRequestPost } from "../functions/api/[step]";
import { SYSTEM } from "../functions/_lib/ai";
import * as rules from "../functions/_lib/rules";
import * as steps from "../functions/_lib/steps";
import * as validate from "../functions/_lib/validate";
import { HISTORY, NEW_TICKET_EXAMPLE, RUNBOOKS, TICKETS } from "../shared/synthetic";
import { recordedRun } from "../src/run/recorded";
import { TRIAGE_BATCHES } from "../src/run/live";
import {
  costByStep,
  indexRun,
  indexTriage,
  laneCounts,
  lanesOf,
  originCounts,
  runCost,
  runLabel,
  shiftSummary,
  TICKET_ORDER,
} from "../src/run";
import { rulesStoryData, type StoryData } from "../src/story/data";
import { storyDataFromRun } from "../src/story/fromRun";
import { BEATS, canaryOutcome, facts, type Decisions } from "../src/story/beats";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, "golden");
const WRITE = process.env["GOLDEN_WRITE"] === "1";

/** Compares (or, when recording, writes) one golden file. Returns its sha256 so the run prints it. */
function golden(name: string, value: unknown): string {
  const text = JSON.stringify(value, null, 1) + "\n";
  const file = join(GOLDEN, `${name}.json`);
  if (WRITE) writeFileSync(file, text);
  const digest = createHash("sha256").update(text).digest("hex");
  console.log(`golden ${name}: sha256 ${digest} (${text.length} chars)`);
  expect(existsSync(file), `${file} is missing; record it on the base commit`).toBe(true);
  expect(text).toBe(readFileSync(file, "utf8"));
  return digest;
}

const run = recordedRun();
const s = run.steps;
const triageRows = s.triage
  .flatMap((t) => t.data.results)
  .map(({ id, component, severity, action }) => ({ id, component, severity, action }));
const summary = shiftSummary(indexTriage(s.triage), s.handoff.data.title);

/** The bodies the live chain posts, built from the recorded run exactly as src/run/live.ts builds them. */
const BODIES: [step: string, body: unknown, answer: unknown][] = [
  ...TRIAGE_BATCHES.map((ids, i): [string, unknown, unknown] => ["triage", { ids }, s.triage[i]!.data]),
  ["patterns", { triage: triageRows }, s.patterns.data],
  ["investigate", {}, s.investigate.data],
  ["verify", {}, s.verify.data],
  ["handoff", { investigation: s.investigate.data }, s.handoff.data],
  ["kb", { investigation: s.investigate.data, handoff: s.handoff.data }, s.kb.data],
  ["classify", { text: NEW_TICKET_EXAMPLE, article: s.kb.data }, s.classify.data],
  ["shiftnote", { summary }, s.shiftnote.data],
];

const reply = (data: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  model: "golden-model",
  usage: { input_tokens: 1000, output_tokens: 500 },
  stop_reason: "end_turn",
});

async function post(step: string, body: unknown, env: Record<string, string>) {
  const request = new Request(`http://localhost/api/${step}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await onRequestPost({ request, env, params: { step } });
  const json = (await res.json()) as Record<string, unknown>;
  delete json["ms"]; // wall-clock time, not behavior
  return { status: res.status, body: json };
}

beforeEach(() => {
  sdk.plain.mockReset();
  sdk.beta.mockReset();
});

describe("golden outputs (SD-10: unchanged by the EV pack move)", () => {
  it("requests: every model request and handler response for the recorded run's inputs", async () => {
    const out = [];
    for (const [step, body, answer] of BODIES) {
      sdk.plain.mockResolvedValue(reply(answer));
      sdk.beta.mockResolvedValue(reply(answer));
      const live = await post(step, body, { ANTHROPIC_API_KEY: "golden-key" });
      const calls = [...sdk.plain.mock.calls, ...sdk.beta.mock.calls].map((c) => c[0]);
      sdk.plain.mockReset();
      sdk.beta.mockReset();
      const off = await post(step, body, { MOCK: "1" });
      out.push({ step, body, requests: calls, live, off });
    }
    golden("requests", out);
  });

  it("rules: rules on every ticket, every fallback, guardrail words and exceptions, fixed texts", () => {
    const texts = [...TICKETS.map((t) => [t.id, t.text, t.fw]), ...HISTORY.map((h) => [h.id, h.text, h.fw])];
    golden("rules", {
      system: SYSTEM,
      triageOpen: TICKETS.map((t) => rules.ruleTriage(t)),
      triageHistory: HISTORY.map((h) => rules.ruleTriage(h)),
      triageNoFirmware: TICKETS.map((t) => rules.ruleTriage({ id: t.id, text: t.text })),
      patterns: rules.rulePatterns(),
      investigate: rules.ruleInvestigate(),
      handoff: rules.ruleHandoff(),
      verify: rules.ruleVerify(),
      kb: rules.ruleKb(),
      shiftnote: rules.ruleShiftnote(summary),
      shiftnoteNoSummary: rules.ruleShiftnote(),
      classifyExample: rules.ruleClassify(NEW_TICKET_EXAMPLE, s.kb.data),
      classifyEveryTicket: texts.map(([id, text]) => [id, rules.ruleClassify(text!, s.kb.data)]),
      runbookIds: [...rules.RUNBOOK_IDS],
      handoffNote: rules.HANDOFF_NOTE,
      labTest: rules.LAB_TEST_ATTACHMENT,
      meterStep: steps.METER_STEP,
      billingStep: steps.BILLING_STEP,
      confirmMeter: steps.CONFIRM_METER,
      sources: steps.SOURCES,
      componentTerms: validate.COMPONENT_TERMS,
      runbookTerms: validate.RUNBOOK_TERMS,
      runbookFits: validate.RUNBOOK_FITS,
      exceptionNames: RUNBOOKS.map((r) => [r.id, validate.exceptionNames(r.id)]),
      exceptions: texts.map(([id, text, fw]) => [
        id,
        RUNBOOKS.map((r) => [r.id, validate.runbookException(r.id, text, fw)]),
      ]),
      stepShapes: Object.entries(steps.STEPS).map(([k, st]) => [k, st.deep, st.maxTokens ?? null, st.schema]),
    });
  });

  it("replay: the committed recorded run as the desk reads it", () => {
    const index = indexRun(run);
    golden("replay", {
      label: runLabel(run),
      run,
      order: TICKET_ORDER,
      tickets: [...index.values()].map((t) => ({
        id: t.ticket.id,
        lane: t.lane,
        laneLabel: t.laneLabel,
        provenance: t.provenance,
        runbook: t.runbook?.id ?? null,
        quote: t.quote,
        matched: t.matched,
        repeatRule: t.repeatRule,
        priorUses: t.priorUses.map((h) => h.id),
        needsMeterCheck: t.needsMeterCheck,
      })),
      lanes: lanesOf(index),
      laneCounts: laneCounts(index),
      origins: originCounts(index),
      shiftSummary: summary,
      cost: costByStep(run.steps),
      total: runCost(run.steps),
    });
  });

  it("story: the walkthrough's data and every beat's text, from the recorded run and from the rules", () => {
    const index = indexRun(run);
    const fromRun = storyDataFromRun({ run, resultFor: (id) => index.get(id) });
    const none: Decisions = { approvedIds: [], sent: false, meterChecked: [] };
    const beats = (data: StoryData, decisions: Decisions) => {
      const f = facts(data, decisions);
      return {
        facts: { ...f, incident: undefined },
        canary: canaryOutcome(f),
        beats: BEATS.map((b) => ({
          id: b.id,
          stage: b.stage,
          desk: b.desk,
          when: b.when(f),
          claim: b.claim(f),
          lede: b.lede(f),
        })),
      };
    };
    const story = (data: StoryData) => {
      const all: Decisions = {
        approvedIds: data.tickets.map((t) => t.id),
        sent: true,
        meterChecked: data.tickets.map((t) => t.id),
      };
      return { data, start: beats(data, none), done: beats(data, all) };
    };
    golden("story", { recorded: story(fromRun), rules: story(rulesStoryData()) });
  });
});
