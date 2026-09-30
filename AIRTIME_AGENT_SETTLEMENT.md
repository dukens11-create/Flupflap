# Airtime agent settlement

The HTTP sale handler reserves funds and creates the sale/debit ledger row in
one database transaction before calling Reloadly. A unique idempotency key and
conditional balance decrement prevent duplicate debits and overspending.
Replays (including unique-key races) must match both the seller and sale details.

Provider outcomes use four persisted string states; no schema migration is needed:

- `PENDING`: provider reports processing; debit remains reserved.
- `UNKNOWN`: transport/HTTP/parsing ambiguity, invalid provider result, or local
  settlement failure; debit remains reserved and reconciliation is required.
- `SUCCESSFUL`: confirmed result with a valid bound provider transaction ID;
  lifetime sales and commission are incremented atomically once.
- `FAILED`: confirmed provider failure with a valid bound transaction ID;
  the debit is refunded and one refund ledger entry is created atomically.

The conditional `PENDING/UNKNOWN -> terminal` sale update and all financial
effects occur in the same transaction. A losing/repeated settlement returns the
existing terminal record. Contradictory terminal results never reverse it.
Database errors roll back settlement, not the earlier durable reservation.
If writing `UNKNOWN` also fails, the handler returns 503 with
`AIRTIME_RECONCILIATION_REQUIRED`; the durable sale remains unresolved. Its
original external reference and idempotency key must be retained. The browser
retains its pending key on server errors rather than generating a fresh purchase.

## Reconciliation boundary

The existing Reloadly adapter only submits top-ups; it does not implement a
verified transaction/reference lookup. This change deliberately adds no invented
lookup endpoint, automatic resend, scheduled refund, or manual refund API.
Unresolved funds remain reserved until an authoritative result is obtained.

`settleAirtimeProviderResult` is an internal settlement function shared by the
submission handler and a future server-side lookup integration. It can resolve
`PENDING/UNKNOWN` to success or failure after verified lookup, validates any
returned external reference and previously bound transaction ID, and prevents
duplicate settlement. It is not exposed to customer/admin request bodies.
For a sale without a bound provider ID, any future lookup must authenticate and
match the original external reference before invoking this function. Do not
call it with browser-provided status or manually change sale status/wallet rows.

Only sanitized outcome/transaction metadata and fixed diagnostic codes are
stored by this handler. Provider credentials and raw exception messages are
neither stored in these diagnostics nor returned to the browser.

## Verification

`tests/airtime-agent-sales.test.ts` exercises the exact production HTTP handler
with real Request/Response objects, a mocked provider, and a transactional
database double implementing conditional writes, unique keys, isolation and
rollback. It covers concurrent sales/replays, ownership conflicts, all four
outcomes, duplicate settlement, and persistence failures. These are not live
PostgreSQL concurrency tests; run those separately before production activation.
The existing helper tests remain in `tests/airtime-agent.test.ts`.

Admin/seller authorization, profile currency locking, positive-only funding,
guarded admin adjustments, and the PR quality workflow remain unchanged.
