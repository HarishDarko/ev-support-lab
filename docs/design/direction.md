# Design direction (chosen 2026-10-08)

**Incident Room** stages as the spine, the **Shift Console** behind "Open the desk", and the visual calm of **Shift Story**. The three explored prototypes are kept for reference outside the repo. This document is the source of truth.

## Structure

| Zone | Content |
|---|---|
| Top strip (52 px) | Product name "Support Desk" · stage nav with names (Queue, Triage, Evidence, Verification, Close) · "Synthetic data" label · live-AI indicator with this visit's estimated cost · theme toggle |
| Claim | Kicker (stage number and clock time), one headline (depth 1), one lede line |
| Board | The evidence board for the current stage. It persists across stages, and items move and resize between stages as shared elements. |
| Control bar (60 px) | Back · stage name · **Open the desk** (D) · Next: <stage> (→). Never covers content. |
| The desk (depth 2) | A right-hand sheet, `min(1120px, 94vw)`, with tabs: Queue · Incident · Handoff · Knowledge base · Coverage · Scorecard. Queue is the console: tickets in lanes, quoted words highlighted, an inspector panel for the selected item, and the approvals. Esc closes it and focus returns to the opener. |
| Depth 3 | "Source" links to the repo files and tests: the reproduction test, the reconciliation policy, the decision records |

Stages, one point each:
1. **Queue**, 07:00 ET. 40 tickets as tiles, plus the coverage strip: NOC 24/7, India 23:30–08:30, this shift 07:00–15:30, overlap 07:00–08:30, evening automation.
2. **Triage.** Tiles are read and travel into lanes. Five held tiles lift out and converge into the pattern node. A person approves the runbook closures (button in the stage).
3. **Evidence.** Pattern → three evidence nodes (timing dot plot, OCPP replay with the ignored Ended struck through, fleet bars) → two hypothesis nodes, "Not confirmed".
4. **Verification**, day 20. The trail collapses to the left, then the fix node (the four rules), the result (canary 5→0, control 4→4), "What this doesn't prove" before "Checks that held", and the next decision.
5. **Close.** The whole chain as one row, plus three numbers: closures awaiting a person, held → one incident, canary 5 → 0.

Phone (< 1000 px): one scrolling page, one section per stage, a sticky top bar with stage chips, and "Open the desk" per section as a full-screen sheet.

## Identity

**Type**
- **Schibsted Grotesk** for UI and display. Headlines 600–700, tight tracking (−0.02 to −0.04em), `text-wrap: balance`.
- **Newsreader** for the one-line lede under each claim and for article body text in the desk. Never in tables or controls.
- **JetBrains Mono** for IDs, log lines, numbers in tables, and kickers (uppercase, +0.08em).
- Scale (px): 12 · 13 · 14 · 16 · 18 · 22 · 28 · 36 · 48. The claim is `clamp(32px, 3.6vw, 60px)`.
- Tabular numerals everywhere numbers align.

**Colour** (tokens; light on `:root`, dark redefined):

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #F3F5F8 | #0A0E14 | page |
| `--surface` | #FFFFFF | #11161E | nodes, sheets |
| `--surface-2` | #E9EDF2 | #18202A | tiles, sunken areas |
| `--line` | #D8DDE5 | #222A36 | hairlines |
| `--line-strong` | #A9B2BF | #3A4555 | axes, inputs, connectors |
| `--fg` | #0C1016 | #E8ECF2 | text |
| `--fg-2` | #434C5A | #B0B9C6 | secondary text |
| `--fg-3` | #5B6573 | #8D97A6 | captions (4.5:1 on bg) |
| `--ai` / `--ai-soft` | #2336C4 / #E2E6FA | #97A8FF / #1B2250 | **only** for things the AI produced |
| `--attn` / `--attn-soft` | #8A5200 / #FAEACB | #EDB75F / #2A200E | held, not confirmed, what this doesn't prove |
| `--ok` / `--ok-soft` | #16693B / #DCEFE3 | #66CE92 / #10281B | approved, checks that held |
| `--bad` / `--bad-soft` | #B1281D / #FAE1DE | #FF9188 / #331614 | ignored line, failure |

- Semantic colours differ in lightness as well as hue.
- No gradients, no glow except the amber "held" pulse during triage, and no shadows except on the desk sheet.

**Shape**
- Radius: 3 px on controls and tiles, 6 px on nodes and sheets.
- Borders are 1 px hairlines. Cards appear only where an object needs separating: board nodes and the sheet.

**Motion**
- Durations of 150, 250 and 350 ms; ease `cubic-bezier(.2,.8,.2,1)`.
- Staggers of 20–40 ms, never more than 1.2 s in total.
- Shared-element moves use Motion `layout` and `layoutId`; connectors draw with path length.
- `prefers-reduced-motion`: crossfades or instant changes, and everything is still readable.

**Copy**
- Plain and short; the active voice; controls say what happens.
- Hypotheses are never stated as facts. Synthetic data is always labelled.

## Accessibility

- WCAG 2.2 AA in both themes.
- Full keyboard: ← → move stages, D opens the desk, Esc closes it, Tab order is logical.
- Visible focus. Real buttons and links. `aria-live` announces stage changes.
- The board is decorative structure; every fact on it also exists as text.
