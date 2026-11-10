// Industry packs: the registry, the request's pack field, and the engine running a second pack it has never seen.
import { describe, it, expect } from "vitest";
import { onRequestPost } from "../functions/api/[step]";
import { ruleTriageFor } from "../functions/_lib/rule-engine";
import { queueSteps } from "../functions/_lib/steps";
import { DEFAULT_PACK, DEFAULT_PACK_ID, PACKS, isPackId } from "../shared/packs";
import * as defaultParts from "../shared/packs/default";
import type { Pack } from "../shared/packs/types";

/** A made-up second pack with its own id ranges (T-3xxx, RB-1x), so nothing in it can be mistaken for EV. */
const STUB: Pack = {
  id: "stub",
  name: "Stub",
  components: ["billing", "login", "question"],
  defaultComponent: "question",
  runbooks: [{ id: "RB-11", title: "Reset a password", scope: "User locked out" }],
  tickets: [
    { id: "T-3001", text: "User locked out after three password attempts." },
    { id: "T-3002", text: "Invoice shows the wrong plan this month." },
  ],
  history: [{ id: "H-3001", text: "Locked out again.", fw: "-", resolution: "RB-11: password reset." }],
  extraIds: [],
  rules: [
    {
      re: /locked out/i,
      component: "login",
      severity: "S3",
      action: "close_with_runbook",
      runbook: "RB-11",
      why: "lockout",
    },
  ],
  componentTerms: { billing: ["invoice", "plan"], login: ["locked", "password"], question: [] },
  runbookTerms: { "RB-11": ["locked", "password"] },
  runbookFits: { "RB-11": ["login"] },
  runbookExceptions: {},
  prompts: {
    system: "STUB SYSTEM",
    severityGuide: "STUB SEVERITY",
    componentGuide: "STUB COMPONENTS",
    actionGuide: "STUB ACTIONS",
    ticketLine: (t) => `${t.id} | ${t.text}`,
    historyLine: (h) => `${h.id} | ${h.text} | resolution: ${h.resolution}`,
  },
};

async function post(step: string, body: unknown) {
  const request = new Request(`http://localhost/api/${step}`, { method: "POST", body: JSON.stringify(body) });
  const res = await onRequestPost({ request, env: { MOCK: "1" }, params: { step } });
  const json = (await res.json()) as Record<string, unknown>;
  delete json["ms"];
  return { status: res.status, body: json };
}

describe("the pack registry", () => {
  it("has the EV charging pack as the default", () => {
    expect(DEFAULT_PACK_ID).toBe("ev-charging");
    expect(PACKS[DEFAULT_PACK_ID]).toBe(DEFAULT_PACK);
    expect(isPackId("ev-charging")).toBe(true);
    expect(isPackId("saas-support")).toBe(false);
    expect(isPackId("__proto__")).toBe(false);
    expect(isPackId(7)).toBe(false);
  });

  it("re-exports by name exactly the default pack's own parts", () => {
    expect(defaultParts.RULES).toBe(DEFAULT_PACK.rules);
    expect(defaultParts.RUNBOOK_EXCEPTIONS).toBe(DEFAULT_PACK.runbookExceptions);
    expect(defaultParts.RUNBOOKS).toBe(DEFAULT_PACK.runbooks);
    expect(defaultParts.DEFAULT_COMPONENT).toBe(DEFAULT_PACK.defaultComponent);
  });
});

describe("the pack a request names", () => {
  it("no pack and the default pack's id give the same answer", async () => {
    const body = { ids: ["T-2040", "T-2041"] };
    const none = await post("triage", body);
    const named = await post("triage", { ...body, pack: "ev-charging" });
    expect(none.status).toBe(200);
    expect(named).toEqual(none);
  });

  it("an unknown pack is a 400, before any step runs", async () => {
    for (const pack of ["saas-support", "__proto__", 7]) {
      const res = await post("triage", { ids: ["T-2040"], pack });
      expect(res, String(pack)).toEqual({ status: 400, body: { error: "Unknown pack." } });
    }
  });

  it("an unknown step is still a 404 whatever the pack", async () => {
    expect((await post("nope", { pack: "saas-support" })).status).toBe(404);
  });
});

describe("the engine on a second pack", () => {
  const steps = queueSteps(STUB);
  const answer = (over: Record<string, unknown>) => ({
    results: [
      {
        id: "T-3001",
        summary: "Locked out",
        component: "login",
        severity: "S3",
        action: "close_with_runbook",
        runbook: "RB-11",
        confidence: 0.9,
        reason: "lockout",
        evidence: "locked out after three password attempts",
        ...over,
      },
    ],
  });
  const input = { ids: ["T-3001"] };

  it("builds the triage prompt from the pack's own wording, tickets and runbooks", () => {
    const prompt = steps.triage.build(input);
    for (const part of ["STUB COMPONENTS", "STUB ACTIONS", "STUB SEVERITY", "RB-11: Reset a password", "T-3001 |"])
      expect(prompt).toContain(part);
    expect(prompt).not.toMatch(/charger|firmware|RB-05|T-20\d\d/);
  });

  it("only offers the pack's own runbooks and labels in the schema", () => {
    const item = (
      steps.triage.schema as { properties: { results: { items: { properties: Record<string, { enum: string[] }> } } } }
    ).properties.results.items.properties;
    expect(item["runbook"]!.enum).toEqual(["RB-11", "none"]);
    expect(item["component"]!.enum).toEqual(["billing", "login", "question"]);
  });

  it("keeps a good answer", () => {
    const [r] = steps.triage.validate(answer({}), input).data.results;
    expect(r).toMatchObject({ source: "ai", runbook: "RB-11", action: "close_with_runbook" });
  });

  it("rejects another pack's runbook (RB-05) whatever the action", () => {
    for (const action of ["close_with_runbook", "needs_human", "escalation_candidate"]) {
      const [r] = steps.triage.validate(answer({ runbook: "RB-05", action }), input).data.results;
      expect(r, action).toMatchObject({ source: "rules", runbook: "RB-11" });
    }
  });

  it("falls back to the pack's rules, with the pack's default label when no rule matches", () => {
    expect(ruleTriageFor(STUB, STUB.tickets[0]!)).toMatchObject({ component: "login", runbook: "RB-11" });
    expect(ruleTriageFor(STUB, STUB.tickets[1]!)).toMatchObject({ component: "question", runbook: "none" });
    expect(steps.patterns.fallback()).toEqual({ patterns: [] });
  });
});
