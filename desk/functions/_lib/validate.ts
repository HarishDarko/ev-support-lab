// Checks applied to model output before anything reaches the screen.
// Evidence must be quoted exactly from the input; numbers must come from the input.
// The checks are in checks.ts; the word lists and runbook exceptions here are the default pack's.
import { DEFAULT_PACK } from "../../shared/packs";
import { exceptionIn, exceptionNamesIn } from "./checks";

export * from "./checks";
export type { RunbookExceptionRule } from "../../shared/packs/types";

const pack = DEFAULT_PACK;

export const COMPONENT_TERMS = pack.componentTerms;
export const RUNBOOK_TERMS = pack.runbookTerms;
export const RUNBOOK_FITS = pack.runbookFits;
export const RUNBOOK_EXCEPTIONS = pack.runbookExceptions;

/** The first exception that applies to a runbook for this ticket, or null. */
export const runbookException = (runbook: string, text: unknown, fw?: string) =>
  exceptionIn(pack.runbookExceptions, runbook, text, fw);
export const exceptionNames = (runbook: string): string[] => exceptionNamesIn(pack.runbookExceptions, runbook);
