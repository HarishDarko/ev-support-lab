// Paid model calls are switched on per pack: EV charging yes, SaaS support and e-commerce not until SD-14.
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

import { onRequestPost } from "../functions/api/[step]";
import { PACKS } from "../shared/packs";

async function post(body: unknown, env: Record<string, string>) {
  const request = new Request("http://localhost/api/triage", { method: "POST", body: JSON.stringify(body) });
  const res = await onRequestPost({ request, env, params: { step: "triage" } });
  return { status: res.status, body: (await res.json()) as { error?: string; trace?: { source: string } } };
}

describe("live runs per pack", () => {
  it("is on for EV charging only", () => {
    expect(PACKS["ev-charging"].liveRuns).toBe(true);
    expect((PACKS["saas-support"] as { liveRuns?: boolean }).liveRuns).toBeUndefined();
    expect((PACKS["e-commerce"] as { liveRuns?: boolean }).liveRuns).toBeUndefined();
  });

  for (const [pack, ids] of [
    ["saas-support", ["T-3001"]],
    ["e-commerce", ["T-4001"]],
  ] as const) {
    it(`${pack}: a call that would reach the model is a 403 and never calls the SDK`, async () => {
      sdk.plain.mockReset();
      const res = await post({ ids, pack }, { ANTHROPIC_API_KEY: "test-key" });
      expect(res).toEqual({
        status: 403,
        body: { error: "Live AI runs are not switched on for this industry yet. Its answers come from the rules." },
      });
      expect(sdk.plain).not.toHaveBeenCalled();
    });

    it(`${pack}: with the model off, the rules still answer`, async () => {
      const res = await post({ ids, pack }, { MOCK: "1" });
      expect(res.status).toBe(200);
      expect(res.body.trace?.source).toBe("rules");
    });
  }
});
