// Which packs may call the model, and the one local exception for making a pack's first recording.
import saasRecording from "../../src/data/recorded-run.saas-support.json";
import shopRecording from "../../src/data/recorded-run.e-commerce.json";
import type { PackId } from "../../shared/packs";
import type { Env } from "./types";

/**
 * A pack's live calls are on when the pack says so (EV charging), or when its committed recording is an AI run:
 * that recording was made and reviewed once, so the desk can offer "Run it live" for it. A rules-only recording
 * (MOCK=1, no model) changes nothing. The desk reads the same files (src/packs/<pack>-desk.ts).
 */
export const RECORDED_AI: Partial<Record<PackId, boolean>> = {
  "saas-support": saasRecording.source === "ai",
  "e-commerce": shopRecording.source === "ai",
};

export function liveAllowed(id: PackId, pack: { liveRuns?: boolean }): boolean {
  return pack.liveRuns === true || RECORDED_AI[id] === true;
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * The recording switch: ALLOW_PACK_RECORDING=1 lets a local `wrangler pages dev` call the model for a pack whose live
 * runs are still off, so `npm run record -- <url> --pack <id>` can make that pack's first AI recording. Off unless
 * the variable is exactly "1", never set in wrangler.toml, and ignored unless the request is to a local address, so
 * it cannot turn on in production even if the variable were set there.
 */
export function recordingAllowed(env: Env, url: string): boolean {
  if (env.ALLOW_PACK_RECORDING !== "1") return false;
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}
