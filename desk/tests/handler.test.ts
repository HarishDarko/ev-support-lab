// The /api/:step handler with the Anthropic SDK mocked. No network, no key, no spend.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TICKETS } from "../shared/synthetic";
import type { Env, KVLike } from "../functions/_lib/types";

const sdk = vi.hoisted(() => ({ plain: vi.fn(), beta: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
    constructor(status?: number, message = "api error") {
      super(message);
      this.status = status;
    }
  }
  class RateLimitError extends APIError {}
  class AuthenticationError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    static AuthenticationError = AuthenticationError;
    messages = { create: sdk.plain };
    beta = { messages: { create: sdk.beta } };
  }
  return { default: Anthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { onRequestPost, onRequestGet } from "../functions/api/[step]";

const MockSdk = Anthropic as unknown as {
  APIError: new (status: number) => Error;
  RateLimitError: new (status: number) => Error;
};

const reply = (data: unknown, over: { model?: string; input?: number; output?: number; stop?: string } = {}) => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  model: over.model ?? "claude-haiku-4-5",
  usage: { input_tokens: over.input ?? 1000, output_tokens: over.output ?? 500 },
  stop_reason: over.stop ?? "end_turn",
});

interface Body {
  data: { results?: { source: string; action: string }[]; the_ask?: string };
  trace: {
    source: string;
    model: string;
    attempts: number;
    cost: number;
    unpriced?: boolean;
    reliability: string;
    fallbackReason?: string;
    tokens: { input: number; output: number };
    checks: { name: string; passed: boolean }[];
  };
}
async function post(step: string, body: unknown, env: Env = {}, headers: Record<string, string> = {}) {
  const request = new Request(`http://localhost/api/${step}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers,
  });
  const res = await onRequestPost({ request, env, params: { step } });
  return { status: res.status, body: (await res.json()) as Body };
}
const live: Env = { ANTHROPIC_API_KEY: "test-key" };
const ticket = TICKETS[1]!; // T-2041, a stuck session
const goodTriage = {
  results: [
    {
      id: ticket.id,
      summary: "Session still Charging after unplug",
      component: "session-state",
      severity: "S2",
      action: "close_with_runbook",
      runbook: "RB-05",
      confidence: 0.9,
      reason: "Stuck session.",
      evidence: "still showed 'Charging' hours after they unplugged",
    },
  ],
};
const verifyOut = {
  verdict: "consistent with hypothesis",
  reading: "Canary stuck sessions went from 5 to 0.",
  what_it_does_not_prove: ["a"],
  keep_watching: ["b"],
  next_decision: "Keep watching for 14 days.",
};
const badHandoff = {
  title: "t",
  severity: "S2",
  scope: "s",
  rules_triggered: [],
  reproduction: [],
  evidence_attached: [],
  ruled_out: [],
  workaround_in_place: "w",
  the_ask: "",
  hypothesis_note: "h",
};

beforeEach(() => {
  sdk.plain.mockReset();
  sdk.beta.mockReset();
});

describe("routing", () => {
  it("404s an unknown step", async () => {
    const r = await post("nope", {});
    expect(r.status).toBe(404);
  });
  it("400s a triage request with no known ids, before any model call", async () => {
    const r = await post("triage", { ids: ["bad"] }, live);
    expect(r.status).toBe(400);
    expect(sdk.plain).not.toHaveBeenCalled();
  });
  it("health reports live only with a key and without MOCK, and the model ids", async () => {
    const get = (env: Env, step = "health") =>
      onRequestGet({ request: new Request("http://localhost"), env, params: { step } });
    expect(await get({}).json()).toEqual({
      live: false,
      models: { fast: "claude-haiku-4-5", deep: "claude-sonnet-5-5" },
    });
    expect(((await get(live).json()) as { live: boolean }).live).toBe(true);
    expect(((await get({ ...live, MOCK: "1" }).json()) as { live: boolean }).live).toBe(false);
    expect(get({}, "other").status).toBe(404);
  });
  it("health shows model overrides", async () => {
    const res = onRequestGet({
      request: new Request("http://localhost"),
      env: { FAST_MODEL: "f-1", DEEP_MODEL: "d-1" },
      params: { step: "health" },
    });
    expect(((await res.json()) as { models: unknown }).models).toEqual({ fast: "f-1", deep: "d-1" });
  });
});

describe("MOCK=1", () => {
  const steps: [string, unknown][] = [
    ["triage", { ids: [ticket.id] }],
    ["patterns", {}],
    ["investigate", {}],
    ["handoff", {}],
    ["verify", {}],
    ["kb", {}],
    ["shiftnote", {}],
    ["classify", { text: "Session open 7h, energy stopped climbing. Charging." }],
  ];
  it.each(steps)("%s answers from the rules and never calls the SDK", async (step, input) => {
    const r = await post(step, input, { ...live, MOCK: "1" });
    expect(r.status).toBe(200);
    expect(r.body.trace).toMatchObject({
      source: "rules",
      model: "deterministic rules",
      reliability: "low",
      fallbackReason: "AI is turned off in this environment.",
      attempts: 0,
      cost: 0,
    });
    expect(sdk.plain).not.toHaveBeenCalled();
    expect(sdk.beta).not.toHaveBeenCalled();
  });
});

describe("live path (mocked SDK)", () => {
  it("a valid answer is returned with its trace and cost", async () => {
    sdk.plain.mockResolvedValueOnce(reply(goodTriage));
    const r = await post("triage", { ids: [ticket.id] }, live);
    expect(r.body.data.results![0]!.source).toBe("ai");
    expect(r.body.trace).toMatchObject({
      source: "ai",
      model: "claude-haiku-4-5",
      attempts: 1,
      reliability: "high",
      tokens: { input: 1000, output: 500 },
    });
    expect(r.body.trace.cost).toBeCloseTo(0.0035, 10);
  });

  it("uses FAST_MODEL for fast steps and DEEP_MODEL with the fallback beta for deep steps", async () => {
    sdk.plain.mockResolvedValueOnce(reply(goodTriage));
    await post("triage", { ids: [ticket.id] }, { ...live, FAST_MODEL: "fast-x" });
    expect(sdk.plain.mock.calls[0]![0]).toMatchObject({
      model: "fast-x",
      output_config: { format: { type: "json_schema" } },
    });
    sdk.beta.mockResolvedValueOnce(reply(verifyOut, { model: "claude-sonnet-5-5" }));
    await post("verify", {}, { ...live, DEEP_MODEL: "deep-x" });
    expect(sdk.beta.mock.calls[0]![0]).toMatchObject({
      model: "deep-x",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
    });
  });

  it("defaults to the documented model ids", async () => {
    sdk.plain.mockResolvedValueOnce(reply(goodTriage));
    await post("triage", { ids: [ticket.id] }, live);
    sdk.beta.mockResolvedValueOnce(reply(verifyOut, { model: "claude-sonnet-5-5" }));
    await post("verify", {}, live);
    expect(sdk.plain.mock.calls[0]![0]).toMatchObject({ model: "claude-haiku-4-5" });
    expect(sdk.beta.mock.calls[0]![0]).toMatchObject({ model: "claude-sonnet-5-5" });
  });

  it("counts tokens and cost across a failed attempt and its retry", async () => {
    sdk.beta
      .mockResolvedValueOnce(reply(badHandoff, { model: "claude-sonnet-5-5", input: 2000, output: 1000 }))
      .mockResolvedValueOnce(
        reply(
          { ...badHandoff, the_ask: "Decide how to close an open transaction.", rules_triggered: ["code"] },
          { model: "claude-sonnet-5-5", input: 3000, output: 1000 },
        ),
      );
    const r = await post("handoff", {}, live);
    expect(r.body.trace).toMatchObject({
      source: "ai",
      attempts: 2,
      tokens: { input: 5000, output: 2000 },
      reliability: "high", // judged on the attempt that succeeded; the failed attempt stays in checks
    });
    expect(r.body.trace.cost).toBeCloseTo((5000 * 2 + 2000 * 10) / 1e6, 10);
    expect(r.body.trace.checks[0]).toMatchObject({ name: "Attempt 1 validation", passed: false });
  });

  it("falls back to rules after two invalid answers and still reports what was spent", async () => {
    sdk.beta.mockResolvedValue(reply(badHandoff, { model: "claude-sonnet-5-5", input: 2000, output: 1000 }));
    const r = await post("handoff", {}, live);
    expect(r.body.trace).toMatchObject({
      source: "rules",
      reliability: "low",
      attempts: 2,
      tokens: { input: 4000, output: 2000 },
      fallbackReason: "Output failed validation: Packet has no ask or no escalation rule",
    });
    expect(r.body.trace.cost).toBeCloseTo((4000 * 2 + 2000 * 10) / 1e6, 10);
    expect(r.body.data.the_ask).toMatch(/Decide how the backend/);
  });

  it("marks a model outside the price table as unpriced rather than free", async () => {
    sdk.beta.mockResolvedValueOnce(reply(verifyOut, { model: "some-other-model" }));
    const r = await post("verify", {}, live);
    expect(r.body.trace).toMatchObject({ unpriced: true, cost: 0, model: "some-other-model" });
  });

  it("keeps the tokens of a refused answer", async () => {
    sdk.beta.mockResolvedValue(reply({}, { model: "claude-sonnet-5-5", stop: "refusal", input: 100, output: 10 }));
    const r = await post("verify", {}, live);
    expect(r.body.trace.source).toBe("rules");
    expect(r.body.trace.tokens).toEqual({ input: 200, output: 20 });
    expect(r.body.trace.fallbackReason).toBe("The model declined this request.");
  });

  it("retries a 502-class failure once, then falls back", async () => {
    sdk.beta.mockRejectedValue(new MockSdk.APIError(500));
    const r = await post("verify", {}, live);
    expect(sdk.beta).toHaveBeenCalledTimes(2);
    expect(r.body.trace).toMatchObject({ source: "rules", attempts: 2, fallbackReason: "Model call failed (500)." });
  });

  it("does not retry a rate-limit answer", async () => {
    sdk.beta.mockRejectedValue(new MockSdk.RateLimitError(429));
    const r = await post("verify", {}, live);
    expect(sdk.beta).toHaveBeenCalledTimes(1);
    expect(r.body.trace.fallbackReason).toMatch(/rate limited/);
  });

  it("falls back when there is no key", async () => {
    const r = await post("verify", {}, {});
    expect(r.body.trace.fallbackReason).toBe("Server has no model key configured.");
  });

  it("marks a triage answer medium reliability when the rules had to replace part of it", async () => {
    sdk.plain.mockResolvedValueOnce(
      reply({ results: [{ ...goodTriage.results[0], evidence: "words that are nowhere in the ticket" }] }),
    );
    const r = await post("triage", { ids: [ticket.id] }, live);
    expect(r.body.data.results![0]!.source).toBe("rules");
    expect(r.body.trace.reliability).toBe("medium");
  });
});

describe("rate limiting", () => {
  const fakeKv = (initial: Record<string, string> = {}) => {
    const store = new Map(Object.entries(initial));
    const kv: KVLike = {
      get: (k) => Promise.resolve(store.get(k) ?? null),
      put: (k, v) => {
        store.set(k, v);
        return Promise.resolve();
      },
    };
    return { kv, store };
  };

  it("counts a live call per IP and per day", async () => {
    const { kv, store } = fakeKv();
    sdk.beta.mockResolvedValueOnce(reply(verifyOut, { model: "claude-sonnet-5-5" }));
    await post("verify", {}, { ...live, DESK_KV: kv }, { "cf-connecting-ip": "1.2.3.4" });
    const keys = [...store.keys()];
    expect(keys.some((k) => k.startsWith("rl:1.2.3.4:"))).toBe(true);
    expect(keys.some((k) => k.startsWith("rl:all:"))).toBe(true);
    expect([...store.values()]).toEqual(["1", "1"]);
  });

  it("blocks the model call once the per-IP limit is reached and answers from rules", async () => {
    const hour = new Date().toISOString().slice(0, 13);
    const { kv } = fakeKv({ [`rl:1.2.3.4:${hour}`]: "80" });
    const r = await post("verify", {}, { ...live, DESK_KV: kv }, { "cf-connecting-ip": "1.2.3.4" });
    expect(sdk.beta).not.toHaveBeenCalled();
    expect(r.body.trace.fallbackReason).toBe("Too many live runs from this connection this hour.");
  });

  it("blocks once the daily budget is used up, and the limits come from the environment", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const { kv } = fakeKv({ [`rl:all:${day}`]: "3" });
    const r = await post("verify", {}, { ...live, DESK_KV: kv, RL_GLOBAL_DAY: "3" });
    expect(r.body.trace.fallbackReason).toBe("Today's live-run budget for this demo is used up.");
  });

  it("a broken counter never blocks a call", async () => {
    const kv: KVLike = { get: () => Promise.reject(new Error("kv down")), put: () => Promise.resolve() };
    sdk.beta.mockResolvedValueOnce(reply(verifyOut, { model: "claude-sonnet-5-5" }));
    const r = await post("verify", {}, { ...live, DESK_KV: kv });
    expect(r.body.trace.source).toBe("ai");
  });
});
