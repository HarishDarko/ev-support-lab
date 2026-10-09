// The committed recorded run: src/data/recorded-run.json, read once and checked.
import recordedJson from "../data/recorded-run.json";
import { parseRecordedRun, runFromRecording } from "./parse";
import type { Run } from "./types";

let cached: Run | undefined;
/** The committed recorded run. Parsed once. */
export function recordedRun(): Run {
  cached ??= runFromRecording(parseRecordedRun(recordedJson));
  return cached;
}
