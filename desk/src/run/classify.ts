// The new-ticket check: the one place a visitor types their own text. It is live-only; if the call fails the
// answer comes from the deterministic rules, and its trace says so. A pack with live runs off gets the rules at
// once, with no call.
import type { PostStep } from "./live";
import { EV_DESK, type DeskPack } from "./pack";
import type { ClassifyModel, KbModel, StepResult } from "./types";

export const MAX_TICKET_CHARS = 600;

export async function classifyTicket(
  post: PostStep,
  text: string,
  article: KbModel,
  signal?: AbortSignal,
  pack: DeskPack = EV_DESK,
): Promise<StepResult<ClassifyModel>> {
  const started = performance.now();
  const body = pack.requestPack ? { text, article, pack: pack.requestPack } : { text, article };
  const rules = (reason: string): StepResult<ClassifyModel> => ({
    live: true,
    data: pack.ruleClassify(text, article),
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
      fallbackReason: reason,
    },
  });
  if (!pack.liveRuns) return rules(LIVE_RUNS_OFF);
  try {
    const answer = (await post("classify", body, signal)) as StepResult<ClassifyModel>;
    return { ...answer, live: true };
  } catch (error) {
    if (signal?.aborted) throw error;
    return rules(error instanceof Error ? error.message : "The live call failed.");
  }
}

/** Why a pack with live runs off answers the check from the rules. */
export const LIVE_RUNS_OFF = "Live AI runs are not switched on for this industry yet.";
