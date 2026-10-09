// The new-ticket check: the one place a visitor types their own text. It is live-only; if the call fails the
// answer comes from the deterministic rules, and its trace says so.
import { ruleClassify } from "../../functions/_lib/rules";
import type { PostStep } from "./live";
import type { ClassifyModel, KbModel, StepResult } from "./types";

export const MAX_TICKET_CHARS = 600;

export async function classifyTicket(
  post: PostStep,
  text: string,
  article: KbModel,
  signal?: AbortSignal,
): Promise<StepResult<ClassifyModel>> {
  const started = performance.now();
  try {
    const answer = (await post("classify", { text, article }, signal)) as StepResult<ClassifyModel>;
    return { ...answer, live: true };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      live: true,
      data: ruleClassify(text, article),
      ms: Math.round(performance.now() - started),
      trace: {
        step: "classify",
        source: "rules",
        model: "deterministic rules",
        attempts: 0,
        checks: [],
        tokens: { input: 0, output: 0 },
        cost: 0,
        reliability: "low",
        fallbackReason: error instanceof Error ? error.message : "The live call failed.",
      },
    };
  }
}
