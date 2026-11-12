import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_PACK } from "../../shared/packs";
import { StepError } from "./errors";
import { isLocalUrl } from "./local";
import type { Env, JsonSchema, Usage } from "./types";

export { StepError, clip } from "./errors";

export const DEFAULT_FAST_MODEL = "claude-haiku-4-5";
export const DEFAULT_DEEP_MODEL = "claude-sonnet-5-5";

/** The model ids in use: from the environment when set, otherwise the defaults. */
export function models(env: Pick<Env, "FAST_MODEL" | "DEEP_MODEL">): { fast: string; deep: string } {
  return { fast: env.FAST_MODEL || DEFAULT_FAST_MODEL, deep: env.DEEP_MODEL || DEFAULT_DEEP_MODEL };
}

/** The system prompt of the default pack. Each call sends its pack's own (see `system` below). */
export const SYSTEM = DEFAULT_PACK.prompts.system;

// A live demo can't wait a minute: each call gets a hard deadline and no hidden SDK retries.
function client(env: Env, timeout: number): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw new StepError("Server has no model key configured.", 500);
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0, timeout });
}

// List prices in USD per million tokens, input and output, used to estimate what each call cost.
// A model not in this table (for example a server-side fallback) returns null: unpriced, not free.
const PRICES: Record<string, [input: number, output: number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-5-5": [2, 10],
};
export function costOf(model: unknown, usage: { input?: number; output?: number } | null | undefined): number | null {
  const key = Object.keys(PRICES).find((k) => String(model).startsWith(k));
  if (!usage) return 0;
  if (!key) return null;
  const [pin, pout] = PRICES[key]!;
  return ((usage.input ?? 0) * pin + (usage.output ?? 0) * pout) / 1e6;
}

// The part of a model reply this file reads. Both the plain and the beta message types fit it.
interface ModelMessage {
  content: { type: string; text?: string }[];
  model: string;
  usage?: { input_tokens?: number | null; output_tokens?: number | null } | null;
  stop_reason?: string | null;
}

function textOf(message: ModelMessage): string {
  for (const block of message.content) if (block.type === "text") return block.text ?? "";
  return "";
}

export interface CallOptions {
  deep?: boolean;
  prompt: string;
  schema: JsonSchema;
  maxTokens?: number;
  timeout?: number;
  /** The pack's system prompt. Defaults to the default pack's. */
  system?: string;
}

export interface CallResult {
  data: unknown;
  model: string;
  usage: Usage;
  ms: number;
}

// One structured-output call. Fast model for triage/classification, deep model for reasoning steps.
export async function callJSON(
  env: Env,
  { deep = false, prompt, schema, maxTokens, timeout = 30_000, system = SYSTEM }: CallOptions,
): Promise<CallResult> {
  const anthropic = client(env, timeout);
  const format = { type: "json_schema" as const, schema };
  const { fast, deep: deepModel } = models(env);
  const started = Date.now();
  let message: ModelMessage;
  try {
    if (deep) {
      message = await anthropic.beta.messages.create({
        model: deepModel,
        max_tokens: maxTokens ?? 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format },
        system,
        messages: [{ role: "user", content: prompt }],
      });
    } else {
      message = await anthropic.messages.create({
        model: fast,
        max_tokens: maxTokens ?? 4000,
        output_config: { format },
        system,
        messages: [{ role: "user", content: prompt }],
      });
    }
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError)
      throw new StepError("The model is rate limited right now. Try again in a moment.", 429);
    if (error instanceof Anthropic.AuthenticationError) throw new StepError("Server model key was rejected.", 500);
    if (error instanceof Anthropic.APIError)
      throw new StepError(`Model call failed (${error.status ?? "network"}).`, 502);
    throw new StepError("Model call failed (network).", 502);
  }
  // Tokens are spent even when the answer can't be used, so failures carry the usage too.
  const spent = {
    model: message.model,
    usage: { input: message.usage?.input_tokens ?? 0, output: message.usage?.output_tokens ?? 0 },
  };
  const fail = (text: string) => Object.assign(new StepError(text, 502), spent);
  if (message.stop_reason === "refusal") throw fail("The model declined this request.");
  if (message.stop_reason === "max_tokens") throw fail("The model ran out of room for its answer.");
  let data: unknown;
  try {
    data = JSON.parse(textOf(message));
  } catch {
    throw fail("The model returned malformed output.");
  }
  return { data, ...spent, ms: Date.now() - started };
}

// Calls this isolate has let through, per counter key (this hour's per-IP keys and today's total). KV has no atomic
// increment: parallel calls that read the same stored value used to write the same count, so a full run of 15
// calls added only about 6 to 8. Reserving here, with no await between the check and the reservation, makes calls
// that share an isolate count one each. Calls on other isolates or in other locations still meet only in KV,
// where the count stays approximate.
const admitted = new Map<string, number>();

// On a public host a paid call needs a working counter: with no binding, or a read that fails, the call is refused
// and the rules answer. On a local host (a test, or `wrangler pages dev` whose simulated KV fails) it is let through.
const COUNTER_DOWN = "Live runs are paused: the usage counter is unavailable.";

/** A limit from the environment, or the default when it is unset or not a number (so it never turns into NaN). */
function limitOf(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && value.trim() !== "" && Number.isFinite(n) ? n : fallback;
}

// Coarse abuse guard: the link may be forwarded. Counts model calls per IP per hour and per day overall.
export async function rateLimit(env: Env, request: Request): Promise<void> {
  const local = isLocalUrl(request.url);
  const kv = env.DESK_KV;
  if (!kv) {
    if (local) return;
    throw new StepError(COUNTER_DOWN, 503);
  }
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const now = new Date();
  const hour = now.toISOString().slice(0, 13);
  const day = now.toISOString().slice(0, 10);
  const perIp = limitOf(env.RL_PER_IP_HOUR, 80);
  const perDay = limitOf(env.RL_GLOBAL_DAY, 400);
  const ipKey = `rl:${ip}:${hour}`;
  const dayKey = `rl:all:${day}`;
  // Across isolates KV is still last write wins (and one write per key per second), so the count is approximate;
  // the hard cap is the spend limit on the API key itself. A failed read, or a stored count that is not a number,
  // blocks the call on a public host.
  let stored: number[];
  try {
    stored = (await Promise.all([kv.get(ipKey), kv.get(dayKey)])).map((v) => Number(v ?? 0));
  } catch {
    stored = [NaN];
  }
  if (!stored.every(Number.isFinite)) {
    if (local) return;
    throw new StepError(COUNTER_DOWN, 503);
  }
  // From here to the reservation there is no await, so no other call in this isolate can slip in between.
  for (const key of admitted.keys()) if (!key.endsWith(`:${hour}`) && key !== dayKey) admitted.delete(key);
  const ipCount = Math.max(stored[0] ?? 0, admitted.get(ipKey) ?? 0);
  const dayCount = Math.max(stored[1] ?? 0, admitted.get(dayKey) ?? 0);
  if (ipCount >= perIp) throw new StepError("Too many live runs from this connection this hour.", 429);
  if (dayCount >= perDay) throw new StepError("Today's live-run budget for this demo is used up.", 429);
  admitted.set(ipKey, ipCount + 1);
  admitted.set(dayKey, dayCount + 1);
  // A failed write does not block the call: the reservation above already counts it in this isolate, and parallel
  // calls would otherwise trip KV's limit of one write per key per second.
  await Promise.allSettled([
    kv.put(ipKey, String(ipCount + 1), { expirationTtl: 3700 }),
    kv.put(dayKey, String(dayCount + 1), { expirationTtl: 90000 }),
  ]);
}
