# EV Support Lab

A prototype of Eastern-time production support for an EV-charging network, built around one recurring incident: charging sessions left open after a charger reconnects. It has two parts:

- **`lab/`:** a small OCPP 2.0.1 backend and scripted charger (Java 25, Spring Boot 4, PostgreSQL). It reproduces a known class of reconnect bug on demand, fixes it behind a per-station flag, and proves the fix with tests.
- **`desk/`:** the support side (React, TypeScript, Cloudflare Pages Functions). It covers AI-assisted triage with checks and a person approving every closure, the investigation and the handoff to engineering, verification against a control, and the handover note.

**Live walkthrough:** https://supportdesk.harishdarko.com. Press → to step through, and D to open the console.

Everything is synthetic. No real company, network, customer or person is described.

**How it was built:** with AI coding assistants. I decided what to build and the rules it had to follow, reviewed the code, and checked it with tests and with independent reviews by separate AI models. The assistants wrote much of the code. What those reviews found, and what changed, is listed on the live site's *Engineering notes* page.

## Start here (about 10 minutes)

1. **The bug, reproduced.** [`StuckSessionReproductionTest`](lab/src/test/java/dev/evlab/transaction/StuckSessionReproductionTest.java) passes while the bug exists: the late or missing Ended leaves the session open. [`StuckSessionRegressionTest`](lab/src/test/java/dev/evlab/transaction/StuckSessionRegressionTest.java) passes with the fix on and fails with it off, and CI checks that it fails.
2. **The decision.** [`ReconciliationPolicy.java`](lab/src/main/java/dev/evlab/reconciliation/ReconciliationPolicy.java) is one pure function with documented thresholds. It closes provisionally only on an explicit "not ongoing, nothing queued" answer, with the Started received and no seqNo gaps. Anything unclear goes to a person.
3. **The edge cases.** [`ReconciliationEdgeCasesTest`](lab/src/test/java/dev/evlab/transaction/ReconciliationEdgeCasesTest.java) and [`EvseSerializationIT`](lab/src/test/java/dev/evlab/transaction/EvseSerializationIT.java) cover:
   - duplicates and out-of-order events;
   - sequence gaps;
   - energy still rising;
   - a newer transaction, including after a charger clock step;
   - the per-charging-point lock;
   - the flag turned off mid-sweep.
4. **The decisions and their trade-offs:** [`docs/adr/`](docs/adr).
5. **The limits:** "Known limits" in [`lab/README.md`](lab/README.md), and the *Engineering notes* page, which also covers how the same race looks on OCPP 1.6.
6. **How AI output is checked on the support side:** [`desk/functions/_lib/validate.ts`](desk/functions/_lib/validate.ts) and its cases in [`desk/tests/attacks.test.ts`](desk/tests/attacks.test.ts). These cover:
   - exact-quote checks;
   - runbook fit;
   - a rules fallback;
   - the repeat rule;
   - the meter check before a record-only closure.

## Run it

**The lab** (needs Docker; Gradle provisions Java 25):

```
./gradlew :lab:test
./gradlew :lab:run --args="demo --scenario lost-ended --fix off"
```

**The desk** (no API key needed; `MOCK=1` answers from deterministic rules):

```
cd desk
npm ci
npm test
npx playwright install chromium   # once, before the first browser-test run
npm run e2e
```

## What it does not prove

The lab reproduces the backend side of the mechanism with a simulated charger. It says nothing about any real firmware or production system. The canary-against-control experiment runs on scripted inputs: it shows the mechanism, not a measured effect. It does not model:

- OCPP 1.6;
- TxStopPoint configuration;
- OCPI or CDRs;
- idle fees or real payment capture.

## Layout

| Path | What |
| --- | --- |
| `lab/` | OCPP 2.0.1 backend, simulator, experiment, 87 tests |
| `desk/` | the walkthrough, the console and the AI steps, with unit and browser tests |
| `docs/adr/` | decision records 0001–0003 |
| `docs/specs/` | what each part was built to do |
| `docs/design/direction.md` | the visual direction |
| `docs/eval/` | reference labels for scoring triage models |
