# 0002. Identity and idempotency: (station, transactionId, seqNo), ordered by seqNo

Status: accepted (lab). Revised after review: identity scoped to the station, order by seqNo instead of timestamp; sequence counted from the transaction's own Started.

## Context

Chargers replay queued events after a reconnect and may retry an Ended whose response they did not see. OCPP 2.0.1 gives every `TransactionEvent` a `seqNo` that increases within a transaction. Offline events carry their original `timestamp`, so arrival order and event order differ.

Two things were wrong in the first version:

- **Identity.** A `transactionId` is assigned by the charger and is only unique per charging station. Keying on `transactionId` alone lets two stations that both start a transaction `1` overwrite each other, and drops the second station's seqNo 0 as a duplicate.
- **Order.** Sorting by timestamp trusts the charger's clock. A clock corrected backwards mid-session sorts an Ended before its Started.

The legacy path applies events as they arrive, mutates the transaction in place, and has no record of what it has seen.

## Decision

- A transaction is identified by `(station_id, transaction_id)`: the primary key, every repository lookup, the row lock and the foreign key from `transaction_event`.
- Every event is stored in `transaction_event` with a unique key on `(station_id, transaction_id, seq_no)`. A conflicting insert is a duplicate: counted (`ocpp.events.duplicate`), acknowledged with an empty `TransactionEventResponse`, no effect.
- The transaction is derived, not patched: after each new event it is rebuilt by folding its events sorted by **seqNo** through one pure state machine (`Transaction.apply`). The timestamp is only a tiebreak, which the unique key makes unreachable for stored events. An Ended that arrives before the Started still produces the right result once the Started arrives.
- A **sequence gap** is a seqNo missing between the lowest seqNo of the transaction's Started and the highest seen. The Started need not carry 0: OCPP 2.0.1 lets a charger keep one counter that only increases, so completeness is judged from the transaction's own start. A gap is recorded on the transaction (`first_missing_seq_no`) and blocks automatic reconciliation (ADR 0001) until the missing event arrives. Events numbered below the Started are not counted.
- **No Started received:** there is nothing to count from, so no gap can be reported and none can be ruled out. The transaction is treated as incomplete: reconciliation does not proceed (`STARTED_NOT_RECEIVED`, a person looks) and an Ended is billed `PROVISIONAL` (ADR 0003). The case resolves when the Started arrives.
- A gap at the end (the last events never sent) cannot be seen.
- Events after the first Ended (in seqNo order) are stored but do not change the outcome.
- Concurrency: the transaction row is locked (`insert ... on conflict do update ... returning`) for the duration of the event, so two events for one transaction are applied one at a time. A `Started` first takes the per-EVSE lock (lock order and reason in ADR 0001, Decision 7), so it cannot slip in between the reconciliation decision "no newer transaction" and the close.

## Consequences

- Duplicates, reordering and clock corrections are handled by one mechanism instead of special cases.
- Cost: each event reads that transaction's events again. Transactions have tens of events, so this is cheap. A high-volume system could keep the fold incremental and refold only when an event arrives out of order.
- Reconciliation and billing are not events from the charger, so they live on the transaction row and are merged over the fold (`Transaction.rebase`).
- A charger that reuses a `seqNo` with different content has its second message ignored. A charger that shares one counter between transactions running at the same time shows gaps in each and goes to a person; the lab does not try to separate such counters.
- Meter timestamps still come from the charger's clock. They are used for sample spacing and staleness; a stepped clock makes those checks fail toward a person, not toward closing.
