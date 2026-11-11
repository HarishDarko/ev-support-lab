// The recording switch (ALLOW_PACK_RECORDING) and the record script's --pack option. The switch lets a local server
// make a pack's first AI recording; it is off by default, never configured in wrangler.toml, and ignored on any
// address that is not local, so it cannot turn on in production. A pack's committed AI recording is what turns its
// live runs on; a rules-only recording changes nothing.
import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";

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
import { RECORDED_AI, liveAllowed, recordingAllowed } from "../functions/_lib/live-packs";
import { PACKS } from "../shared/packs";
import { recordArgs, recordingFile } from "../scripts/record-args";
import { SAAS_DESK } from "../src/packs/saas-desk";
import { SHOP_DESK } from "../src/packs/ecommerce-desk";

const REFUSED = { error: "Live AI runs are not switched on for this industry yet. Its answers come from the rules." };

async function post(url: string, env: Record<string, string>) {
  const request = new Request(url, { method: "POST", body: JSON.stringify({ ids: ["T-3001"], pack: "saas-support" }) });
  const res = await onRequestPost({ request, env, params: { step: "triage" } });
  const body: unknown = await res.json();
  return { status: res.status, body };
}

describe("the recording switch", () => {
  beforeEach(() => {
    sdk.plain.mockReset();
    // Any answer: the point is whether the model is called at all.
    sdk.plain.mockRejectedValue(new Error("no model in tests"));
  });

  it("is off by default: a live SaaS call is a 403 and never reaches the model", async () => {
    expect(await post("http://127.0.0.1:8788/api/triage", { ANTHROPIC_API_KEY: "test-key" })).toEqual({
      status: 403,
      body: REFUSED,
    });
    expect(sdk.plain).not.toHaveBeenCalled();
  });

  it("is off for any value other than exactly 1", async () => {
    for (const value of ["true", "yes", "0", " 1", ""])
      expect(
        (await post("http://127.0.0.1:8788/api/triage", { ANTHROPIC_API_KEY: "k", ALLOW_PACK_RECORDING: value }))
          .status,
        value,
      ).toBe(403);
    expect(sdk.plain).not.toHaveBeenCalled();
  });

  it("is ignored on an address that is not local, so it cannot turn on in production", async () => {
    for (const url of [
      "https://support-desk.pages.dev/api/triage",
      "https://desk.example.com/api/triage",
      "http://127.0.0.1.example.com/api/triage",
    ])
      expect((await post(url, { ANTHROPIC_API_KEY: "k", ALLOW_PACK_RECORDING: "1" })).status, url).toBe(403);
    expect(sdk.plain).not.toHaveBeenCalled();
  });

  it("on a local server with the switch on, the call goes to the model", async () => {
    const res = await post("http://127.0.0.1:8788/api/triage", { ANTHROPIC_API_KEY: "k", ALLOW_PACK_RECORDING: "1" });
    expect(res.status).not.toBe(403);
    expect(sdk.plain).toHaveBeenCalled();
    expect(recordingAllowed({ ALLOW_PACK_RECORDING: "1" }, "http://localhost:8788/api/kb")).toBe(true);
  });

  it("is not configured in wrangler.toml", () => {
    const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
    expect(toml).not.toMatch(/ALLOW_PACK_RECORDING/);
  });
});

describe("live runs follow the committed recording", () => {
  it("today SaaS and e-commerce have rules-only recordings, so their live runs stay off on both sides", () => {
    expect(RECORDED_AI).toEqual({ "saas-support": false, "e-commerce": false });
    expect(liveAllowed("saas-support", PACKS["saas-support"] as { liveRuns?: boolean })).toBe(false);
    expect(liveAllowed("e-commerce", PACKS["e-commerce"] as { liveRuns?: boolean })).toBe(false);
    expect(liveAllowed("ev-charging", PACKS["ev-charging"])).toBe(true);
    expect([SAAS_DESK.liveRuns, SHOP_DESK.liveRuns]).toEqual([false, false]);
  });

  it("an AI recording turns them on", () => {
    expect(liveAllowed("saas-support", {})).toBe(false);
    expect(liveAllowed("ev-charging", { liveRuns: true })).toBe(true);
  });
});

describe("npm run record -- <url> --pack <id>", () => {
  it("with no --pack records EV charging to recorded-run.json, as before", () => {
    expect(recordArgs(["http://127.0.0.1:8788"])).toEqual({ baseUrl: "http://127.0.0.1:8788", pack: "ev-charging" });
    expect(recordArgs([])).toEqual({ baseUrl: "http://127.0.0.1:8788", pack: "ev-charging" });
    expect(recordingFile("ev-charging")).toBe("recorded-run.json");
  });

  it("with --pack records that pack to its own file", () => {
    expect(recordArgs(["http://127.0.0.1:8788/", "--pack", "saas-support"])).toEqual({
      baseUrl: "http://127.0.0.1:8788",
      pack: "saas-support",
    });
    expect(recordArgs(["--pack", "e-commerce", "http://localhost:8788"])).toEqual({
      baseUrl: "http://localhost:8788",
      pack: "e-commerce",
    });
    expect(recordingFile("saas-support")).toBe("recorded-run.saas-support.json");
    expect(() => recordArgs(["http://127.0.0.1:8788", "--pack"])).toThrow(/--pack needs an industry id/);
  });
});
