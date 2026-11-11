// SD-13: the SaaS support and e-commerce packs. Shape, id ranges, rules and history that point at real runbooks,
// labels that cover every ticket, and the rules' scores against the reviewed labels (in-sample, as the page says).
import { describe, it, expect } from "vitest";
import { PACKS } from "../shared/packs";
import { CATALOG } from "../shared/packs/catalog";
import { packView, type AnyPack } from "../src/packs/packView";
import saasLabels from "../../docs/eval/reference-labels.saas-support.json";
import shopLabels from "../../docs/eval/reference-labels.e-commerce.json";

const CASES = [
  {
    id: "saas-support",
    labels: saasLabels.labels,
    ticket: /^T-30\d\d$/,
    history: /^H-31\d\d$/,
    runbook: /^RB-1\d$/,
    hasIncident: true,
  },
  {
    id: "e-commerce",
    labels: shopLabels.labels,
    ticket: /^T-40\d\d$/,
    history: /^H-41\d\d$/,
    runbook: /^RB-2\d$/,
    hasIncident: false,
  },
] as const;

for (const c of CASES) {
  const pack = PACKS[c.id] as unknown as AnyPack;
  describe(`${c.id} pack`, () => {
    it("is synthetic data in its own id ranges, with unique ids", () => {
      expect(pack.tickets.length).toBeGreaterThanOrEqual(20);
      expect(pack.history.length).toBeGreaterThanOrEqual(15);
      for (const t of pack.tickets) expect(t.id).toMatch(c.ticket);
      for (const h of pack.history) expect(h.id).toMatch(c.history);
      for (const r of pack.runbooks) expect(r.id).toMatch(c.runbook);
      const ids = [...pack.tickets, ...pack.history, ...pack.runbooks].map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("has exactly one record-only runbook, with its fixed steps, used 3 or more times in the history", () => {
      const recordOnly = pack.runbooks.filter((r) => r.recordOnly);
      expect(recordOnly).toHaveLength(1);
      expect(pack.recordOnly?.runbook).toBe(recordOnly[0]!.id);
      const uses = pack.history.filter((h) => h.resolution.includes(recordOnly[0]!.id)).length;
      expect(uses).toBeGreaterThanOrEqual(3);
    });

    it("rules, fits, terms, exceptions and history name only this pack's runbooks and labels", () => {
      const runbooks = new Set(pack.runbooks.map((r) => r.id));
      for (const r of pack.rules) {
        expect(pack.components).toContain(r.component);
        if (r.runbook !== "none") expect(runbooks.has(r.runbook), r.why).toBe(true);
      }
      for (const key of [
        ...Object.keys(pack.runbookFits),
        ...Object.keys(pack.runbookTerms),
        ...Object.keys(pack.runbookExceptions),
      ])
        expect(runbooks.has(key), key).toBe(true);
      for (const h of pack.history) {
        const named = /^(RB-\d{2})/.exec(h.resolution)?.[1];
        if (named) expect(runbooks.has(named), h.id).toBe(true);
      }
      expect(Object.keys(pack.componentTerms).sort()).toEqual([...pack.components].sort());
    });

    it(`is listed in the catalog as complete, ${c.hasIncident ? "with" : "with no"} incident walkthrough`, () => {
      expect(CATALOG[c.id]).toMatchObject({ name: pack.name, complete: true, hasIncident: c.hasIncident });
    });

    it("has a reviewed label for every ticket, in queue order, with answers the triage step can give", () => {
      expect(c.labels.map((l) => l.id)).toEqual(pack.tickets.map((t) => t.id));
      for (const l of c.labels) {
        for (const v of l.component) expect(pack.components).toContain(v);
        for (const v of l.runbook) expect(v === "none" || pack.runbooks.some((r) => r.id === v), l.id).toBe(true);
      }
    });
  });
}

describe("the rules' scores on the new packs (in-sample, against the reviewed labels)", () => {
  const view = (i: 0 | 1) => packView(PACKS[CASES[i].id] as unknown as AnyPack, CASES[i].labels).score;

  it("SaaS support: 7 of 25 fully right (6 strict); 14 of 15 on the closed tickets", () => {
    const s = view(0);
    expect(s.lenient).toEqual({ n: 25, fields: { component: 21, severity: 15, action: 16, runbook: 18 }, allFour: 7 });
    expect(s.strict.allFour).toBe(6);
    expect(s.history).toEqual({ same: 14, n: 15 });
  });

  it("E-commerce: 7 of 21 fully right (6 strict); 10 of 15 on the closed tickets", () => {
    const s = view(1);
    expect(s.lenient).toEqual({ n: 21, fields: { component: 18, severity: 14, action: 14, runbook: 15 }, allFour: 7 });
    expect(s.strict.allFour).toBe(6);
    expect(s.history).toEqual({ same: 10, n: 15 });
  });
});
