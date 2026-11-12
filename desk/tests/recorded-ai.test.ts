// A pack's committed AI recording turns its live runs on, on the server and in the desk. Here the e-commerce
// recording is replaced by a stand-in whose source is "ai" (the real file is rules-only), with no recording switch:
// the server lets the call reach the model and the desk offers live runs. The SaaS file is untouched, so SaaS stays
// off, which shows the switch is per pack.
import { describe, it, expect, vi } from "vitest";

const sdk = vi.hoisted(() => ({ plain: vi.fn(), beta: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {}
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = APIError;
    static AuthenticationError = APIError;
    messages = { create: sdk.plain };
    beta = { messages: { create: sdk.beta } };
  }
  return { default: Anthropic };
});
vi.mock("../src/data/recorded-run.e-commerce.json", () => ({
  default: { recordedAt: "2026-11-11T00:00:00.000Z", source: "ai", models: ["stand-in"], totalCost: 0, steps: {} },
}));

import { onRequestPost } from "../functions/api/[step]";
import { RECORDED_AI } from "../functions/_lib/live-packs";
import { SHOP_DESK } from "../src/packs/ecommerce-desk";
import { SAAS_DESK } from "../src/packs/saas-desk";

async function post(pack: string, ids: string[]) {
  const request = new Request("https://support-desk.pages.dev/api/triage", {
    method: "POST",
    body: JSON.stringify({ ids, pack }),
  });
  // A public host: the rate limiter fails closed there without a counter, so the test gives it one.
  const kv = { get: () => Promise.resolve(null), put: () => Promise.resolve() };
  const res = await onRequestPost({
    request,
    env: { ANTHROPIC_API_KEY: "test-key", DESK_KV: kv },
    params: { step: "triage" },
  });
  return res.status;
}

describe("a committed AI recording", () => {
  it("turns that pack's live runs on in the server and the desk, and no other pack's", async () => {
    expect(RECORDED_AI).toEqual({ "saas-support": false, "e-commerce": true });
    expect(SHOP_DESK.liveRuns).toBe(true);
    expect(SAAS_DESK.liveRuns).toBe(false);

    sdk.plain.mockReset();
    sdk.plain.mockRejectedValue(new Error("no model in tests"));
    expect(await post("e-commerce", ["T-4001"])).not.toBe(403);
    expect(sdk.plain).toHaveBeenCalled();

    sdk.plain.mockReset();
    expect(await post("saas-support", ["T-3001"])).toBe(403);
    expect(sdk.plain).not.toHaveBeenCalled();
  });
});
