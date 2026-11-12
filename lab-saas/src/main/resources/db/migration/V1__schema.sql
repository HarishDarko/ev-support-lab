-- SaaS lab schema. Synthetic data only.

-- A customer workspace. fix_override, when set, wins over lab.fix.enabled (the per-workspace flag).
create table workspace (
    id           text primary key,
    name         text not null,
    fix_override boolean
);

-- A webhook endpoint. auth is 'oauth' (a bearer token from the customer's identity provider) or 'hmac'.
create table endpoint (
    id           text primary key,
    workspace_id text not null references workspace (id),
    url          text not null,
    auth         text not null check (auth in ('oauth', 'hmac')),
    client_id    text,
    token_url    text
);

create table event (
    id              text primary key,
    endpoint_id     text not null references endpoint (id),
    created_at      timestamptz not null,
    -- pending | delivered | failed
    status          text not null,
    next_attempt_at timestamptz,
    delivered_at    timestamptz
);
create index event_endpoint_status on event (endpoint_id, status);

-- Every attempt to deliver an event. counts_toward_pause is false for attempts that waited (a rate-limited refresh).
create table delivery_attempt (
    id                  bigserial primary key,
    event_id            text not null references event (id),
    endpoint_id         text not null,
    at                  timestamptz not null,
    outcome             text not null,
    detail              text not null,
    counts_toward_pause boolean not null
);
create index delivery_attempt_endpoint_at on delivery_attempt (endpoint_id, at);

-- Every token request the worker sent to a customer's identity provider, and the answer.
create table token_request (
    id          bigserial primary key,
    endpoint_id text not null,
    at          timestamptz not null,
    status      int not null
);
create index token_request_endpoint_at on token_request (endpoint_id, at);

-- An endpoint pause: after too many failures in the window, until support replays it.
create table endpoint_pause (
    id          bigserial primary key,
    endpoint_id text not null references endpoint (id),
    paused_at   timestamptz not null,
    reason      text not null,
    resumed_at  timestamptz
);
