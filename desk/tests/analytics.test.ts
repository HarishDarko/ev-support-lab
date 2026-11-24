// Anonymous analytics: off without a key, cookieless and masked with one, and every event carries only the
// properties it lists. Plus the Cloudflare Web Analytics tag, which the production build adds to index.html.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanProps, EVENTS, initAnalytics, NO_CAPTURE, resetAnalytics, track } from "../src/analytics";
import { readFileSync } from "node:fs";
import { beaconTag, CF_BEACON_TOKEN, cloudflareBeacon } from "../cf-beacon";

const page = (search = "", dnt: string | null = null) => ({
  location: { search },
  navigator: { doNotTrack: dnt },
  doNotTrack: null,
});
const fakeClient = () => ({ init: vi.fn(), capture: vi.fn(), register: vi.fn() });
const prod = { PROD: true, VITE_POSTHOG_KEY: "phc_test_key", VITE_POSTHOG_HOST: "https://eu.i.posthog.com" };

afterEach(() => resetAnalytics());

describe("analytics are off without a key", () => {
  it("loads nothing and track() is a no-op", async () => {
    const load = vi.fn(() => Promise.resolve(fakeClient()));
    for (const env of [{ PROD: true }, { PROD: true, VITE_POSTHOG_KEY: "" }, { PROD: true, VITE_POSTHOG_KEY: "   " }]) {
      expect(await initAnalytics({ env, page: page(), load })).toBe(false);
    }
    expect(await initAnalytics()).toBe(false);
    expect(() => track("industry_opened", { pack: "saas-support" })).not.toThrow();
    expect(load).not.toHaveBeenCalled();
  });

  it("stays off outside a production build even with a key", async () => {
    const load = vi.fn(() => Promise.resolve(fakeClient()));
    expect(await initAnalytics({ env: { PROD: false, VITE_POSTHOG_KEY: "phc_test_key" }, page: page(), load })).toBe(
      false,
    );
    expect(load).not.toHaveBeenCalled();
  });

  it("stays off for Do Not Track and for a host outside the two regions", async () => {
    const load = vi.fn(() => Promise.resolve(fakeClient()));
    expect(await initAnalytics({ env: prod, page: page("", "1"), load })).toBe(false);
    expect(
      await initAnalytics({ env: { ...prod, VITE_POSTHOG_HOST: "https://evil.example" }, page: page(), load }),
    ).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });
});

describe("analytics with a key", () => {
  it("starts PostHog cookieless, masked and with autocapture, then sends events", async () => {
    const client = fakeClient();
    expect(await initAnalytics({ env: prod, page: page(), load: () => Promise.resolve(client) })).toBe(true);
    const [key, config] = client.init.mock.calls[0] as [string, Record<string, unknown>];
    expect(key).toBe("phc_test_key");
    expect(config).toMatchObject({
      api_host: "https://eu.i.posthog.com",
      persistence: "memory",
      autocapture: true,
      capture_pageview: "history_change",
      respect_dnt: true,
      session_recording: { maskAllInputs: true },
    });
    expect(client.register).not.toHaveBeenCalled();
    track("desk_opened", { tab: "scorecard" });
    expect(client.capture).toHaveBeenCalledWith("desk_opened", { tab: "scorecard" });
  });

  it("defaults to the US host and marks ?internal=1 as an internal super property", async () => {
    const client = fakeClient();
    await initAnalytics({
      env: { PROD: true, VITE_POSTHOG_KEY: "phc_test_key" },
      page: page("?internal=1"),
      load: () => Promise.resolve(client),
    });
    expect((client.init.mock.calls[0] as unknown[])[1]).toMatchObject({ api_host: "https://us.i.posthog.com" });
    expect(client.register).toHaveBeenCalledWith({ internal: true });
  });
});

describe("events carry only allowed properties", () => {
  it("drops unknown keys, free text and values outside the allowed set", () => {
    expect(
      cleanProps("desk_opened", {
        tab: "queue",
        ticketText: "My card 4242 was charged",
        email: "a@b.com",
        token: "abc",
      }),
    ).toEqual({ tab: "queue" });
    expect(cleanProps("desk_opened", { tab: "My card was charged twice" })).toEqual({});
    expect(cleanProps("run_live_requested", { pack: "jane@example.com" })).toEqual({});
    expect(cleanProps("ticket_inspected", { ticket: "T-1042" })).toEqual({});
    expect(cleanProps("not_an_event", { a: "1" })).toEqual({});
  });

  it("sends the cleaned properties, never what the caller passed", async () => {
    const client = fakeClient();
    await initAnalytics({ env: prod, page: page(), load: () => Promise.resolve(client) });
    track("stage_viewed", { stage: "triage", subject: "secret", ip: "10.0.0.1" } as never);
    expect(client.capture).toHaveBeenCalledWith("stage_viewed", { stage: "triage" });
  });

  it("is at most eight events, each property a fixed list", () => {
    expect(Object.keys(EVENTS).length).toBeLessThanOrEqual(8);
    for (const props of Object.values(EVENTS)) {
      for (const allowed of Object.values(props as Record<string, unknown>)) expect(Array.isArray(allowed)).toBe(true);
    }
  });
});

describe("recording config and the internal flag", () => {
  it("never records canvas, masks inputs, and respects Do Not Track", async () => {
    const client = fakeClient();
    await initAnalytics({ env: prod, page: page(), load: () => Promise.resolve(client) });
    expect((client.init.mock.calls[0] as unknown[])[1]).toMatchObject({
      session_recording: { maskAllInputs: true, recordCanvas: false },
      respect_dnt: true,
      persistence: "memory",
    });
  });

  it("tags every event, including the first pageview, when the page was opened with ?internal=1", async () => {
    const client = fakeClient();
    const arrival = page("?internal=1");
    // The address is read before PostHog loads, so a change while it loads does not matter.
    await initAnalytics({
      env: prod,
      page: arrival,
      load: () => {
        arrival.location.search = "";
        return Promise.resolve(client);
      },
    });
    type Event = { properties?: Record<string, unknown> } | null;
    const beforeSend = ((client.init.mock.calls[0] as unknown[])[1] as { before_send: (e: Event) => Event })
      .before_send;
    expect(beforeSend({ properties: { $current_url: "x" } })?.properties).toEqual({
      $current_url: "x",
      internal: true,
    });
    expect(beforeSend(null)).toBeNull();
    expect(client.register).toHaveBeenCalledWith({ internal: true });
  });

  it("leaves events untagged without the flag", async () => {
    const client = fakeClient();
    await initAnalytics({ env: prod, page: page("?other=1"), load: () => Promise.resolve(client) });
    type Event = { properties?: Record<string, unknown> };
    const beforeSend = ((client.init.mock.calls[0] as unknown[])[1] as { before_send: (e: Event) => Event })
      .before_send;
    expect(beforeSend({ properties: { a: 1 } }).properties).toEqual({ a: 1 });
  });
});

describe("visitor-typed text stays out of recordings", () => {
  // The Classifier textarea is masked as an input, but its result can quote what was typed, so it carries the class.
  it("marks the new-ticket result with ph-no-capture", () => {
    expect(NO_CAPTURE).toBe("ph-no-capture");
    const source = readFileSync(new URL("../src/desk/kb/Classifier.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/className=\{`classify-result \$\{NO_CAPTURE\}`\}/);
  });
});

describe("Cloudflare Web Analytics beacon", () => {
  it("is the standard snippet with the public token", () => {
    expect(beaconTag(CF_BEACON_TOKEN)).toBe(
      `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "75e77520a4c54b15af8563a009dc8444"}'></script>`,
    );
  });

  it("is added to the production build only, before </body>", () => {
    const plugin = cloudflareBeacon();
    expect(plugin.apply).toBe("build");
    const hook = plugin.transformIndexHtml as { handler: (html: string) => string };
    expect(hook.handler('<body><div id="root"></div></body>')).toBe(
      `<body><div id="root"></div>${beaconTag(CF_BEACON_TOKEN)}</body>`,
    );
  });
});
