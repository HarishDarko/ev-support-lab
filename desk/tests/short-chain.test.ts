// SD-12: the short chain for a pack with no incident. Triage and patterns as usual, then a knowledge base article
// written from the top recurring pattern, the new-ticket check against that article, and the end-of-shift note,
// all from the pack's own tickets, history and runbooks. Uses a made-up pack; the EV chain is pinned by the goldens.
import { describe, it, expect } from "vitest";
import { shortChainSteps, topPattern } from "../functions/_lib/short-chain";
import { StepError } from "../functions/_lib/errors";
import type { Pack } from "../shared/packs/types";
import { runShortChain, shortChainCalls } from "../src/run/short";
import type { StepKey, StepResult } from "../src/run/types";

const STUB: Pack = {
  id: "stub-shop",
  name: "Stub shop",
  complete: false,
  components: ["orders", "payments", "question"],
  defaultComponent: "question",
  runbooks: [
    {
      id: "RB-21",
      title: "Release a stuck order hold",
      scope: "Order stuck in Pending after payment",
      recordOnly: true,
    },
    { id: "RB-22", title: "Resend the receipt", scope: "Customer did not get a receipt" },
  ],
  tickets: [
    { id: "T-4001", text: "Order 1182 stuck in Pending after payment went through." },
    { id: "T-4002", text: "Order 1190 stuck in Pending, card was charged." },
    { id: "T-4003", text: "Customer asks for a receipt that never arrived." },
    { id: "T-4004", text: "Question about shipping times." },
  ],
  history: [
    { id: "H-4001", text: "Order stuck in Pending.", fw: "-", resolution: "RB-21: hold released." },
    { id: "H-4002", text: "No receipt.", fw: "-", resolution: "RB-22: receipt resent." },
  ],
  extraIds: [],
  rules: [
    {
      re: /stuck in pending/i,
      component: "orders",
      severity: "S2",
      action: "close_with_runbook",
      runbook: "RB-21",
      why: "stuck order",
    },
    {
      re: /receipt/i,
      component: "payments",
      severity: "S4",
      action: "close_with_runbook",
      runbook: "RB-22",
      why: "receipt",
    },
  ],
  componentTerms: { orders: ["order", "pending"], payments: ["receipt", "card"], question: [] },
  runbookTerms: { "RB-21": ["pending"], "RB-22": ["receipt"] },
  runbookFits: { "RB-21": ["orders"], "RB-22": ["payments"] },
  runbookExceptions: {
    "RB-21": [{ name: "charged twice", test: (text) => /charged twice|double charge/i.exec(text)?.[0] }],
  },
  recordOnly: {
    runbook: "RB-21",
    confirmStep: "Confirm the payment settled before RB-21.",
    reviewStep: "Flag the order for a payments review.",
    confirmNote: "Before RB-21, a person checks the payment settled.",
  },
  newTicketExample: "Order 1201 stuck in Pending after payment.",
  fields: [],
  prompts: {
    system: "STUB SYSTEM",
    severityGuide: "STUB SEVERITY",
    componentGuide: "STUB COMPONENTS",
    actionGuide: "STUB ACTIONS",
    ticketLine: (t) => `${t.id} | ${t.text}`,
    historyLine: (h) => `${h.id} | ${h.text} | resolution: ${h.resolution}`,
  },
};

const steps = shortChainSteps(STUB);
const pattern = {
  name: "Orders stuck in Pending",
  ticket_ids: ["T-4001", "T-4002"],
  history_ids: ["H-4001"],
  recurring: true,
  why_grouped: "Same stuck order state.",
  next_step: "Apply RB-21.",
};
const article = {
  title: "Order stuck in Pending after payment",
  applies_when: ["Order shows Pending after payment."],
  how_to_confirm: ["Payment shows as settled."],
  steps: ["Apply RB-21: release the hold."],
  escalate_if: ["Charged twice."],
  status_note: "Two open tickets and one earlier one.",
  related: ["T-4001", "T-4002", "RB-21"],
};

describe("topPattern", () => {
  it("prefers a recurring pattern, then the one with most tickets", () => {
    const a = { ...pattern, name: "A", recurring: false, ticket_ids: ["T-4001", "T-4002", "T-4003"] };
    const b = { ...pattern, name: "B", recurring: true, ticket_ids: ["T-4001", "T-4002"] };
    const c = { ...pattern, name: "C", recurring: true, ticket_ids: ["T-4001", "T-4002", "T-4004"] };
    expect(topPattern([a, b, c])?.name).toBe("C");
    expect(topPattern([a])?.name).toBe("A");
    expect(topPattern([])).toBeNull();
  });
});

describe("short chain: knowledge base article from the top pattern", () => {
  it("builds the prompt from the pattern's own tickets, history and the pack's runbooks", () => {
    const prompt = steps.kb.build({ pattern });
    for (const part of ["Orders stuck in Pending", "T-4001 | Order 1182", "H-4001 | Order stuck", "RB-21: Release"])
      expect(prompt).toContain(part);
    expect(prompt).not.toContain("T-4003");
    expect(prompt).not.toMatch(/charger|firmware|meter|RB-05|Ended|FW-B/i);
  });

  it("refuses a pattern with no ticket from this pack", () => {
    expect(() => steps.kb.build({ pattern: { ...pattern, ticket_ids: ["T-2040"] } })).toThrow(StepError);
    expect(() => steps.kb.build({})).toThrow(StepError);
  });

  it("puts the record-only runbook's fixed check first and review last, and drops unknown ids", () => {
    const { data } = steps.kb.validate(
      { ...article, related: ["T-4001", "T-2040", "RB-05", "RB-21"] },
      { pattern },
      steps.kb.build({ pattern }),
    );
    expect(data.steps[0]).toBe(STUB.recordOnly!.confirmStep);
    expect(data.steps.at(-1)).toBe(STUB.recordOnly!.reviewStep);
    expect(data.related).toEqual(["T-4001", "RB-21"]);
  });

  it("falls back to an article built from the pack's data", () => {
    const kb = steps.kb.fallback({ pattern });
    expect(kb.title).toBe("Orders stuck in Pending");
    expect(kb.steps).toEqual([
      STUB.recordOnly!.confirmStep,
      "Apply RB-21: Release a stuck order hold.",
      STUB.recordOnly!.reviewStep,
    ]);
    expect(kb.escalate_if).toEqual(["Charged twice."]);
    expect(kb.related).toEqual(["T-4001", "T-4002", "H-4001", "RB-21"]);
  });
});

describe("short chain: new-ticket check against that article", () => {
  it("matches a ticket the article covers and carries the pack's confirm note", () => {
    const data = steps.classify.fallback({ text: STUB.newTicketExample, article });
    expect(data).toMatchObject({ matches_known_pattern: true, matched_article: article.title, escalate: false });
    expect(data.confirm).toBe(STUB.recordOnly!.confirmNote);
  });

  it("sends a ticket that hits the runbook's exception to engineering, even if the model matched it", () => {
    const text = "Order 1203 stuck in Pending and the card was charged twice.";
    const { data } = steps.classify.validate(
      {
        component: "orders",
        severity: "S2",
        matches_known_pattern: true,
        matched_article: article.title,
        suggested_action: "Apply RB-21.",
        escalate: false,
        why: "Same pattern.",
      },
      { text, article },
    );
    expect(data).toMatchObject({ matches_known_pattern: false, matched_article: "none", escalate: true, confirm: "" });
    expect(steps.classify.fallback({ text, article })).toMatchObject({ escalate: true, matches_known_pattern: false });
  });

  it("does not match a ticket outside the article", () => {
    expect(steps.classify.fallback({ text: "Question about shipping times.", article })).toMatchObject({
      matches_known_pattern: false,
      matched_article: "none",
      escalate: false,
    });
  });
});

describe("short chain: end-of-shift note with no incident", () => {
  it("says what was closed and what needs a person, without an engineering escalation", () => {
    const note = steps.shiftnote.fallback({
      summary: {
        open_at_start: 4,
        approved_for_closure: 2,
        needs_a_person: ["T-4004: Question about shipping times."],
      },
    });
    expect(note.headline).toBe("Queue started at 4; 2 approved for closure by runbook.");
    expect(note.needs_you).toEqual(["T-4004: Question about shipping times. Owner: next shift."]);
    expect(note.escalated).toEqual(["Nothing sent to engineering yet."]);
    expect(JSON.stringify(note)).not.toMatch(/stuck-session|India|RB-05/);
  });

  it("builds its prompt without any incident or handoff", () => {
    const prompt = steps.shiftnote.build({ summary: { open_at_start: 4 } });
    expect(prompt).toContain('"open_at_start":4');
    expect(prompt).not.toMatch(/India|engineering on-call|ET\b/);
  });
});

describe("runShortChain (the client side, with a fake server)", () => {
  const answer = (step: StepKey, body: { ids?: string[] }): StepResult<unknown> => {
    const data =
      step === "triage"
        ? {
            results: (body.ids ?? []).map((id) => ({
              id,
              action: id === "T-4004" ? "needs_human" : "close_with_runbook",
              summary: id,
            })),
          }
        : step === "patterns"
          ? { patterns: [pattern] }
          : step === "kb"
            ? article
            : {};
    return { data, trace: { source: "rules", cost: 0 } as StepResult<unknown>["trace"], ms: 1 };
  };

  it("runs triage, patterns, the article, then the check and the note, naming the pack every time", async () => {
    const calls: [StepKey, Record<string, unknown>][] = [];
    const report = await runShortChain({
      pack: { id: STUB.id, ticketIds: STUB.tickets.map((t) => t.id), newTicketExample: STUB.newTicketExample },
      post: async (step, body) => {
        calls.push([step, body as Record<string, unknown>]);
        return answer(step, body as { ids?: string[] });
      },
    });
    expect(calls.map(([s]) => s)).toEqual(["triage", "patterns", "kb", "classify", "shiftnote"]);
    expect(calls.every(([, b]) => b["pack"] === "stub-shop")).toBe(true);
    expect(calls[2]![1]["pattern"]).toEqual(pattern);
    expect(calls[3]![1]).toMatchObject({ text: STUB.newTicketExample, article });
    expect(calls[4]![1]["summary"]).toEqual({
      open_at_start: 4,
      approved_for_closure: 3,
      needs_a_person: ["T-4004: T-4004"],
    });
    expect(report).toMatchObject({ answered: 5, total: shortChainCalls(4), failures: [] });
  });

  it("skips the article and the check when no pattern was found, and says why", async () => {
    const report = await runShortChain({
      pack: { id: STUB.id, ticketIds: STUB.tickets.map((t) => t.id), newTicketExample: STUB.newTicketExample },
      post: async (step, body) =>
        step === "patterns"
          ? { ...answer(step, {}), data: { patterns: [] } }
          : answer(step, body as { ids?: string[] }),
    });
    expect(report.failures.map((f) => f.step)).toEqual(["kb", "classify"]);
    expect(report.failures[0]!.message).toBe("Skipped: no recurring pattern to write an article about.");
  });
});
