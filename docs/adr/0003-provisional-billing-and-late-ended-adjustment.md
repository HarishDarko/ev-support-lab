# 0003. Provisional billing and late-Ended adjustment

Status: accepted (lab). Revised after review: an Ended whose data is known to be incomplete (no meter value, a seqNo missing, no Started) is not confirmed; a settled invoice is not changed silently.

## Context

When the Ended is lost, billing has two bad options: leave the session open (the customer pays idle fees for a session that ended hours ago) or close it with invented data. A lost Ended is not always lost: some chargers deliver it late, minutes after the backend gave up waiting.

Two further gaps: an Ended can arrive without a meter value, and a replay can later change the facts of a transaction that was already invoiced.

## Decision

- The provisional close uses only what the charger already told us: stop time and energy are the transaction's own last meter sample. Stop reason is `Other` (OCPP 2.0.1 has no "reconciled"). `reconciled_at` and a human-readable reason are recorded.
- The invoice is issued once, with status `PROVISIONAL` and `needs_review = true`.
- **An Ended without a meter value** is a real close but not a trustworthy final reading. The invoice is `PROVISIONAL` at the last reading we hold (possibly zero), with a note saying why. It is not `CONFIRMED` at zero or at an earlier reading.
- **An Ended applied while the sequence is incomplete** (a seqNo missing after the Started, or no Started received; ADR 0002) is `PROVISIONAL` with a note naming the seqNo or the missing Started: the missing event may change the energy or the Ended itself. It is a real close (`close_source` REAL), only the invoice waits. When the missing event arrives the transaction is replayed and the invoice becomes `CONFIRMED` or `ADJUSTED` as below, still one charge. If several reasons apply, the note lists all of them.
- A complete real Ended that arrives later replaces stop time, meter and stop reason. The invoice becomes `ADJUSTED` if the energy differs by more than an epsilon, otherwise `CONFIRMED`, and `needs_review` clears. The same charge is updated; `charges_issued` stays 1.
- **A settled invoice (`CONFIRMED`, `ADJUSTED`) keeps its amount.** If a later replay yields a different final energy, the transaction's facts follow the replay, the invoice is not changed, `needs_review` is set with a note giving both values, and no second charge is created. With the sequence check above this is a safety net: a lower-numbered Ended can only arrive into a gap, and a gap never gets a settled invoice, so over the wire it is not expected to happen. It is covered by a unit test, not by an integration test.

## Consequences

- No idle fee is created for time after the last known activity, and nobody is charged twice.
- Billing review has a clear queue: invoices with `needs_review`. That covers `PROVISIONAL` ones (Ended not received, Ended without a meter value, Ended with events missing or no Started) and settled ones whose facts changed later.
- Only energy is compared. A changed stop time with the same energy does not flag billing; with the lab's energy-only tariff that is correct, a time-based tariff would need to compare it too.
- The lab bills energy only. Real idle fees, taxes, tariffs and payment capture are out of scope; a real system would also have to void or refund a capture when an adjustment lowers the amount.
