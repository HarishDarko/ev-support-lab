// The steps of a run, for any pack. Triage and patterns are built here from the pack's queue, history, runbooks,
// rules and word lists; the incident steps come from the pack itself. A request with no pack gets the default pack.
import { DEFAULT_PACK, DEFAULT_PACK_ID, PACKS, type PackId } from "../../shared/packs";
import { INCIDENT_SOURCES, INCIDENT_STEPS } from "../../shared/packs/steps";
import type { Pack, PackHistoryItem, PackTicket } from "../../shared/packs/types";
import { ValidationError, check, exceptionIn, mentions, quoted } from "./checks";
import { StepError } from "./errors";
import { bool, obj, runbookListOf, severity, str, strs, type Step } from "./kit";
import { ruleTriageFor, rulePatternsFor } from "./rule-engine";
import { shortChainSteps } from "./short-chain";
import type { StepInput } from "./types";

export type { Step } from "./kit";
export type {
  ClassifyModel,
  HandoffModel,
  InvestigationModel,
  KbModel,
  ShiftnoteModel,
  VerifyModel,
} from "../../shared/packs/steps";

// ---- triage ----

export interface TriageModelResult {
  id: string;
  summary: string;
  component: string;
  severity: string;
  action: string;
  runbook: string;
  confidence: number;
  reason: string;
  evidence: string;
}

// ---- patterns ----

export interface PatternModel {
  name: string;
  ticket_ids: string[];
  history_ids: string[];
  recurring: boolean;
  why_grouped: string;
  next_step: string;
}

/** One earlier triage result as the client sends it back. Untrusted. */
type ClientTriage = { id?: unknown; component?: unknown; severity?: unknown; action?: unknown } | null | undefined;

/** Triage and patterns for one pack. */
export function queueSteps<C extends string, T extends PackTicket, H extends PackHistoryItem>(pack: Pack<C, T, H>) {
  const runbookList = runbookListOf(pack.runbooks);
  const runbookIds = new Set<string>(pack.runbooks.map((r) => r.id));
  const ticketById: Record<string, T> = Object.fromEntries(pack.tickets.map((t) => [t.id, t]));
  const ticketIds = new Set<string>(pack.tickets.map((t) => t.id));
  const historyIds = new Set<string>(pack.history.map((h) => h.id));

  const triage = {
    deep: false,
    maxTokens: 4000,
    schema: obj({
      results: {
        type: "array",
        items: obj({
          id: str,
          summary: str,
          component: { type: "string", enum: pack.components },
          severity,
          action: { type: "string", enum: ["close_with_runbook", "needs_human", "escalation_candidate", "info_only"] },
          runbook: { type: "string", enum: [...runbookIds, "none"] },
          confidence: { type: "number" },
          reason: str,
          evidence: str,
        }),
      },
    }),
    ids(input: StepInput): string[] {
      const ids: string[] = Array.isArray(input?.ids) ? (input.ids as string[]).filter((id) => ticketIds.has(id)) : [];
      if (!ids.length || ids.length > 10) throw new StepError("Send 1–10 known ticket ids.", 400);
      return ids;
    },
    build(input: StepInput): string {
      const ids = this.ids(input);
      return `Triage these open internal support tickets. For each ticket return:
- summary: at most 10 words
- component: ${pack.prompts.componentGuide}
- severity
- action: ${pack.prompts.actionGuide}
- runbook: the runbook id if action is close_with_runbook (or if a runbook is the obvious first step), else "none"
- confidence: 0 to 1
- reason: one short sentence
- evidence: one continuous run of 3 to 12 words copied from the ticket text, character for character, in the ticket's own order. Do not join or reorder sentences.

${pack.prompts.severityGuide}

Runbooks in the knowledge base:
${runbookList}

Tickets:
${pack.tickets
  .filter((t) => ids.includes(t.id))
  .map(pack.prompts.ticketLine)
  .join("\n")}`;
    },
    // Per ticket, the AI result is kept only if: its quote is really in the ticket, its label fits the ticket,
    // and its runbook fits its label. A closure whose runbook precondition fails becomes "needs a person".
    // Anything else is decided by the rules, with the reason recorded.
    validate(data: { results: TriageModelResult[] }, input: StepInput) {
      const ids = this.ids(input);
      const byId: Record<string, TriageModelResult | undefined> = Object.fromEntries(
        data.results.map((r) => [r.id, r]),
      );
      const n = { quoted: 0, fits: 0, runbook: 0, blocked: 0, weak: 0, ai: 0, noRunbook: 0 };
      const results = ids.map((id) => {
        const r = byId[id];
        const text = ticketById[id]!.text;
        const reject = (why: string) => ({
          ...ruleTriageFor(pack, ticketById[id]!),
          source: "rules",
          quote_verified: false,
          rejected_quote: r?.evidence ?? "",
          fallback_reason: why,
        });
        if (!r) return reject("AI skipped this ticket");
        if (!quoted(r.evidence, text)) return reject("AI quote not found in the ticket");
        n.quoted += 1;
        if (!mentions(text, pack.componentTerms[r.component] ?? []))
          return reject(`AI label "${r.component}" doesn't fit the ticket`);
        n.fits += 1;
        // A closure always names a real runbook: no runbook means nothing to approve.
        if (r.action === "close_with_runbook" && !runbookIds.has(r.runbook)) {
          n.noRunbook += 1;
          return reject("AI proposed a closure with no runbook");
        }
        // A runbook that is not in this pack (another pack's id, say) is never kept, whatever the action.
        if (r.runbook !== "none" && !runbookIds.has(r.runbook))
          return reject(`Runbook ${r.runbook} is not in this pack`);
        const fits = pack.runbookFits[r.runbook];
        if (r.runbook !== "none" && fits && !fits.includes(r.component))
          return reject(`Runbook ${r.runbook} doesn't apply to ${r.component}`);
        if (r.runbook !== "none" && pack.runbookTerms[r.runbook] && !mentions(text, pack.runbookTerms[r.runbook]!))
          return reject(`Runbook ${r.runbook} doesn't match what the ticket describes`);
        n.runbook += 1;
        n.ai += 1;
        const out = {
          ...r,
          source: "ai",
          quote_verified: true,
          support: mentions(r.evidence, pack.componentTerms[r.component] ?? []) ? "strong" : "weak",
        };
        if (out.support === "weak") n.weak += 1;
        const exception =
          r.action === "close_with_runbook"
            ? exceptionIn(pack.runbookExceptions, r.runbook, text, ticketById[id]!.fw)
            : null;
        if (exception) {
          n.blocked += 1;
          return {
            ...out,
            action: "needs_human",
            precondition: `${r.runbook} exception (${exception.name}): "${exception.hit}"`,
          };
        }
        return out;
      });
      return {
        data: { results },
        checks: [
          check("Quote found in the ticket", n.quoted === ids.length, `${n.quoted} of ${ids.length}`),
          check("Label fits the ticket", n.fits === n.quoted, `${n.fits} of ${n.quoted}`),
          check(
            "Every closure names a runbook",
            n.noRunbook === 0,
            n.noRunbook ? `${n.noRunbook} closure${n.noRunbook > 1 ? "s" : ""} without one, decided by rules` : "all",
          ),
          check(
            "Runbook fits the label",
            n.runbook === n.fits - n.noRunbook,
            `${n.runbook} of ${n.fits - n.noRunbook}`,
          ),
          check("Quote names the label's subject", n.weak === 0, n.weak ? `${n.weak} weak, kept and marked` : "all"),
          check(
            "Runbook exceptions",
            true,
            n.blocked ? `${n.blocked} closure${n.blocked > 1 ? "s" : ""} blocked, sent to a person` : "none applied",
          ),
        ],
      };
    },
    fallback(input: StepInput) {
      return {
        results: this.ids(input).map((id) => ({
          ...ruleTriageFor(pack, ticketById[id]!),
          source: "rules",
          quote_verified: false,
        })),
      };
    },
  };

  const patterns = {
    deep: true,
    maxTokens: 6000,
    schema: obj({
      patterns: {
        type: "array",
        items: obj({
          name: str,
          ticket_ids: strs,
          history_ids: strs,
          recurring: bool,
          why_grouped: str,
          next_step: str,
        }),
      },
    }),
    build(input: StepInput): string {
      const triageIn: ClientTriage[] = Array.isArray(input?.triage) ? (input.triage as ClientTriage[]) : [];
      const byId = Object.fromEntries(
        triageIn.filter((r) => ticketIds.has(r?.id as string)).map((r) => [r!.id as string, r!]),
      );
      const open = pack.tickets
        .map(
          (t) =>
            `${pack.prompts.ticketLine(t)}${byId[t.id] ? ` | triage: ${String(byId[t.id]!.component)}, ${String(byId[t.id]!.severity)}, ${String(byId[t.id]!.action)}` : ""}`,
        )
        .join("\n");
      return `Group these open tickets into patterns: tickets that describe the same underlying problem. Then find earlier closed tickets with the same problem.

Rules:
- Only group tickets with genuinely the same problem. Do not create catch-all groups for unrelated or one-off tickets; leave those out.
- A pattern needs at least 2 open tickets.
- recurring: true if the closed history shows the same problem before.
- name: at most 8 words, plain language.
- why_grouped: one sentence naming the shared signal.
- next_step: one sentence.

Open tickets:
${open}

Runbooks:
${runbookList}

Closed history (last 21 days):
${pack.history.map(pack.prompts.historyLine).join("\n")}`;
    },
    validate(data: { patterns: PatternModel[] }) {
      let dropped = 0;
      for (const p of data.patterns) {
        const before = p.ticket_ids.length + p.history_ids.length;
        p.ticket_ids = [...new Set(p.ticket_ids.filter((id) => ticketIds.has(id)))];
        p.history_ids = [...new Set(p.history_ids.filter((id) => historyIds.has(id)))];
        dropped += before - p.ticket_ids.length - p.history_ids.length;
      }
      data.patterns = data.patterns.filter(
        (p) => p.ticket_ids.length >= 2 && !/one-?off|misc|unrelated|other/i.test(p.name),
      );
      if (!data.patterns.length) throw new ValidationError("No usable patterns");
      return {
        data,
        checks: [
          check(
            "Ticket ids exist in the data",
            dropped === 0,
            dropped ? `${dropped} unknown ids removed` : "all matched",
          ),
        ],
      };
    },
    fallback: () => rulePatternsFor(pack),
  };

  return { triage, patterns };
}

const build = (id: PackId) => ({ ...queueSteps(PACKS[id]), ...INCIDENT_STEPS[id] }) satisfies Record<string, Step>;
const built = new Map<PackId, ReturnType<typeof build>>();
/** Every step for a pack, built once. */
export function stepsFor(id: PackId = DEFAULT_PACK_ID): ReturnType<typeof build> {
  let steps = built.get(id);
  if (!steps) built.set(id, (steps = build(id)));
  return steps;
}

/** The steps for a pack with no incident: triage, patterns and the short chain (no investigation, handoff or
 * verification). */
export const queueOnlySteps = <C extends string, T extends PackTicket, H extends PackHistoryItem>(
  pack: Pack<C, T, H>,
) => ({ ...queueSteps(pack), ...shortChainSteps(pack) }) satisfies Record<string, Step>;

/** The default pack's steps. */
export const STEPS = stepsFor();

// The default pack's fixed texts, which the UI and the tests import from here.
export const METER_STEP = DEFAULT_PACK.recordOnly.confirmStep;
export const BILLING_STEP = DEFAULT_PACK.recordOnly.reviewStep;
export const CONFIRM_METER = DEFAULT_PACK.recordOnly.confirmNote;
export const SOURCES: Record<string, string> = INCIDENT_SOURCES[DEFAULT_PACK_ID];
