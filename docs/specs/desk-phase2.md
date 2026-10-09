# Spec: the desk, Phase 2 (the experience)

Builds on Phase 1 (`desk/`). Design source of truth: `docs/design/direction.md`. Where this spec and the direction disagree, the direction wins on look and motion and this spec wins on content and behaviour.

## 1. How the AI shows up: recorded run, live on request

The walkthrough must never wait on a network call, yet the AI must be real and inspectable.

- **Recorded run.** `scripts/record-run.ts` drives the full chain against a running `pages:dev`: triage of all 40 tickets in the same batches as the prototype, then patterns, investigate, handoff, verify, kb, shiftnote, and classify on `NEW_TICKET_EXAMPLE`.
  - It writes `src/data/recorded-run.json`. Each step stores `{ data, trace, ms }` exactly as the API returned them, plus `{ recordedAt, models, totalCost }`.
  - With `MOCK=1` the same script produces a rules-only run. That run is committed first so the app works today, and its label says so.
  - A real recording costs about $0.15 and needs the API key. It is a deliberate, separate step, not part of CI.
- **The UI reads one `Run` object** (`src/run/`), whose source is `recorded` or `live`. Every AI-produced item carries its provenance: model, "AI, checked" or "Rules fallback", and the checks that ran.
- **"Run it live"** sits in the Triage stage and in the desk Queue tab.
  - It re-runs the chain through `/api/*` in the background.
  - Tiles re-sort as live results land, using the same layout animation.
  - The top strip shows "Live · $0.0x so far".
  - Failure or rate limit: keep the recorded results and say so in one line. Never block.
- **The new-ticket classifier** in the Knowledge base tab is live-only: it is the one place a visitor types their own text. If the call fails, it falls back to the rules result, labelled.

## 2. Content model: stages and beats

Five stages, as in the direction. Each stage has one or more **beats**, and each beat makes one point.
- → and Next advance one beat; ← and Back go back one. The stage nav jumps to the first beat of a stage.
- The board persists, and each beat adds to it or rearranges it.
- URL hash = stage id (`#triage`), so a link can open a stage.
- Every number below is computed from the data or the run, never typed into the UI.

| Stage | Beat | Claim (depth 1) | Board |
|---|---|---|---|
| Queue | q1 | "07:00 ET. 40 tickets are waiting." Lede: who escalated them overnight. | 40 tiles grouped by source (NOC, customer care, field service, host accounts, billing ops), each showing ID and age |
| | q2 | "The first 90 minutes overlap with India engineering." | Coverage strip slides in under the tiles: NOC 24/7, India 23:30–08:30, this shift 07:00–15:30, overlap, evening automation |
| Triage | t1 | "Every ticket read, every decision quoted." | Tiles travel into lanes: Close with runbook · Needs a person · Escalation candidate · Info only · Held. Counts tick up. Selecting a tile shows its quote and runbook inline (small popover); the full trace is in the desk. |
| | t2 | "Five closures held: RB-05 has closed this 9 times in 21 days." | The 5 held tiles lift out (amber pulse, the only glow allowed) and converge into a pattern node. The repeat rule is shown as text: record-only runbook, 21-day window, limit 3. |
| | t3 | "A person approves the closures." | The primary button "Approve N closures" sits in the stage. After approval the lane tiles turn `--ok`. Closures without a real runbook cannot be approved (the Phase 1 rule). |
| Evidence | e1 | "One pattern, one incident: INC-0412." | Pattern node expands: 14 tickets, 9 sites, 21 days, the firmware mix. The escalation line is a checklist; the 3 triggers that fired (code, spread, billing) tick. |
| | e2 | "Every stuck session dropped its connection within 90 s of unplug." | Timing dot plot: 14 dots on a 0–90 s axis, coloured by firmware |
| | e3 | "The charger sent the Ended. The backend ignored it." | OCPP replay of T-2058 (FW-A), line by line. The `ignored` line is struck through in `--bad` the moment it lands. Then T-2041 (FW-B), where the Ended never arrives. |
| | e4 | "FW-B: 12 of 19 drops near unplug ended stuck." | Fleet bars for the three firmware lines; the denominators are visible |
| | e5 | "Two hypotheses, neither confirmed. Support contains it today." | Two hypothesis nodes labelled "Not confirmed", ranked. Beside them, a containment node: the 5 sessions corrected under the incident, and the detector proposed. |
| | e6 | "Reproduced on demand." | Lab node: the reproduction test with the flag off. A simulated FW-A-like charger sends the late Ended and the backend ignores it; the transaction stays open. Source link to the test. |
| Verification | v1 | "One packet to engineering. One ask, with the bug reproduced in a test." | Handoff node: the ask, the evidence attached (including the lab tests), the triggers that fired. Primary button "Approve and send". Afterwards the node reads "Sent to engineering · simulated". |
| | v2 | "Engineering's change, behind a flag on 5 canary sites." | Fix node: the four rules (ask before closing, apply a late Ended once, reconcile only when lost, never close while energy flows). The regression test passes with the flag on and fails with it off. Source links. |
| | v3 | "Day 20: canary 5 → 0. Control 4 → 4." | Bars grow from zero (canary and control, before and after). The trail of earlier nodes collapses to the left. |
| | v4 | "Consistent with the hypothesis, not proof of it." | "What this doesn't prove" (amber) first, then "Checks that held" (ok), then the next decision. |
| Close | c1 | "Next time, support has the article." | KB article node. The new ticket is checked against it, with the meter check shown as the first step. |
| | c2 | "One shift, one chain." | The whole chain as one row (queue → triage → incident → handoff → fix → verified → article), plus three numbers: closures awaiting a person, held → one incident, canary 5 → 0. Then the end-of-shift note to India and the source links. |

All copy follows the direction: plain, short, no lecturing.

**The engineering change must match the lab.** `ENGINEERING_CHANGE.summary` in `shared/synthetic.ts` still describes the older "close when Available" fix. Replace it with the transaction-aware fix in `docs/specs/lab.md`: GetTransactionStatus on reconnect, wait while messages are queued, apply events idempotently on (station, transactionId, seqNo) in seqNo order, close provisionally only on an explicit not-ongoing answer with nothing queued and no sequence gap, and send anything unclear (rising energy, stale meter, newer transaction) to a person. Update the prompts or tests that quote it.

## 3. Layout and components

```
src/
  run/        Run model: types, recorded loader, live runner, provenance helpers
  story/      beats.ts (the table above as data), useStory (beat index, keyboard, hash)
  board/      Board, nodes (TileField, PatternNode, TimingPlot, OcppReplay, FleetBars,
              HypothesisNode, ContainmentNode, HandoffNode, LabNode, VerificationBars,
              ProveNode, ArticleNode, ChainRow), connectors
  stage/      Claim, ControlBar
  desk/       DeskSheet and tabs: Queue, Incident, Handoff, KnowledgeBase, Coverage, Scorecard
  phone/      PhoneStory (scrolling page, one section per stage)
```

- **Board.** One persistent component. Nodes use Motion `layout` and `layoutId`, so a tile in q1 is the same element in t1 and the same pattern node in t2 and e1. Connectors are SVG paths drawn with `pathLength`.
- **Control bar.** Back · stage name and beat dots · **Open the desk** (D) · Next: <beat or stage>. It is 60 px tall and never covers content.
- **The desk sheet.** A right-hand sheet, `min(1120px, 94vw)`, with a focus trap. Esc closes it and focus returns to the opener. It opens on the tab relevant to the current beat (t1 → Queue, e3 → Incident, v1 → Handoff, and so on).
  - **Queue tab, the console.** The 40 tickets in a dense table: ID, source, site, firmware, lane, component, severity, runbook, provenance. Selecting a row opens an inspector with the full ticket text, the quoted words highlighted in place, the runbook, the trace checks, the model and the cost. "Run it live" lives here too.
  - **Incident tab.** Pattern facts, the timing table, every log in full, the fleet table, ruled-out causes, hypotheses with supports and gaps, containment and the detector run (DETECTOR sessions with hit or no-hit and why).
  - **Handoff tab.** The full packet as an engineer would receive it.
  - **Knowledge base tab.** The article, plus a textarea prefilled with NEW_TICKET_EXAMPLE and "Check against the article" (live classify).
  - **Coverage tab.** The 24-hour ET strip at full size with the hour axis.
  - **Scorecard tab.** Model accuracy against `docs/eval/reference-labels.json`. Until it is measured, the tab says "Not measured yet" and shows the method. Never show placeholder numbers. Below it, the cost of this run per step.
- **Source links (depth 3)** point to `https://github.com/HarishDarko/ev-support-lab/blob/main/...`, built from one constant so they can change.

## 4. Phone (< 1000 px)

One scrolling page with one section per stage, and each beat's claim and board state stacked in order. Sticky top bar with stage chips (`top: env(safe-area-inset-top)`). Animations run once on entering the viewport, and everything is readable at rest. "Open the desk" opens a full-screen sheet. No horizontal scroll at 360 px.

## 5. Motion

As in the direction: 150/250/350 ms, `cubic-bezier(.2,.8,.2,1)`, staggers of 20–40 ms capped at 1.2 s in total.
- Under reduced motion, use crossfades only.
- Beat changes must never stack animations. Rapid presses of → finish or skip the current animation.

## 6. Quality bar

- **Tests:**
  - Unit tests for `beats.ts` (every beat's numbers derive from data) and for the Run model (recorded and live merge, provenance).
  - Playwright on MOCK=1: the whole story by keyboard (every beat reachable, Back works, the stage nav jumps), desk open and close with focus return, both approvals, no console errors, axe on every stage in both themes, phone pass at 390 px with no horizontal scroll, and reduced motion.
- **Performance:** the first stage is interactive in under 1.5 s on a cold load over fast 4G; JS is no more than 250 KB gzip.
- **Accessibility:** WCAG 2.2 AA. `aria-live` announces "Stage 2 of 5, Triage: <claim>".
- **Honesty:** the synthetic label is always visible; every AI item shows its provenance; hypotheses always say "Not confirmed".
