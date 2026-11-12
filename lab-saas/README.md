# lab-saas: webhook endpoints paused by a token-refresh storm

A small webhook delivery service and its scripted customers. It reproduces, on demand, a synthetic version of a known class of bug (a token-refresh "thundering herd"). It fixes the bug behind a per-workspace flag and proves the fix with tests. Everything is synthetic: no real company, customer or identity provider is involved.

**The bug.** Some customer endpoints want an OAuth access token from the customer's own identity provider. The token lasts one hour, and the identity provider keeps one active token per client, so a new token revokes the one before. The product's recurring-task job sends a burst of events on the hour. When the token expires during a burst, this happens:

1. Every delivery in flight gets a 401.
2. Each delivery asks for a new token on its own and retries at once, with no backoff.
3. Each new token revokes the last one, so in each round only the last delivery to refresh gets through.
4. A burst of 32 sends 122 token requests in the same minute. The identity provider allows 100, then answers 429.
5. The deliveries fail. After 15 failures in 60 minutes the endpoint is paused, although the customer's server was up the whole time.

Support's runbook RB-14 (test delivery, then replay) works every time, because by morning a single test delivery gets one token. So the replays look like a fix and the pattern stays hidden.

**The fix** (ENG-5108), on per workspace:
- One shared refresh per endpoint: other threads wait for it and use its token.
- Refresh 5 minutes before expiry, minus a fixed per-endpoint jitter of up to 60 s, so the refresh does not land on the hourly burst.
- After a 401, one retry after the shared refresh.
- A 429 from the token endpoint makes deliveries wait for `Retry-After` instead of failing.
- A revoked client and HTTP errors from the endpoint still count toward the pause.

## Requirements

Java 25 is provisioned by Gradle (toolchain + foojay resolver); any JDK 17+ runs the wrapper. Docker is needed for the tests and the experiment (Testcontainers starts PostgreSQL 17). Spring Boot 4.1.1, Gradle 9.8.1, Flyway, Spring JDBC. Run everything from the repository root.

## Run the tests

```
./gradlew :lab-saas:test
```

Real PostgreSQL, real HTTP to the scripted identity provider and endpoint, scripted clock. The experiment test takes most of the time (about five minutes on a laptop).

| Test | What it checks |
| --- | --- |
| `TokenStormReproductionTest` | flag off: `burst-at-expiry` sends more than 100 token requests, the identity provider answers 429, and the endpoint is paused while it is up ("reproduces: endpoint paused by a token storm") |
| `TokenStormRegressionTest` | flag on (the application default): one shared token request for the burst, all 33 events delivered once, no pause |
| `DeliveryEdgeCasesTest` | `quiet-expiry` refreshes before expiry and never sees a 401 (and costs extra tokens but no pause on the legacy path); `idp-rate-limited` waits for `Retry-After`, then delivers (the legacy path fails the same burst); `revoked-client` and `endpoint-down` still fail and pause; `hmac-endpoint` sends no token requests; `secret-rotated` still fails; a workspace with the flag off keeps the old path |
| `SingleFlightRefreshIT` | with real threads: 32 threads meet an expired token at once (released by a latch); the legacy refresh asks the identity provider 32 times, the shared refresh once, and every thread gets that token |
| `ExperimentStoryTest` | the experiment, run with the committed inputs, yields the story values the support desk shows |

### The regression test fails without the fix

```
./gradlew :lab-saas:test --tests '*TokenStormRegressionTest' -Dlab.fix.enabled=false
```

It fails on an assertion (`AssertionFailedError`). CI runs exactly this and fails the job if the test passes, or if it fails for any other reason.

## How the pool is modelled

The deliveries of one burst are in flight together. In each round, every delivery still in flight makes one attempt, in a fixed order, so a run is repeatable. `SingleFlightRefreshIT` checks the refresh lock itself with real threads.

## See the bug

```
./gradlew :lab-saas:run --args="demo --scenario burst-at-expiry --fix off"
./gradlew :lab-saas:run --args="demo --scenario burst-at-expiry --fix on"
```

Scenarios: `burst-at-expiry`, `quiet-expiry`, `idp-rate-limited`, `revoked-client`, `endpoint-down`, `hmac-endpoint`, `secret-rotated`.

## The experiment

```
./gradlew :lab-saas:run --args="experiment --out build/experiment.json"
```

It plays 20 OAuth endpoints through the service for two 14-day windows:
- Every endpoint gets the hourly job: 2 events on the hour.
- The inputs add the bursts, one 40-minute outage (HTTP 503) and three log captures.
- Support replays paused endpoints every day at 08:30 ET.
- Before: the flag is off everywhere.
- After: the flag is on for the 10 canary workspaces, and the 10 control workspaces stay off.

Inputs are scripted in `src/main/resources/experiment/inputs.json`. Outcomes are computed from the database after each window. `expectedStory` holds the values of the first run (2026-11-11); `ExperimentStoryTest` keeps the run equal to them, and the support desk copies them.

| Value (14 days) | Canary before | Canary after | Control before | Control after |
| --- | --- | --- | --- | --- |
| token requests | 10,573 | 3,342 | 10,474 | 10,562 |
| storms (more than 20 token requests for one endpoint in one minute) | 9 | 0 | 8 | 9 |
| endpoint pauses | 5 | 1 (the real 503 outage) | 4 | 5 |
| events lost (failed and not replayed) | 23 | 0 | 25 | 22 |
| events delivered twice | 0 | 0 | 0 | 0 |

"Lost" events come from storms too small to pause the endpoint: their failed events are never replayed, because nobody is told.

## Layout

```
dev.saaslab
  delivery    worker, token cache (legacy and shared refresh), token client, pause rule, flags, store, trace
  support     ReplayService: what RB-14 does
  simulator   the scripted identity provider and endpoint, scenarios as data, the scenario player
  experiment  harness, inputs, runner, result
  api, cli    a small HTTP surface for serve; serve | demo | experiment
```

Schema (Flyway): `workspace` (with the flag override), `endpoint`, `event`, `delivery_attempt`, `token_request`, `endpoint_pause`.
