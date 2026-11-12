-- A made-up shop: regional stores on one checkout service. Everything in this lab is synthetic.

create table store (
    id            text primary key,
    name          text not null,
    -- The store's account at the payment processor.
    processor_url text not null,
    -- ENG-5230 per store: null follows lab.fix.enabled.
    fix_override  boolean
);

create table checkout (
    id              text primary key,
    store_id        text not null references store (id),
    order_id        text not null,
    channel         text not null,          -- web | ios | android
    amount_pence    integer not null,
    attempts        integer not null default 0,
    -- With the fix, the idempotency key lives here: made once, kept until the card or the amount changes.
    idempotency_key text,
    key_card        text,
    key_amount      integer,
    key_seq         integer not null default 0,
    created_at      timestamptz not null
);

create table orders (
    id             text primary key,
    store_id       text not null references store (id),
    checkout_id    text not null references checkout (id),
    amount_pence   integer not null,
    status         text not null,           -- AWAITING_PAYMENT | CONFIRMED | PAYMENT_PENDING
    hold_reason    text,
    -- Set when checkout saw an authorization: the processor's webhook is expected by then.
    webhook_due_at timestamptz,
    created_at     timestamptz not null,
    updated_at     timestamptz not null
);

-- Every authorization request checkout sent, and what checkout saw of it.
create table payment_attempt (
    id               bigserial primary key,
    checkout_id      text not null references checkout (id),
    order_id         text not null,
    attempt_no       integer not null,
    idempotency_key  text not null,
    card             text not null,
    sent_at          timestamptz not null,
    outcome          text not null,         -- authorized | declined | timed_out
    authorization_id text,
    answered_at      timestamptz
);

-- With the fix, checkout asks the processor for the payment by its key before it shows an error.
create table payment_lookup (
    id              bigserial primary key,
    order_id        text not null,
    idempotency_key text not null,
    at              timestamptz not null,
    answer          text not null           -- processing | authorized | declined | not_found
);

-- "authorization" is a reserved word in SQL, hence the prefix.
create table payment_authorization (
    id              text primary key,
    order_id        text not null,
    idempotency_key text not null,
    amount_pence    integer not null,
    status          text not null,          -- authorized | captured | voided
    first_seen_at   timestamptz not null
);

-- One row per capture, so a double capture is visible.
create table capture (
    id               bigserial primary key,
    order_id         text not null,
    authorization_id text not null,
    amount_pence     integer not null,
    captured_at      timestamptz not null
);

create index payment_attempt_order on payment_attempt (order_id);
create index payment_authorization_order on payment_authorization (order_id);
create index capture_order on capture (order_id);
create index orders_store_created on orders (store_id, created_at);
create index checkout_store_created on checkout (store_id, created_at);
