// Errors a step can raise, and the input guard every step uses. Neutral: no model SDK, no industry content.
import type { ShiftSummary } from "../../shared/packs/types";
import type { Usage } from "./types";

export class StepError extends Error {
  status: number;
  /** Set when the model call spent tokens before failing, so the cost is still counted. */
  model?: string;
  usage?: Usage;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

/**
 * Client text that goes inside a triple-quote fence in a prompt: every double quote becomes a single one, so the
 * text cannot close the fence (a lone quote next to the closing fence would break it too).
 */
export const fenced = (text: string): string => text.replace(/"/g, "'");

/**
 * The client's shift summary with every field checked: a field of the wrong type is dropped, and only the string
 * items of the needs-a-person list are kept. The rules' shift notes read only this, so a crafted body gives a plain
 * note instead of an error.
 */
export function shiftSummaryOf(value: unknown): ShiftSummary {
  const s = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const e = s["escalated"] as Record<string, unknown> | null | undefined;
  return {
    open_at_start: count(s["open_at_start"]),
    approved_for_closure: count(s["approved_for_closure"]),
    needs_a_person: Array.isArray(s["needs_a_person"])
      ? s["needs_a_person"].filter((x): x is string => typeof x === "string")
      : undefined,
    escalated:
      e && typeof e === "object" && typeof e["ref"] === "string" && typeof e["title"] === "string"
        ? { ref: e["ref"], title: e["title"] }
        : undefined,
  };
}

// Trims client-supplied JSON (earlier model output) before it goes back into a prompt.
export function clip(value: unknown, max = 6000): string {
  const text = JSON.stringify(value ?? null);
  if (text.length > max) throw new StepError("Input too large.", 400);
  return text;
}
