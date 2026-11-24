// The "Triage proposal" panel says why the rules decided instead of the model. The reason is a short phrase from the
// checks ("AI quote not found in the ticket"), so the UI closes it as a sentence before the explanation follows.
import { describe, it, expect } from "vitest";
import { recordedRun } from "../src/run/recorded";
import { indexRun } from "../src/run/selectors";
import { asSentence } from "../src/desk/ui/sentence";

type Component = (props: Record<string, unknown>) => unknown;
const load = (path: string) => import(/* @vite-ignore */ path) as Promise<Record<string, unknown>>;

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");

/** Inner text of the first element carrying the class, with tags removed. */
const classText = (html: string, cls: string) => {
  const m = new RegExp(String.raw`<p class="[^"]*\b${cls}\b[^"]*">([\s\S]*?)</p>`).exec(html);
  expect(m, `no <p class="${cls}"> in the markup`).not.toBeNull();
  return textOf(m![1]!);
};

const render = async (child: (h: (...a: unknown[]) => unknown) => unknown, initial?: unknown) => {
  const react = await load("react");
  const h = react["createElement"] as (type: unknown, props?: unknown, ...children: unknown[]) => unknown;
  const { renderToStaticMarkup } = (await load("react-dom/server")) as {
    renderToStaticMarkup: (el: unknown) => string;
  };
  const { RunProvider } = (await load("../src/run/useRun")) as { RunProvider: Component };
  return renderToStaticMarkup(h(RunProvider, { initial }, child(h)));
};

describe("asSentence", () => {
  it("closes a phrase and leaves a finished sentence alone", () => {
    expect(asSentence("AI quote not found in the ticket")).toBe("AI quote not found in the ticket.");
    expect(asSentence("AI is turned off in this environment.")).toBe("AI is turned off in this environment.");
    expect(asSentence('AI label "x" doesn\'t fit the ticket')).toBe('AI label "x" doesn\'t fit the ticket.');
    expect(asSentence("Rate limited? ")).toBe("Rate limited?");
  });

  it("leaves curly closing quotes and the ellipsis character alone", () => {
    expect(asSentence("Model said \u201cno.\u201d")).toBe("Model said \u201cno.\u201d");
    expect(asSentence("It\u2019s \u2018no.\u2019")).toBe("It\u2019s \u2018no.\u2019");
    expect(asSentence("Timed out\u2026")).toBe("Timed out\u2026");
    expect(asSentence("Model said \u201cno\u201d")).toBe("Model said \u201cno\u201d.");
  });

  it("treats blank or missing text as no reason", () => {
    for (const blank of ["", "   ", "\n\t", null, undefined]) expect(asSentence(blank)).toBe("");
  });
});

describe("triage panel fallback text", () => {
  const fellBack = () => [...indexRun(recordedRun()).values()].filter((e) => e.result.source === "rules");

  it("closes every recorded fallback reason inside the panel's own reason paragraph", async () => {
    const { Inspector } = (await load("../src/desk/queue/Inspector")) as { Inspector: Component };
    const withReason = fellBack().filter((e) => e.result.fallback_reason);
    expect(withReason.length).toBeGreaterThan(0);
    for (const entry of withReason) {
      const r = entry.result;
      const html = await render((h) => h(Inspector, { entry }));
      const quoted = r.rejected_quote ? ` The model quoted "${r.rejected_quote}".` : "";
      expect(classText(html, "inspector-fallback").replace(/\s+/g, " "), entry.ticket.id).toBe(
        `${asSentence(r.fallback_reason)}${quoted} The deterministic rules decided instead.`,
      );
    }
  });

  it("uses the default reason when the recorded reason is blank", async () => {
    const { Inspector } = (await load("../src/desk/queue/Inspector")) as { Inspector: Component };
    const entry = fellBack()[0]!;
    for (const blank of ["", "   ", undefined]) {
      const blanked = { ...entry, result: { ...entry.result, fallback_reason: blank, rejected_quote: undefined } };
      const html = await render((h) => h(Inspector, { entry: blanked }));
      expect(classText(html, "inspector-fallback").replace(/\s+/g, " ")).toBe(
        "The live call was not used. The deterministic rules decided instead.",
      );
    }
  });
});

describe("fallback reason in the provenance note and the classifier", () => {
  const withReason = (reason: string | null | undefined) => {
    const run = recordedRun();
    const classify = run.steps.classify;
    return {
      ...run,
      steps: {
        ...run.steps,
        classify: {
          ...classify,
          trace: { ...classify.trace, source: "rules", fallbackReason: reason ?? undefined },
        },
      },
    };
  };

  it("ProvenanceNote closes the reason before the next sentence", async () => {
    const { ProvenanceNote } = (await load("../src/desk/ui/ProvenanceNote")) as { ProvenanceNote: Component };
    const { provenanceOfStep } = (await load("../src/run/provenance")) as {
      provenanceOfStep: (r: unknown) => unknown;
    };
    const show = (reason: string | null) => {
      const run = withReason(reason);
      return render(
        (h) => h(ProvenanceNote, { provenance: provenanceOfStep(run.steps.classify), step: "classify" }),
        run,
      );
    };
    expect(classText(await show("Model said \u201cno\u201d"), "prov-reason").replace(/\s+/g, " ")).toBe(
      "The live result was not used: Model said \u201cno\u201d. These answers come from deterministic rules built from the data.",
    );
    for (const blank of ["", "   ", null]) expect(await show(blank)).not.toContain("prov-reason");
  });

  it("Classifier closes the reason, and says nothing for a blank one", async () => {
    const { Classifier } = (await load("../src/desk/kb/Classifier")) as { Classifier: Component };
    const show = (reason: string | null) => {
      const run = withReason(reason);
      return render((h) => h(Classifier), run);
    };
    const html = await show("AI quote not found in the ticket");
    expect(html).toContain("The live call was not used: AI quote not found in the ticket.</p>");
    for (const blank of ["", "   ", null]) expect(await show(blank)).not.toContain("The live call was not used");
  });
});
