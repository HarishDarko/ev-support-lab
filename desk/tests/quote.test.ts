import { describe, it, expect } from "vitest";
import { quoteSpans, splitByQuote } from "../src/run/quote";
import { TICKETS } from "../src/data/synthetic";
import { indexRun } from "../src/run/selectors";
import { recordedRun } from "../src/run/recorded";

const text = "Driver says the app still showed 'Charging' hours after they unplugged at S-014 last night.";

describe("quote highlighting", () => {
  it("finds the quote in place, ignoring case and spacing", () => {
    const [span] = quoteSpans(text, "STILL   showed 'charging' hours");
    expect(text.slice(span!.start, span!.end)).toBe("still showed 'Charging' hours");
  });

  it("matches curly quotes and dashes against the plain ones", () => {
    const [span] = quoteSpans(text, "showed ‘Charging’ hours");
    expect(text.slice(span!.start, span!.end)).toBe("showed 'Charging' hours");
    const dash = "Elevated 5xx on the auth API 00:10–00:14 ET.";
    expect(quoteSpans(dash, "00:10-00:14 ET")).toHaveLength(1);
  });

  it("highlights each piece of a quote shortened with an ellipsis, in order", () => {
    const parts = splitByQuote(text, "the app still ... unplugged at S-014");
    expect(parts.filter((p) => p.quoted).map((p) => p.text)).toEqual(["the app still", "unplugged at S-014"]);
    expect(parts.map((p) => p.text).join("")).toBe(text);
  });

  it("highlights nothing when the quote is absent, empty or out of order", () => {
    expect(splitByQuote(text, "not in the ticket")).toEqual([{ text, quoted: false }]);
    expect(splitByQuote(text, "")).toEqual([{ text, quoted: false }]);
    expect(quoteSpans(text, "last night ... Driver says")).toEqual([]);
  });

  it("finds every verified quote in the recorded run", () => {
    for (const entry of indexRun(recordedRun()).values()) {
      if (!entry.quote) continue;
      const original = TICKETS.find((t) => t.id === entry.ticket.id)!.text;
      expect(quoteSpans(original, entry.quote).length, entry.ticket.id).toBeGreaterThan(0);
    }
  });
});
