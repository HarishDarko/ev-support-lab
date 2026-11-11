# lab-ecommerce: orders stuck in Payment pending after checkout retries a slow payment

A small checkout and order service, a scripted payment processor and scripted shoppers. It reproduces, on demand, a synthetic version of a known class of bug (a retry with a new idempotency key). It fixes the bug behind a per-store flag and proves the fix with tests. **Everything is synthetic:** the shop, its five regional stores, the shoppers, the cards, the processor and every number are made up. No real company, customer, card or payment processor is involved.

**The bug (INC-0539).** Checkout gives the payment processor 8 seconds to answer. When the answer is later:

1. The web page shows "Something went wrong". Some shoppers pay again; the app retries by itself 0.5 s after the timeout.
2. Each attempt is sent with a new idempotency key, so the processor, doing what it is asked, makes a second authorization.
3. The first answer still arrives (as the processor's `authorization.succeeded` webhook), and the order service captures it.
4. The second authorization then arrives on an order that is already captured. By design, the order service holds the order in Payment pending for a person.
5. When the two webhooks arrive closer together than one capture takes (the app's retry), two workers each check "no capture yet" and both capture: the customer is charged twice.

Support's runbook RB-21 (check one capture, void the extra authorization, release the hold) works every time, so each order looks like a one-off.

**The fix** (ENG-5230), on per store:
- The idempotency key is made once per checkout and reused on every retry, so a retry returns the first authorization.
- A new key only when the card or the amount changes, so a new card after a decline still authorizes normally.
- On a timeout, checkout asks the processor for the payment by its key before it shows anything ("Your payment is still processing").
- The order service captures under a per-order lock (`select ... for update`), so two authorizations can never both be captured.

## Requirements

Java 25 is provisioned by Gradle (toolchain + foojay resolver); any JDK 17+ runs the wrapper. Docker is needed for the tests and the experiment (Testcontainers starts PostgreSQL 17). Spring Boot 4.1.1, Gradle 9.8.1, Flyway, Spring JDBC. Run everything from the repository root.

## Run the tests

```
./gradlew :lab-ecommerce:test
```

Real PostgreSQL, real HTTP both ways (checkout to the processor, the processor's webhooks to the order service), scripted clock. The experiment test takes most of the time.

| Test | What it checks |
| --- | --- |
| `SecondAuthorizationReproductionTest` | flag off: `slow-web-repay` and `slow-app-retry` leave two keys, two authorizations, one capture and the order in Payment pending; `app-race` captures twice ("reproduces: second authorization, order held") |
| `SecondAuthorizationRegressionTest` | flag on (the application default): the same three scenarios give one key, one authorization, one capture and a confirmed order |
| `CheckoutEdgeCasesTest` | `fast-pay` never retries or looks up; `slow-web-wait` is told "still processing" and confirms (and sees the old error on the legacy path, but still confirms); `decline-new-card` gets a new key and a correct authorization; `very-slow` is looked up by key and the second tap returns the first authorization; `capture-webhook-timeout` is still held with the fix on (not this bug); a store with the flag off keeps the old path; RB-21 releases a held order and voids the extra authorization, and refuses an order captured twice |
| `CaptureSerializationIT` | the double capture, with real threads, made deterministic: worker 1 is held between its check and its capture; worker 2 then runs until it finishes or PostgreSQL shows it waiting for a lock (`pg_locks`). Off, both capture; on, worker 2 waits for the order lock, sees the first capture and holds the order |
| `ExperimentStoryTest` | the experiment, run with the committed inputs, yields the story values the support desk shows and exactly the committed `experiment.json` |

### The regression test fails without the fix

```
./gradlew :lab-ecommerce:test --tests '*SecondAuthorizationRegressionTest' -Dlab.fix.enabled=false
```

It fails on an assertion (`AssertionFailedError`) in all three scenarios. CI runs exactly this and fails the job if the test passes, if it wrote no report, if any failure is not an assertion (a crash does not count as "fails without the fix"), or if any scenario passes.

## How time and the race are modelled

Time is scripted. The processor answers each HTTP request at once and stamps its answer with the scripted moment it would arrive (`Answered-At`); checkout treats an answer stamped after its 8 s timeout as one it never received, as a client that stopped waiting would. The processor's webhooks are sent over HTTP at their scripted time. Two webhooks for one order less than 50 ms apart (one capture's time) are handled by two workers at once, played the same way every run by the capture gate and `pg_locks`, so the experiment repeats exactly.

## See the bug

```
./gradlew :lab-ecommerce:run --args="demo --scenario slow-web-repay --fix off"
./gradlew :lab-ecommerce:run --args="demo --scenario app-race --fix off"
./gradlew :lab-ecommerce:run --args="demo --scenario app-race --fix on"
```

Scenarios: `fast-pay`, `slow-web-repay`, `slow-web-wait`, `slow-app-retry`, `app-race`, `decline-new-card`, `very-slow`, `capture-webhook-timeout`.

## The experiment

```
./gradlew :lab-ecommerce:run --args="experiment --out experiment.json"
```

Run from the repository root, Gradle runs it in `lab-ecommerce/`, so this writes `lab-ecommerce/experiment.json`. It plays five synthetic regional stores through the service for two 14-day windows:
- Every store has 117 to 119 regular checkouts a day between 07:00 and 23:00 ET, with processor answers under 8 s.
- The inputs add the scripted slow checkouts (web shoppers who pay again or wait, app checkouts), declined cards followed by a new card, one webhook that never comes, and the log captures.
- Before: the flag is off everywhere.
- After: the flag is on for the canary store (store-north), and the 4 control stores stay off.

Inputs are scripted in `src/main/resources/experiment/inputs.json`. Outcomes are computed from the database after each window and written to `experiment.json`. `expectedStory` holds the values of the first run; `ExperimentStoryTest` keeps the run equal to them and to `experiment.json`, and the support desk copies them.

RESULTS_TABLE

## Layout

```
dev.shoplab
  checkout    CheckoutService: the authorization request, the timeout, the key (legacy and fix)
  orders      OrderService: webhooks, capture, the hold rule, the per-order lock; the capture gate
  payment     ProcessorClient: HTTP to the processor
  shop        store (JDBC), flags, the log trace
  support     ReleaseHoldService: what RB-21 does
  simulator   the scripted processor, the scripted shoppers and world, the race dispatcher, scenarios as data
  experiment  harness, inputs, runner, result
  api, cli    webhook, checkout and support endpoints; serve | demo | experiment
```

Schema (Flyway): `store` (with the flag override), `checkout` (the idempotency key lives here with the fix), `orders`, `payment_attempt`, `payment_lookup`, `payment_authorization` (`authorization` is a reserved word in SQL), `capture` (one row per capture, so a double capture is visible).
