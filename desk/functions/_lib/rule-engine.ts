// The deterministic triage fallback: keyword rules decide, runbook exceptions still apply, and patterns are
// groups of tickets the same rule matched. Neutral: every rule, word list and ticket comes from the pack.
import type { Pack, PackTicket, Severity, TriageAction, TriageRule } from "../../shared/packs/types";
import { exceptionIn } from "./checks";

/** What the rules need from a pack. */
export type TriageRules<C extends string = string> = Pick<Pack<C>, "rules" | "runbookExceptions" | "defaultComponent">;

const words = (text: string, n: number): string =>
  text
    .split(/\s+/)
    .slice(0, n)
    .join(" ")
    .replace(/[.,;:]$/, "");

/** The ticket fields the rules read. A new, unsaved ticket has only an id and its text. */
export type TriageTicket = PackTicket;

export interface RuleTriageResult<C extends string = string> {
  id: string;
  summary: string;
  component: C;
  severity: Severity;
  action: TriageAction;
  runbook: string;
  confidence: number;
  reason: string;
  evidence: string;
}

export function ruleTriageFor<C extends string>(pack: TriageRules<C>, ticket: TriageTicket): RuleTriageResult<C> {
  const rule = pack.rules.find((r) => r.re.test(ticket.text));
  const match = rule ? ticket.text.match(rule.re)?.[0] : "";
  // The same runbook exceptions as the AI path: a closure outside the runbook's scope goes to a person.
  const exception =
    rule?.action === "close_with_runbook"
      ? exceptionIn(pack.runbookExceptions, rule.runbook, ticket.text, ticket.fw)
      : null;
  return {
    id: ticket.id,
    summary: words(ticket.text, 9),
    component: rule?.component ?? pack.defaultComponent,
    severity: rule?.severity ?? "S4",
    action: exception ? "needs_human" : (rule?.action ?? "needs_human"),
    runbook: rule?.runbook ?? "none",
    confidence: rule ? 0.6 : 0.3,
    reason: exception
      ? `Rules fallback: matched "${match}", but ${rule!.runbook} doesn't apply (${exception.name}: "${exception.hit}").`
      : rule
        ? `Rules fallback: matched "${match}" (${rule.why}).`
        : "Rules fallback: no rule matched, so a person decides.",
    evidence: match || words(ticket.text, 6),
  };
}

export function rulePatternsFor(
  pack: Pick<Pack, "rules" | "runbookExceptions" | "defaultComponent" | "tickets" | "history">,
) {
  const groups = new Map<string, { rule: TriageRule | undefined; ids: string[] }>();
  for (const t of pack.tickets) {
    const r = ruleTriageFor(pack, t);
    if (r.component === pack.defaultComponent) continue;
    const key = `${r.component}|${r.runbook}`;
    if (!groups.has(key))
      groups.set(key, {
        rule: pack.rules.find((x) => x.component === r.component && x.runbook === r.runbook),
        ids: [],
      });
    groups.get(key)!.ids.push(t.id);
  }
  const out = [];
  for (const { rule, ids } of groups.values()) {
    if (ids.length < 2 || !rule) continue;
    const history = pack.history
      .filter(
        (h) =>
          rule.re.test(h.text) ||
          h.resolution.startsWith(`${rule.runbook}:`) ||
          h.resolution.startsWith(`${rule.runbook} `),
      )
      .map((h) => h.id);
    out.push({
      name: rule.why.charAt(0).toUpperCase() + rule.why.slice(1),
      ticket_ids: ids,
      history_ids: history,
      recurring: history.length > 0,
      why_grouped: `Same keyword rule (${rule.why}) and runbook ${rule.runbook}.`,
      next_step:
        rule.runbook !== "none" ? `Apply ${rule.runbook} and review the pattern.` : "A person reviews the group.",
    });
  }
  return { patterns: out };
}
