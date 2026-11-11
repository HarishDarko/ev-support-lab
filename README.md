# Support Lab

A prototype of Eastern-time production support in three industries: EV charging, SaaS support and e-commerce. Each industry has its own support queue, one recurring incident, and its own lab that reproduces the bug and tests the fix:

- **EV charging, `lab/`:** charging sessions stay open after a charger reconnects. A small OCPP 2.0.1 backend and scripted charger (Java 25, Spring Boot 4, PostgreSQL) reproduce the reconnect bug, fix it behind a per-station flag, and prove the fix with tests.
- **SaaS support, `lab-saas/`:** webhook endpoints are paused by a token-refresh storm. A webhook delivery service with a scripted identity provider and customer endpoint, with the fix behind a per-workspace flag. See [`lab-saas/README.md`](lab-saas/README.md).
- **E-commerce, `lab-ecommerce/`:** orders are stuck in Payment pending after checkout retries a slow payment. A checkout and order service with a scripted payment processor and shoppers, with the fix behind a per-store flag. See [`lab-ecommerce/README.md`](lab-ecommerce/README.md).
- **`desk/`:** the support side (React, TypeScript, Cloudflare Pages Functions), the same for every industry. It covers AI-assisted triage with checks and a person approving every closure, the investigation and the handoff to engineering, verification against a control, and the handover note.

Each lab's CI runs its regression test with the fix turned off and fails if that test passes.

**Live walkthrough:** https://supportdesk.harishdarko.com. It opens on a choice of the three industries. Press → to step through, and D to open the console.

Everything is synthetic. No real company, network, customer or person is described.

**How it was built:** with AI coding assistants. I decided what to build and the rules it had to follow, reviewed the code, and checked it with tests and with independent reviews by separate AI models. The assistants wrote much of the code. What those reviews found, and what changed, is listed on the live site's *Engineering notes* page.

## Start here (about 10 minutes, the EV charging lab; the other two labs have the same shape)

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
./gradlew :lab-saas:test :lab-ecommerce:test
```

**The desk** (no API key needed; `MOCK=1` answers from deterministic rules):

```
cd desk
npm ci
npm test
npx playwright install chromium   # once, before the first browser-test run
npm run e2e
```

## Deploy

The desk is a Cloudflare Pages project (`support-desk`, Direct Upload, no Git build). Production changes only after the tests pass:

- **Normal path:** merge to `main`. The `desk` workflow runs typecheck, lint, unit tests, the build and the browser tests; only if all of them pass does its `deploy` job upload that same build with `wrangler pages deploy`. It needs two repository secrets: `CLOUDFLARE_API_TOKEN` (a token with Account, Cloudflare Pages, Edit) and `CLOUDFLARE_ACCOUNT_ID`.
- **By hand, if Actions is down:** `cd desk && npm run deploy`. It runs typecheck, lint and the unit tests, then the build, and stops before uploading if any of them fails. From a branch other than `main` it makes a preview, not a production deploy. The browser tests are not part of it; run `npm run e2e` first.
- **Rollback:** in the Cloudflare dashboard, Pages, `support-desk`, Deployments, pick the last good production deployment and choose "Rollback to this deployment". That is quick but temporary: the next merge to `main` deploys again. So also `git revert` the bad merge on `main`; the workflow then deploys the reverted build after the tests pass.

## What it does not prove

The EV lab reproduces the backend side of the mechanism with a simulated charger. It says nothing about any real firmware or production system. The canary-against-control experiment runs on scripted inputs: it shows the mechanism, not a measured effect. It does not model:

- OCPP 1.6;
- TxStopPoint configuration;
- OCPI or CDRs;
- idle fees or real payment capture.

The SaaS and e-commerce labs run on scripted parties too (an identity provider, a payment processor) and prove the mechanism, not a measured effect. What each does not model is on the site's *Engineering notes* page for that industry; their READMEs say how the scripted parties work.

## Layout

| Path | What |
| --- | --- |
| `lab/` | EV charging: OCPP 2.0.1 backend, simulator, experiment, 87 tests |
| `lab-saas/` | SaaS support: webhook delivery service, scripted identity provider and endpoint, experiment |
| `lab-ecommerce/` | E-commerce: checkout and order service, scripted payment processor and shoppers, experiment |
| `desk/` | the walkthrough, the console and the AI steps, with unit and browser tests |
| `docs/adr/` | decision records 0001–0003 |
| `docs/specs/` | what each part was built to do |
| `docs/design/direction.md` | the visual direction |
| `docs/eval/` | reference labels for scoring triage models |
