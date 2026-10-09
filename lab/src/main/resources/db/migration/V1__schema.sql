create table station (
    station_id    text primary key,
    firmware      text,
    -- per-station feature flag; null means "use lab.fix.enabled"
    fix_enabled   boolean,
    connected     boolean     not null default false,
    first_seen_at timestamptz not null,
    last_seen_at  timestamptz not null
);

create table evse_status (
    station_id       text        not null references station (station_id),
    evse_id          integer     not null,
    connector_status text        not null,
    status_at        timestamptz not null,
    primary key (station_id, evse_id)
);

-- OCPP transactionIds are unique per charging station, not globally, so every transaction is keyed by
-- (station_id, transaction_id).
create table transaction (
    station_id            text             not null references station (station_id),
    transaction_id        text             not null,
    evse_id               integer          not null,
    state                 text             not null,
    started_at            timestamptz,     -- the charger's clock; never used to order transactions
    started_received_at   timestamptz,     -- the backend's clock when the Started arrived; null: no Started yet
    stopped_at            timestamptz,
    stop_reason           text,
    created_at            timestamptz      not null,

    -- event bookkeeping, rebuilt from transaction_event on every event
    last_seq_no           integer          not null default -1,
    first_missing_seq_no  integer,         -- null: no sequence gap; otherwise the lowest seqNo not received
    comm_lost_at          timestamptz,
    close_source          text,            -- REAL (charger's Ended) or RECONCILED (backend's provisional close)

    -- the last two energy samples, in seqNo order
    meter_samples         integer          not null default 0,
    last_meter_wh         double precision,
    last_meter_at         timestamptz,
    previous_meter_wh     double precision,
    previous_meter_at     timestamptz,
    end_meter_reported    boolean          not null default false,  -- the Ended carried an energy value

    -- the single invoice
    invoice_status        text             not null default 'NONE',
    billed_energy_wh      double precision,
    amount_cents          bigint,
    charges_issued        integer          not null default 0,
    invoice_needs_review  boolean          not null default false,
    invoice_review_note   text,

    -- reconciliation after a reconnect
    reconnected_at        timestamptz,
    status_answered_at    timestamptz,
    messages_in_queue     boolean,
    ongoing_indicator     boolean,         -- null: the charger did not say
    reconciled_at         timestamptz,
    reconciliation_reason text,
    review_reason         text,
    review_flagged_at     timestamptz,

    primary key (station_id, transaction_id)
);

create index transaction_evse_idx on transaction (station_id, evse_id, started_received_at);
create index transaction_open_idx on transaction (state) where state = 'CHARGING';

-- One row per TransactionEvent received. The unique key is the idempotency record.
create table transaction_event (
    id              bigserial primary key,
    station_id      text        not null,
    transaction_id  text        not null,
    seq_no          integer     not null,
    event_type      text        not null,
    event_timestamp timestamptz not null,
    trigger_reason  text,
    offline         boolean     not null default false,
    stopped_reason  text,
    evse_id         integer,
    meter_wh        double precision,
    meter_at        timestamptz,
    received_at     timestamptz not null,
    constraint transaction_event_transaction
        foreign key (station_id, transaction_id) references transaction (station_id, transaction_id),
    constraint transaction_event_idempotency unique (station_id, transaction_id, seq_no)
);

create table connection_log (
    id         bigserial primary key,
    station_id text        not null,
    kind       text        not null,
    at         timestamptz not null,
    close_code integer
);

create index connection_log_station_idx on connection_log (station_id, at);
