import { STEPS, type Step } from "../_lib/steps";
import { callJSON, rateLimit, costOf, StepError, models } from "../_lib/ai";
import { ValidationError, check } from "../_lib/validate";
import type { Check, Env, StepInput, Usage } from "../_lib/types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/** The slice of a Pages Functions event context this route uses. */
interface Context {
  request: Request;
  env: Env;
  params: { step?: string | string[] };
}

export interface Trace {
  step: string | string[] | undefined;
  source: string;
  model: string;
  attempts: number;
  checks: Check[];
  tokens: Usage;
  cost: number;
  unpriced?: boolean;
  reliability?: string;
  fallbackReason?: string;
}

// Live model first. Output is validated; malformed or invalid output gets one retry.
// Anything that still fails falls back to deterministic rules built from the data, so the demo never stalls
// and nothing unvalidated reaches the screen. The trace says which path produced the result and why.
export async function onRequestPost({ request, env, params }: Context): Promise<Response> {
  const name = params.step as string;
  const step = Object.hasOwn(STEPS, name) ? (STEPS as Record<string, Step>)[name] : undefined;
  if (!step) return json({ error: "Unknown step." }, 404);
  let input: StepInput = {};
  try {
    const body: unknown = await request.json();
    input = body as StepInput;
  } catch {
    /* steps that take no input */
  }

  let prompt: string;
  try {
    prompt = step.build(input);
  } catch (error) {
    if (error instanceof StepError) return json({ error: error.message }, error.status);
    throw error;
  }

  const started = Date.now();
  const ids = models(env);
  const trace: Trace = {
    step: params.step,
    source: "ai",
    model: step.deep ? ids.deep : ids.fast,
    attempts: 0,
    checks: [],
    tokens: { input: 0, output: 0 },
    cost: 0,
  };
  // Every attempt's tokens count, including answers that failed validation or fell back to rules.
  const spend = ({ model, usage }: { model?: string; usage?: Usage }) => {
    if (!usage) return;
    trace.tokens.input += usage.input;
    trace.tokens.output += usage.output;
    const cost = costOf(model, usage);
    if (cost == null) trace.unpriced = true;
    else trace.cost += cost;
  };
  try {
    if (env.MOCK === "1") throw new StepError("AI is turned off in this environment.", 503);
    await rateLimit(env, request);
    // Time budget per step: the fallback must arrive while the viewer is still on the screen.
    const budget = step.deep ? 40_000 : 15_000;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const left = budget - (Date.now() - started);
      if (attempt > 1 && left < budget / 2) break; // not enough time for a useful retry
      trace.attempts = attempt;
      try {
        const res = await callJSON(env, {
          deep: step.deep,
          prompt,
          schema: step.schema,
          maxTokens: step.maxTokens,
          timeout: left,
        });
        spend(res);
        const { data, checks } = step.validate(res.data, input, prompt);
        const partial =
          Array.isArray((data as { results?: unknown }).results) &&
          (data as { results: { source?: string }[] }).results.some((r) => r.source === "rules");
        Object.assign(trace, {
          model: res.model,
          checks: [...trace.checks, ...checks],
          reliability: checks.every((c) => c.passed) && !partial ? "high" : "medium",
        });
        return json({ data, ms: Date.now() - started, trace });
      } catch (error) {
        lastError = error;
        spend(error as { model?: string; usage?: Usage });
        if (error instanceof ValidationError) {
          trace.checks.push(check(`Attempt ${attempt} validation`, false, error.message));
          continue;
        }
        if (error instanceof StepError && error.status === 502) {
          trace.checks.push(check(`Attempt ${attempt}`, false, error.message));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  } catch (error) {
    const message = (error as Error | undefined)?.message;
    const reason =
      error instanceof ValidationError
        ? `Output failed validation: ${error.message}`
        : message || "The live call failed.";
    return json({
      data: step.fallback(input),
      ms: Date.now() - started,
      trace: { ...trace, source: "rules", model: "deterministic rules", reliability: "low", fallbackReason: reason },
    });
  }
}

export function onRequestGet({ env, params }: Context): Response {
  if (params.step !== "health") return json({ error: "Not found." }, 404);
  const { fast, deep } = models(env);
  return json({ live: Boolean(env.ANTHROPIC_API_KEY) && env.MOCK !== "1", models: { fast, deep } });
}
