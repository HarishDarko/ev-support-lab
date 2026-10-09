// Checks applied to model output before anything reaches the screen.
// Evidence must be quoted exactly from the input; numbers must come from the input.
import type { Check } from "./types";

export class ValidationError extends Error {}

export function normalize(text: unknown): string {
  // Model output is untrusted: coerce whatever arrives, exactly as the prototype did.
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(text ?? "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[→]/g, "->")
    .replace(/[←]/g, "<-")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// True when the quote appears in the source text, ignoring case and spacing.
// A quote shortened with an ellipsis passes only if every piece appears in the source, in order.
export function quoted(quote: unknown, source: unknown): boolean {
  const src = normalize(source);
  const pieces = normalize(quote)
    .split(/\.\.\.|…/)
    .map((p) => p.replace(/^["'.,\s]+|["'.,\s]+$/g, ""))
    .filter(Boolean);
  if (!pieces.length || pieces.join("").length < 6) return false;
  let from = 0;
  for (const piece of pieces) {
    const at = src.indexOf(piece, from);
    if (at < 0) return false;
    from = at + piece.length;
  }
  return true;
}

// What each label and runbook must be about. A label whose words never appear in the ticket is rejected;
// a quote that doesn't contain them is accepted but marked as weak support.
export const COMPONENT_TERMS: Record<string, string[]> = {
  "session-state": ["session", "charging", "in use", "active", "idle fee", "energy", "open"],
  authorization: ["badge", "rfid", "card", "auth", "rejected"],
  payments: ["hold", "payment", "refund", "charge", "$"],
  connectivity: ["heartbeat", "offline", "connection", "online"],
  "host-portal": ["portal", "export", "report", "locked", "access"],
  "driver-app": ["app", "android", "launch", "price"],
  pricing: ["pricing", "price", "rate", "time-of-use"],
  "hardware-field": ["holster", "cable", "connector", "kw", "part", "reader", "derat", "temperature"],
  roaming: ["roaming", "partner"],
  "platform-api": ["api", "5xx", "alert"],
  "request-or-question": [],
};
// What the ticket must mention for a runbook to apply at all.
export const RUNBOOK_TERMS: Record<string, string[]> = {
  "RB-01": ["badge", "rfid", "card", "auth"],
  "RB-02": ["hold"],
  "RB-03": ["heartbeat", "offline"],
  "RB-04": ["export", "report"],
  "RB-05": ["charging", "in use", "active session", "energy", "open"],
  "RB-06": ["locked", "access", "password"],
  "RB-07": ["pricing", "price", "time-of-use", "rate"],
};
export const RUNBOOK_FITS: Record<string, string[]> = {
  "RB-01": ["authorization"],
  "RB-02": ["payments"],
  "RB-03": ["connectivity"],
  "RB-04": ["host-portal"],
  "RB-05": ["session-state"],
  "RB-06": ["host-portal"],
  "RB-07": ["pricing", "request-or-question"],
};
// A runbook closure is not allowed when the ticket says the runbook already failed or the case is outside its scope.
// Each exception is a named test, so the trace can say exactly which ones were checked.
// Energy still moving. A wording check, not a parser, and not proof the meter is flat: it catches common ways a
// ticket says energy is still moving, so a person confirms the meter before RB-05 either way.
// In any sentence about energy or power, a motion word counts unless a negation is one of the two words right
// before it (ignoring words like "is" or "currently"), or it continues a negated one with "or"/"nor".
// A negated "stopped" ("hasn't stopped flowing") means it is still moving. A meter reading that goes up counts too.
const NEGATOR = /^(?:no|not|never|neither|without|stopped|nothing|zero)$|n['’]t$/i;
const FILLER =
  /^(?:is|are|was|were|be|been|being|has|have|had|currently|now|steadily|really|actually|any|more|longer|still|also|just|keep|keeps|kept|on|even|completely|fully|entirely|totally)$/i;
const BOUNDARY = /^(?:and|but|then|yet|while|despite|so|though|although)$/i; // a negation doesn't carry past these
const NOT_ENERGY =
  /^(?:fee|fees|price|prices|cost|costs|charge|charges|bill|bills|time|count|counts|calls|complaints|queue)$/i;
const MOTION =
  /\b(?:ris(?:e|es|ing)|rose|climb(?:s|ing)|flow(?:s|ing)|increas(?:e|es|ing)|go(?:es|ing)? up|went up|deliver(?:s|ing)|(?:being|still) delivered|advanc(?:e|es|ed|ing)|draw(?:s|ing)|ramp(?:s|ing)(?: up)?|continu(?:e|es|ing) to (?:rise|climb|flow|increase))\b/gi;
const ENERGY_WORD = /\b(?:energy|meter|power|current|amps?|watts?)\b|(?:\b|\d)kwh?\b/i;
const PRONOUN = /^\s*(?:it|this|that)\b/i; // "Energy was flat. It is now increasing."
const METER_UP = /\bfrom\s+(\d+(?:\.\d+)?)\s*(?:kwh)?\s*(?:to|->|→)\s*(\d+(?:\.\d+)?)/i;
const WORD = /[\w'’-]+/g;
function energyMoving(text: string): string | null {
  // Sentences end at . ; ! ? or a line break, but not at the decimal point in "7.2 kW".
  let previousAboutEnergy: boolean = false;
  for (const sentence of text.split(/[;!?\n]|\.(?!\d)/)) {
    const aboutEnergy: boolean = ENERGY_WORD.test(sentence) || (previousAboutEnergy && PRONOUN.test(sentence));
    previousAboutEnergy = aboutEnergy;
    if (!aboutEnergy) continue;
    const reading = sentence.match(METER_UP);
    const readingNegated =
      reading &&
      (sentence.slice(0, reading.index).match(WORD) ?? [])
        .filter((w) => !FILLER.test(w))
        .slice(-3)
        .some((w) => NEGATOR.test(w));
    if (reading && !readingNegated && Number(reading[2]) > Number(reading[1])) return reading[0];
    let negatedUntil = -1;
    for (const m of sentence.matchAll(MOTION)) {
      const all = (sentence.slice(0, m.index).match(WORD) ?? []).filter((w) => !FILLER.test(w));
      const cut = all.findLastIndex((w) => BOUNDARY.test(w));
      const words = all.slice(cut + 1);
      if (NOT_ENERGY.test(all.at(-1) ?? "")) continue; // "the idle fee is increasing" is not energy
      const between = negatedUntil >= 0 ? (sentence.slice(negatedUntil, m.index).match(WORD) ?? []) : [];
      let negated =
        words.slice(-2).some((w) => NEGATOR.test(w)) ||
        (between.length === 1 && /^(?:or|nor)$/i.test(between[0] ?? "")) ||
        (/^(?:or|nor)$/i.test(words.at(-2) ?? "") && NEGATOR.test(words.at(-4) ?? "")); // "no energy or kWh increasing"
      if (/^stopped$/i.test(words.at(-1) ?? "") && NEGATOR.test(words.at(-2) ?? "")) negated = false; // "hasn't stopped flowing"
      if (!negated) return `${all.slice(-3).join(" ")} ${m[0]}`.trim();
      negatedUntil = m.index + m[0].length;
    }
  }
  return null;
}
const OTHER_FIRMWARE = /\bFW-(?![AB]\b)[A-Z]\b/i;

export interface RunbookExceptionRule {
  name: string;
  test: (text: string, fw?: string) => string | null | undefined;
}
export const RUNBOOK_EXCEPTIONS: Record<string, RunbookExceptionRule[]> = {
  "RB-03": [
    {
      name: "reset already tried",
      test: (text) =>
        text.match(/no response|reset (?:failed|did not)|earlier offline events|third (?:offline )?event/i)?.[0],
    },
  ],
  "RB-05": [
    // "Energy still flowing" is an exception; "no energy flowing" or "energy stopped climbing" is the known pattern.
    { name: "energy still moving", test: (text) => energyMoving(text) },
    {
      name: "no connection drop near unplug",
      test: (text) =>
        text.match(
          /\bno (?:connection |websocket )?(?:drop|disconnect)|\b(?:did not|didn't|never) (?:drop|disconnect)|\bstayed (?:online|connected)\b/i,
        )?.[0],
    },
    { name: "firmware outside FW-A and FW-B", test: (text, fw = "") => `${text} ${fw}`.match(OTHER_FIRMWARE)?.[0] },
  ],
};
// The first exception that applies to a runbook for this ticket, or null.
export function runbookException(runbook: string, text: unknown, fw?: string): { name: string; hit: string } | null {
  for (const e of RUNBOOK_EXCEPTIONS[runbook] ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const hit = e.test(String(text ?? ""), fw);
    if (hit) return { name: e.name, hit };
  }
  return null;
}
export const exceptionNames = (runbook: string): string[] => (RUNBOOK_EXCEPTIONS[runbook] ?? []).map((e) => e.name);
export const mentions = (text: unknown, terms: string[]): boolean =>
  terms.length === 0 || terms.some((t) => normalize(text).includes(t));

// Numbers of 4 or more, or with decimals, that appear in the output but nowhere in the input.
export function ungroundedNumbers(output: unknown, input: unknown): string[] {
  const found = (text: unknown) => new Set(String(text).match(/\d+(?:\.\d+)?/g) ?? []);
  const allowed = found(input);
  const out: string[] = [];
  for (const n of found(JSON.stringify(output))) {
    if ((Number(n) >= 4 || n.includes(".")) && !allowed.has(n)) out.push(n);
  }
  return out;
}

export const check = (name: string, passed: boolean, detail = ""): Check => ({ name, passed, detail });
