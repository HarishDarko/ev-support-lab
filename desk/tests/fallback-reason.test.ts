// The "Triage proposal" panel says why the rules decided instead of the model. The reason is a short phrase from the
// checks ("AI quote not found in the ticket"), so the panel closes it as a sentence before the explanation follows.
import { describe, it, expect } from "vitest";
import { recordedRun } from "../src/run/recorded";
import { indexRun } from "../src/run/selectors";
import { asSentence } from "../src/desk/ui/sentence";

type Component = (props: Record<string, unknown>) => unknown;
const load = (path: string) => import(/* @vite-ignore */ path) as Promise<Record<string, unknown>>;

describe("asSentence", () => {
  it("closes a phrase and leaves a finished sentence alone", () => {
    expect(asSentence("AI quote not found in the ticket")).toBe("AI quote not found in the ticket.");
    expect(asSentence("AI is turned off in this environment.")).toBe("AI is turned off in this environment.");
    expect(asSentence('AI label "x" doesn\'t fit the ticket')).toBe('AI label "x" doesn\'t fit the ticket.');
    expect(asSentence("Rate limited? ")).toBe("Rate limited?");
  });
});

describe("triage panel fallback text", () => {
  it("separates every recorded fallback reason from the sentence after it", async () => {
    const react = await load("react");
    const h = react["createElement"] as (type: unknown, props?: unknown, ...children: unknown[]) => unknown;
    const { renderToStaticMarkup } = (await load("react-dom/server")) as {
      renderToStaticMarkup: (el: unknown) => string;
    };
    const { RunProvider } = (await load("../src/run/useRun")) as { RunProvider: Component };
    const { Inspector } = (await load("../src/desk/queue/Inspector")) as { Inspector: Component };

    const fellBack = [...indexRun(recordedRun()).values()].filter((e) => e.result.source === "rules");
    const withReason = fellBack.filter((e) => e.result.fallback_reason);
    expect(withReason.length).toBeGreaterThan(0);
    for (const entry of withReason) {
      const html = renderToStaticMarkup(h(RunProvider, null, h(Inspector, { entry })));
      const text = html
        .replace(/<[^>]+>/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'");
      const reason = entry.result.fallback_reason!;
      expect(text, entry.ticket.id).toContain(`${asSentence(reason)} `);
      expect(text, entry.ticket.id).toContain("The deterministic rules decided instead.");
    }
  });
});
