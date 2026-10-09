import Anthropic from "@anthropic-ai/sdk";
import type { Env, JsonSchema, Usage } from "./types";

export const DEFAULT_FAST_MODEL = "claude-haiku-4-5";
export const DEFAULT_DEEP_MODEL = "claude-sonnet-5-5";

/** The model ids in use: from the environment when set, otherwise the defaults. */
export function models(env: Pick<Env, "FAST_MODEL" | "DEEP_MODEL">): { fast: string; deep: string } {
  return { fast: env.FAST_MODEL || DEFAULT_FAST_MODEL, deep: env.DEEP_MODEL || DEFAULT_DEEP_MODEL };
}

export const SYSTEM = `You work inside an internal production-support desk for an EV charging network operator. The support desk serves internal teams (customer care, NOC, field service, host accounts, billing ops), not drivers directly.

Everything you are given is synthetic data made up for a prototype.

Rules:
- Never invent names of people. Refer to roles only (driver, host, customer care, NOC, field service, engineering).
- Never invent business figures such as revenue, cost, savings or customer counts. Use only numbers present in the input.
- Use only facts in the input. If something is not in the input, say it is unknown.
- A pattern across tickets is a correlation. State causes as hypotheses, never as proven.
- Write plainly and briefly, the way an experienced support engineer writes for colleagues. No marketing language, no lecturing.`;

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
  { deep = false, prompt, schema, maxTokens, timeout = 30_000 }: CallOptions,
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
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
    } else {
      message = await anthropic.messages.create({
        model: fast,
        max_tokens: maxTokens ?? 4000,
        output_config: { format },
        system: SYSTEM,
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

// Coarse abuse guard: the link may be forwarded. Counts calls per IP per hour and per day overall.
export async function rateLimit(env: Env, request: Request): Promise<void> {
  const kv = env.DESK_KV;
  if (!kv) return;
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const now = new Date();
  const hour = now.toISOString().slice(0, 13);
  const day = now.toISOString().slice(0, 10);
  const perIp = Number(env.RL_PER_IP_HOUR ?? 80);
  const perDay = Number(env.RL_GLOBAL_DAY ?? 400);
  const ipKey = `rl:${ip}:${hour}`;
  const dayKey = `rl:all:${day}`;
  // Best effort: KV counters are approximate under parallel calls (last write wins, one write per key per second),
  // so a counting failure never blocks a call. The hard cap is the spend limit on the API key itself.
  let ipCount: number, dayCount: number;
  try {
    [ipCount, dayCount] = (await Promise.all([kv.get(ipKey), kv.get(dayKey)])).map((v) => Number(v ?? 0)) as [
      number,
      number,
    ];
  } catch {
    return;
  }
  if (ipCount >= perIp) throw new StepError("Too many live runs from this connection this hour.", 429);
  if (dayCount >= perDay) throw new StepError("Today's live-run budget for this demo is used up.", 429);
  await Promise.allSettled([
    kv.put(ipKey, String(ipCount + 1), { expirationTtl: 3700 }),
    kv.put(dayKey, String(dayCount + 1), { expirationTtl: 90000 }),
  ]);
}

// Trims client-supplied JSON (earlier model output) before it goes back into a prompt.
export function clip(value: unknown, max = 6000): string {
  const text = JSON.stringify(value ?? null);
  if (text.length > max) throw new StepError("Input too large.", 400);
  return text;
}
