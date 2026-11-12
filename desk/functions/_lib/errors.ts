// Errors a step can raise, and the input guard every step uses. Neutral: no model SDK, no industry content.
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

// Trims client-supplied JSON (earlier model output) before it goes back into a prompt.
export function clip(value: unknown, max = 6000): string {
  const text = JSON.stringify(value ?? null);
  if (text.length > max) throw new StepError("Input too large.", 400);
  return text;
}
