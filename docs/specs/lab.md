# Spec: the OCPP reproduction lab (`lab/`)

## Purpose

A small, honest engineering artefact that reproduces, on demand, a synthetic version of a known class of reconnect bug, fixes it behind a flag, and proves the fix with tests. Correctness, clarity and tests matter more than breadth.

**Principle:** the inputs are scripted, the outcomes are computed by real code. Never hard-code a result the code is supposed to produce.

## The bug

"Sessions stay open after a charger reconnects."

1. During a charging transaction the driver unplugs. The charger sends `TransactionEvent(eventType=Updated, triggerReason=EVCommunicationLost)`.
2. Within about 90 s of the unplug, the charger's websocket drops: close code 1006, no close frame.
3. The charger reconnects and sends `StatusNotification(connectorStatus=Available)`.
4. The charger then replays its queued `TransactionEvent(eventType=Ended, offline=true, seqNo=n, stoppedReason=EVDisconnected)`, carrying the original timestamp.
   - **Late variant:** the Ended arrives after the Available.
   - **Lost variant:** the Ended never arrives, e.g. a firmware that drops its queue on reconnect.
5. **Legacy backend behaviour (the bug):**
   - A TransactionEvent Ended that arrives while the EVSE is already Available is treated as out of order and ignored; the response is an empty TransactionEventResponse.
   - In the lost variant nothing closes the transaction.
   - Either way the transaction stays open: state Charging, idle fee accruing, and the EVSE shows "in use" downstream.

## The fix (behind a feature flag, per station)

"Transaction-aware reconciliation":

1. **Idempotent, ordered event handling.**
   - A transaction is identified by `(stationId, transactionId)`: OCPP transactionIds are only unique per station.
   - Every TransactionEvent is keyed by `(stationId, transactionId, seqNo)`; a duplicate is acknowledged and ignored.
   - Events apply in `seqNo` order, not arrival order and not timestamp order (the charger's clock can be corrected mid-session). A seqNo missing between the transaction's own Started and the highest seen (the Started may carry any seqNo) blocks automatic reconciliation and flags the transaction; so does a transaction with no Started.
   - A late Ended for an open transaction is applied, regardless of the EVSE status.
2. **Ask before closing.** When a station reconnects (a new websocket session) while the backend holds an open transaction on it, the backend sends `GetTransactionStatus(transactionId)`.
   - If `messagesInQueue=true`, keep the transaction open and wait for the queued events.
   - Reconcile only on an explicit `ongoingIndicator=false` with `messagesInQueue=false`; an omitted indicator goes to a person. `ongoingIndicator=true` means the transaction is active: keep it open and do nothing, whether or not messages are queued. That is not a review flag.
   - If those hold, and no Ended arrives within a grace period (configurable; default 60 s, made short in tests via an injectable `Clock`), the Ended is treated as lost. Go to step 3.
3. **Provisional reconciliation**, only when the data held supports "the Ended is lost" (a judgement, not proof):
   - Close the transaction at its own last recorded meter value and timestamp.
   - Mark its invoice `PROVISIONAL` for billing review.
   - Record `reconciledAt` and the reason.
4. **Safety rules:**
   - Do not reconcile a transaction whose energy was still increasing in its last meter values. The rule: the last two meter samples differ by more than a small epsilon, or the charger says ongoing. Flat energy counts only if the last two samples are at least a minimum interval apart and the last sample is recent (not older than a bound, and not dated beyond a small clock-skew allowance ahead of the backend). Leave it open and flag it for a person otherwise. The rule is a heuristic: it cannot see energy it was not told about.
   - If a newer transaction (by the backend's receipt order of the Starteds, not the charger's timestamps) has already started on the same EVSE, do not touch the old one automatically. Flag it for a person ("newer transaction skip"). The check and the close happen under a per-EVSE lock that a Started also takes, so a newer transaction cannot start in between.
   - The sweeper skips stations whose feature flag is off, checked again after the locks are held and immediately before the decision: turning the flag off stops any reconciliation that has not yet been decided; it does not undo ones already made.
5. **Late Ended after a provisional close.** Apply it once. Replace the provisional stop time, meter and stop reason with the real ones, mark the invoice `ADJUSTED` if the energy differs (else `CONFIRMED`), and do not create a second charge. An Ended without a meter value, or applied while a seqNo is missing or no Started was received, gives a `PROVISIONAL` invoice, not a confirmed one; a replay that changes a settled invoice's facts flags billing for review instead of changing it.

With the flag off the legacy behaviour applies, so the bug reproduces.

## Scope

**OCPP-J 2.0.1 over websocket, a subset only:**
- Server endpoint `/ocpp/{stationId}`, subprotocol `ocpp2.0.1`.
- Frames: CALL `[2, id, action, payload]`, CALLRESULT `[3, id, payload]`, CALLERROR `[4, id, code, description, details]`.
- Charger to backend: BootNotification, Heartbeat, StatusNotification, TransactionEvent (Started, Updated, Ended), plus MeterValues inside TransactionEvent.
- Backend to charger: GetTransactionStatus.

Payload shapes follow OCPP 2.0.1 naming (`transactionInfo.transactionId`, `seqNo`, `offline`, `triggerReason`, `meterValue[].sampledValue[]`, `evse.id`, `connectorStatus`). Implement only the fields used.

**Persistence:** PostgreSQL via Spring Data JDBC or JPA, with Flyway migrations. Tables:
- `station`
- `transaction`: keyed by (station_id, transaction_id); state, evse_id, last_seq_no, last_meter_wh, started_at, stopped_at, stop_reason, invoice_status, reconciliation fields
- `transaction_event`: the idempotency record, unique on (station_id, transaction_id, seq_no)
- `evse_status`

**Charger simulator** (in `lab`, test scope plus a small runnable CLI). A scripted charger with a real websocket client. Scenarios as data:
- `normal`
- `late-ended`: FW-A-like
- `lost-ended`: FW-B-like
- `still-delivering`: the drop happens but energy keeps increasing, so the session must not close
- `newer-transaction`: a new session starts on the EVSE before reconciliation
- `duplicate-ended`: the same Ended is sent twice
- `queued-messages`: GetTransactionStatus answers `messagesInQueue=true`, then the Ended arrives

**Experiment runner** (CLI): `./gradlew :lab:run --args="experiment --out build/experiment.json"`.
- Runs a seeded synthetic fleet through the backend twice: the 14-day "before" window with the flag off everywhere, and the 14-day "after" window with the flag on for the canary stations only.
- **Scripted inputs.** Per window and group:
  - canary: 5 stations; control: 6 stations
  - before: canary 6 drops near unplug, control 5
  - after: canary 5 drops near unplug, control 6
  - the late/lost/still-delivering/newer-transaction mix per drop
  - background normal sessions so the canary has about 2,140 sessions in the after window

  Keep the inputs in a versioned JSON file `lab/src/main/resources/experiment/inputs.json`, with comments in the README explaining each.
- **Computed outputs.** Stuck sessions per group and window, reconciliations, late Ended applied once, duplicate charges (must be 0), false closures (must be 0), newer-transaction skips, invoices provisional/adjusted. Plus three gateway log excerpts captured from real traffic (one late-ended, two lost-ended), in the format `HH:MM:SS  actor  message`.
- **Expected story values** (the inputs are designed to produce these): canary stuck 5 before and 0 after; control 4 before and 4 after; 5 reconciliations; 3 late Ended applied once; 1 newer-transaction skip; 0 false closures; 0 duplicate charges.
  - If the computed outputs differ, **do not fudge them**. Report the difference; the story will follow the code.

**Observability:** structured logs plus Micrometer counters, e.g. `ocpp_transactions_reconciled_total`, `ocpp_transactions_stuck` (gauge), `ocpp_ended_late_applied_total`, `ocpp_events_duplicate_total`. No dashboards needed.

## Tests (JUnit 5, Testcontainers PostgreSQL, real websocket)

1. `StuckSessionReproductionTest`, flag off: the late-ended and lost-ended scenarios leave the transaction open.
   - The test asserts the bug exists and is named to say so: "reproduces: session stays open".
2. `StuckSessionRegressionTest`, flag on: the same scenarios close correctly.
   - late-ended: closed by the real Ended, invoice CONFIRMED.
   - lost-ended: provisionally reconciled at the last meter value.
   - Run with the flag forced off (`-Dlab.fix.enabled=false` or a profile), this test **fails**. The README shows how.
3. Edge cases:
   - still-delivering: a charger that reports it ongoing is left alone (no flag); rising energy or an omitted indicator is flagged;
   - newer-transaction is skipped and flagged;
   - duplicate-ended is applied once;
   - queued-messages waits, then applies;
   - a late Ended after a provisional close adjusts the invoice once, with no second charge;
   - events out of order are applied by seqNo;
   - a Started with a non-zero seqNo is not a gap, a real gap after it is; no Started goes to a person;
   - an Ended with a seqNo missing is billed `PROVISIONAL`;
   - a last meter sample dated in the future goes to a person;
   - the sweeper skips a station whose flag is off;
   - the reconciliation decision and a Started serialize on the EVSE.
4. Unit tests for the transaction state machine and the reconciliation policy, without Spring.
5. An experiment test: running the runner with the committed inputs yields the expected story values.

## Engineering bar

- **Toolchain:** Java 25 via a Gradle toolchain (the foojay resolver so the JDK auto-provisions), Spring Boot 4.x if it builds cleanly on Java 25 (otherwise the latest 3.x that supports 25; say which), Gradle wrapper, Kotlin DSL.
- **Design:** a clear package structure (`ocpp` protocol layer, `transaction` domain, `reconciliation` policy, `simulator`, `experiment`). Domain logic stays free of Spring where practical; time comes from an injected `Clock`.
- **Code style:** small, readable classes; no Lombok; Java records for messages. Comments only where the why is not obvious.
- **README for `lab/`:** what it reproduces, how to run the tests, how to see the bug (flag off), the experiment, and the limits. Plain, short, no marketing.
- **Decision records** in `docs/adr/`: 0001 transaction-aware reconciliation, 0002 identity and idempotency by (station, transactionId, seqNo), 0003 provisional billing and late-Ended adjustment. One page each: context, decision, consequences.
- **Naming:** no real company or person names anywhere. Everything is synthetic.
