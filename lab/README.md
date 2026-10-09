# lab: OCPP 2.0.1 stuck-session reproduction

A small backend and charger simulator that reproduce, on demand, a synthetic version of a known class of reconnect bug (sessions left open after a charger reconnects), fix it behind a feature flag, and prove the fix with tests. Everything is synthetic.

**The bug:** the driver unplugs, the charger sends `TransactionEvent(Updated, EVCommunicationLost)`, the websocket drops (1006, no close frame), the charger reconnects and reports the EVSE `Available`, and then either replays its `TransactionEvent(Ended, offline=true)` late or never sends it. The legacy backend ignores an Ended that arrives while the EVSE is Available, so the transaction stays `Charging` and idle fees keep accruing.

**The fix** ("transaction-aware reconciliation", per station, see `docs/adr/`): transactions are identified by `(station, transactionId)`, events are idempotent on `(station, transactionId, seqNo)` and applied in seqNo order; on reconnect the backend asks `GetTransactionStatus` before doing anything; if the Ended looks lost it closes the transaction provisionally at its own last meter value, but only when the charger explicitly says `ongoingIndicator=false` and `messagesInQueue=false`, no event is missing between the transaction's own Started and the highest seqNo seen, and the last two meter samples are flat, far enough apart and recent (and not dated ahead of the backend's clock). While the charger reports the transaction ongoing the backend keeps it open and does nothing, queued messages or not. Anything else unclear goes to a person: it does not close a session whose recorded energy was still rising, and it leaves a transaction alone when a newer one has started on the same EVSE. A closure is a judgement on the data held, not proof: the backend cannot see energy it was not told about. A late Ended replaces the provisional values once, and the backend does not create a second charge; an Ended that arrives while events are missing is billed `PROVISIONAL` until they arrive.

## Requirements

Java 25 is provisioned by Gradle (toolchain + foojay resolver); any JDK 17+ is enough to run the wrapper. Docker is needed for the tests, the experiment and the demo (Testcontainers starts PostgreSQL 17). Spring Boot 4.1.1, Gradle 9.8.1, Flyway, Spring JDBC, Micrometer.

Run everything from the repository root (`ev-support-lab/`).

## Run the tests

```
./gradlew :lab:test
```

About two and a half minutes, most of it the experiment test. Real websocket, real PostgreSQL, scripted clock.

| Test | What it checks |
| --- | --- |
| `StuckSessionReproductionTest` | flag off: late-ended and lost-ended leave the transaction open ("reproduces: session stays open") |
| `StuckSessionRegressionTest` | flag on: late-ended closes with a `CONFIRMED` invoice; lost-ended is reconciled at the last meter value, `PROVISIONAL` |
| `ReconciliationEdgeCasesTest` | still-delivering (ongoing true: left alone, no flag, also with queued messages; rising energy with ongoing false and ongoing omitted: flagged); two equal samples seconds apart do not allow reconciliation; newer transaction skipped and flagged, also when the charger's clock stepped back between the two transactions; duplicate Ended applied once; queued messages wait, then apply; late Ended after a provisional close adjusts the invoice once; events applied by seqNo, also after a charger clock correction; a sequence gap blocks reconciliation until filled, also when the Started carries a non-zero seqNo (no false gap there); no Started goes to a person; the sweeper skips a station whose flag is off; two stations with the same transactionId and seqNo stay separate; an Ended without a meter value is `PROVISIONAL`; an Ended with a seqNo missing is `PROVISIONAL` until the gap is filled (then `CONFIRMED` or `ADJUSTED`, one charge) |
| `EvseSerializationIT` | the reconciliation decision and a Started take the same per-EVSE lock: a newer transaction that starts while the sweeper waits for it is seen by the decision, a Started waits while a decision holds the lock, and a flag turned off while the sweeper waits stops the reconciliation (turned back on before it decides, the same sweep reconciles) (made deterministic by holding the lock from the test and reading `pg_locks`) |
| `TransactionStateMachineTest`, `ReconciliationPolicyTest`, `OcppFrameTest` | domain, billing and policy, no Spring |
| `OcppProtocolIT` | subprotocol, Boot/Heartbeat, `NotImplemented`, `FormationViolation`, close code 1006 |
| `ExperimentStoryTest` | the experiment, run with the committed inputs, yields the story values |

### The regression test fails without the fix

`StuckSessionRegressionTest` takes the application default `lab.fix.enabled=true`. Force it off and it fails:

```
./gradlew :lab:test --tests '*StuckSessionRegressionTest' -Dlab.fix.enabled=false
```

(`-Dlab.*` is forwarded to the test JVM. Only this test follows the default; the others pin the flag themselves. Running the whole suite with the flag off therefore fails this test and nothing else that should not.)

## See the bug

Play one scenario against an in-process backend (starts PostgreSQL in Docker) and print the gateway log and the resulting transaction:

```
./gradlew :lab:run --args="demo --scenario lost-ended --fix off"
./gradlew :lab:run --args="demo --scenario lost-ended --fix on"
```

Scenarios: `normal`, `late-ended`, `lost-ended`, `still-delivering`, `newer-transaction`, `duplicate-ended`, `queued-messages`, and `very-late-ended` (the Ended arrives after the provisional close).

Or run the backend yourself and drive it from another terminal:

```
docker compose -f lab/compose.yaml up -d
./gradlew :lab:run --args="serve --fix off"
./gradlew :lab:run --args="simulate --scenario lost-ended --station CP-014-02 --speed 20"
curl localhost:8080/actuator/metrics/ocpp.transactions.stuck
```

`--speed 20` plays 20 simulated seconds per real second. The sweeper runs every 5 s on the real clock.

## The experiment

```
./gradlew :lab:run --args="experiment --out build/experiment.json"
```

About two minutes. It plays a seeded synthetic fleet through the backend twice: 14 days with the flag off everywhere (before) and 14 days with it on for the 5 canary stations only (after); 6 control stations never get it. Roughly 9,000 sessions go through the websocket. Each station plays its own timeline on its own thread with its own scripted clock.

**Inputs are scripted** in `src/main/resources/experiment/inputs.json` (versioned); **outcomes are computed** by reading the database after the run. Nothing in the output is written by hand.

| Input | Meaning |
| --- | --- |
| `seed` | Seeds the placement of background sessions. |
| `unplugDropWindowSec` | A drop counts as "near an unplug" when it is within this many seconds after an `EVCommunicationLost` event. |
| `stations` | Canary (5, FW-B) and control (6). Control includes two FW-A sites because the late-ended excerpt in the story is FW-A. |
| `windows[].fixOnCanary` | Whether the per-station flag is set for the canary in that window. |
| `windows[].backgroundSessions` | Normal sessions per group, on top of the incidents. Set so the canary has 2,140 sessions in the after window. |
| `windows[].drops[]` | One incident each: `scenario`, `station`, `day`, `unplugTime` (UTC), optional `evse`, `transactionId`, `params` (see `ScenarioParams`), and `capture`. |
| `drops[].capture` | Records a gateway log excerpt around the incident; `probes` add session-service and map-service lines at given offsets. The three captured incidents use the transaction ids and timings of the story's log excerpts. |
| `expectedStory` | The numbers the story expects. Only used to print and test the comparison; the run does not read them. |

A "drop near unplug" is measured, not declared: a 1006 close within 90 s after the station's `EVCommunicationLost` event, read from `connection_log` and the transaction. The simulator sends `EVCommunicationLost` when its scripted driver unplugs; on a real charger that event reports lost communication with the EV, which usually but not always means a physical unplug, so gateway data alone cannot prove the cable came out.

**Definition of stuck:** a transaction that is still open at the end of the window, on an EVSE the backend sees as `Available`, that has not been flagged for review. Open transactions that were flagged for review are counted separately (`openFlaggedForReview`) and are not part of "stuck". Zero stuck therefore does not mean every session is resolved: flagged sessions are still open until a person acts on them, and a session the backend never learned about is not counted at all.

Output: `build/experiment.json` (metrics per window and group, Micrometer counters, three gateway excerpts, and the comparison with the story) and a console summary.

### Result with the committed inputs

These are the numbers after the stricter policy (identity per station, seqNo order, explicit `ongoingIndicator=false`, minimum sample spacing, staleness bound). They are the same as before it; see below for the one difference.

| Value | Story | Computed |
| --- | --- | --- |
| canary stuck, before / after | 5 / 0 | 5 / 0 |
| control stuck, before / after | 4 / 4 | 4 / 4 |
| reconciliations (canary, after) | 5 | 5 |
| late Ended applied once | 3 | 3 |
| invoices adjusted | 1 | 1 |
| newer-transaction skips | 1 | 1 |
| false closures, duplicate charges | 0, 0 | 0, 0 |
| canary sessions, after | 2,140 | 2,140 |
| canary drops near unplug, before / after | 6 / 5 | 6 / **6** |
| control drops near unplug, before / after | 5 / 6 | 5 / 6 |

The one difference: the canary "after" window has 6 drops near an unplug, not 5. Five are reconciled; the sixth is the newer-transaction case, which drops 37 s after its unplug like the others. The inputs were not bent to hide this. Two further effects are visible in `experiment.json`: the counters show 6 `NEWER_TRANSACTION` flags because 5 are old stuck transactions from the before window that the fix evaluated when their station reconnected (they are reported as `carriedOverFlagged`, not as after-window skips); and the canary has 2 reconciled transactions whose Ended never came (`invoicesStillProvisional`).

The stricter policy changed one thing in `experiment.json`, not the story numbers: the canary still-delivering session at CP-047-02 (charger omits `ongoingIndicator`, energy rising) used to be flagged `ENERGY_STILL_INCREASING`; it is now flagged `ONGOING_NOT_REPORTED`, because an omitted indicator is checked before the meter rule. The outcome is the same (left open, flagged, closed later by its own Ended); the reason is different.

A later change touched `experiment.json` the same way. The canary still-delivering session at CP-014-02 (charger answers `ongoingIndicator=true`) used to be flagged `CHARGER_REPORTS_ONGOING`. An ongoing transaction is now left alone, so it is no longer flagged: `flaggedByReason` loses that entry (3 flags become 2) and so does the `charger_reports_ongoing` counter. The session still ends by its own Ended and every story value is unchanged. The inputs were not touched.

## Layout

```
dev.evlab
  ocpp            OCPP-J frames, message records, gateway (protocol layer), websocket handler
  transaction     domain: Transaction state machine, Billing, repositories, the two event handlers
  reconciliation  ReconciliationPolicy (pure), ReconciliationService (sweeper), scheduler
  station         per-station feature flag, EVSE status, StationTime (time per station)
  observability   Micrometer meters, optional gateway trace in the support-desk log format
  simulator       scripted charger (java.net.http websocket), scenarios as data, runner
  experiment      in-process harness, inputs, runner, queries
  cli             serve | demo | simulate | experiment
```

Schema (Flyway): `station`, `evse_status`, `transaction` (primary key `(station_id, transaction_id)`), `transaction_event` (unique on `(station_id, transaction_id, seq_no)`), `connection_log`.

### Reconciliation settings

`lab.reconciliation.*` in `application.yml`; the reasoning for each is on `ReconciliationPolicy.Settings`.

| Setting | Default | Why |
| --- | --- | --- |
| `grace` | 60 s | time for a replayed Ended to arrive after the charger answered `GetTransactionStatus` |
| `max-queue-wait` | 15 min | how long to wait for a charger that says it has queued messages |
| `epsilon-wh` | 1 Wh | two readings closer than this are "the same" |
| `min-sample-spacing` | 60 s | flat energy over less than this proves nothing; at 1 Wh it means under about 60 W |
| `max-meter-age` | 30 min | an older last sample says nothing about what the session did since |
| `max-clock-skew` | 2 min | how far ahead of the backend's clock the last sample may be; beyond that its age cannot be judged and it goes to a person (`METER_IN_FUTURE`) |

**The per-station flag.** Turning the flag off stops any reconciliation that has not yet been decided; it does not undo ones already made. The sweeper looks at the flag when it lists a candidate and again after it holds the EVSE lock and the transaction row lock, immediately before it decides, so a sweep that was waiting for a lock when the flag went off takes no action at all (no closure, no review flag). A provisional close that was already made stays; a late Ended still adjusts it. A change made through the application takes effect at once; one made directly in the database is seen when the 5 s cache expires.

**"Newer transaction"** means the backend received its Started later, not that the charger stamped it later. The backend records `started_received_at` with its own clock under the EVSE lock, so receipt order is monotonic per EVSE, while a charger clock can be corrected backwards between two transactions. A transaction whose Started was never received has no `started_received_at`; it is never counted as newer and goes to a person as `STARTED_NOT_RECEIVED`.

Flagged sessions carry a `ReviewReason`: `NEWER_TRANSACTION`, `ENERGY_STILL_INCREASING`, `ONGOING_NOT_REPORTED`, `SEQUENCE_GAP`, `STARTED_NOT_RECEIVED`, `INSUFFICIENT_METER_SAMPLES`, `SAMPLES_TOO_CLOSE`, `METER_STALE`, `METER_IN_FUTURE`, `NO_STATUS_ANSWER`, `QUEUE_NOT_DELIVERED`. A charger that answers `ongoingIndicator=true` is not on this list: its transaction is active, so the backend waits.

Observability: structured `event=... key=value` log lines and Micrometer counters `ocpp.transactions.reconciled`, `ocpp.events.duplicate`, `ocpp.ended.late.applied{after}`, `ocpp.transactions.flagged{reason}` and the gauge `ocpp.transactions.stuck` (Prometheus names: `ocpp_transactions_reconciled_total`, ...). Available at `/actuator/metrics`.

## Known limits

What this lab does not model, and where its answers should not be trusted:

- OCPP subset only: BootNotification, Heartbeat, StatusNotification, TransactionEvent (with meter values inside), and GetTransactionStatus from the backend. No authorization, no security profiles, no TLS, no message retries or `MessageId` de-duplication on the RPC layer.
- Energy is the session energy in Wh, taken from `Energy.Active.Import.Register` (kWh converted). Real meters report a cumulative register; here it starts at 0 for each transaction. Billing is energy only; there are no idle fees, taxes or payment capture.
- One backend instance. Row locks serialize events per transaction, and an advisory lock per EVSE serializes "is there a newer transaction?" against a Started (lock order: EVSE, then transaction row; ADR 0001). Both are database locks, but nothing here has been tried with several instances or a load balancer.
- The meter-flatness rule is a heuristic, not proof that a session stopped. It can be fooled by a charger that reports flat samples, `ongoingIndicator=false` and then keeps delivering. The minimum spacing, staleness bound and explicit `ongoingIndicator=false` narrow that; they do not remove it.
- Sequence gaps are detected only between events that arrived, counted from the transaction's own Started (which may carry any seqNo, so a charger with one ever-increasing counter is fine). If the last events of a transaction are never sent, nothing shows a gap. If no Started was received there is nothing to count from, so the transaction counts as incomplete and goes to a person (`STARTED_NOT_RECEIVED`). A charger that shares one counter between transactions running at the same time will show gaps in each and go to a person.
- A session whose charger keeps reporting it ongoing stays open and unflagged for as long as that holds. There is no timeout: the answer is a snapshot taken at the reconnect, the next reconnect asks again, and long sessions are legitimate. Alerting on sessions open for an unusually long time is a separate concern and not built here.
- Clock skew is handled in one place only: a last meter sample dated more than `max-clock-skew` ahead of the backend goes to a person. Smaller skew, or a charger clock that is behind, is not corrected for. Which transaction is newer does not depend on the charger clock (see above); meter sample ages and spacings still do.
- Not modelled: OCPP 1.6J (`StartTransaction`/`StopTransaction`, integer transaction ids), `TxStartPoint`/`TxStopPoint` configuration and the events it changes, CDR/OCPI roaming records, real payment capture, void or refund, idle fees and taxes, cumulative meter registers (energy here is per transaction from 0), and clock synchronisation between charger and backend.
- The lock tests (`EvseSerializationIT`) are deterministic, but they see "a session is waiting for an advisory lock" in `pg_locks`, not which session or which lock. They are only exact because exactly one other session waits at a time; they would not tell two waiters apart.
- Billing review is a flag and a note on the invoice. There is no review queue, workflow or notification.
- The scenarios are idealised: the firmware lines are not modelled, only the behaviours (late Ended, lost Ended). Timestamps are UTC.
- Experiment time is scripted, so the production scheduler is switched off and the sweeper is called at the scheduled ticks. The scheduler itself (`ReconciliationScheduler`) is not exercised by a test.
