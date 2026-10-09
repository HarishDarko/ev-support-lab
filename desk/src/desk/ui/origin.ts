// How a piece of output is dressed depends on who produced it. The AI colour marks AI output only:
// when the rules produced it, the same block is neutral and says so.
import { originOf, type Origin, type StepResult } from "../../run";
import type { PillTone } from "./Pill";

export const blockClass = (origin: Origin): string => (origin === "ai" ? "dk-ai" : "dk-rules");
export const pillTone = (origin: Origin): PillTone => (origin === "ai" ? "ai" : "neutral");
export const draftBy = (origin: Origin): string => (origin === "ai" ? "Draft by AI" : "Draft by the rules");
export const originOfStep = (result: StepResult<unknown>): Origin => originOf(result.trace);
