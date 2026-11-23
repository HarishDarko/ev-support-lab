-- The last delivery attempt recorded when an endpoint was resumed. The pause rule counts only attempts after it, so a
-- failure from before a replay never counts toward the next pause, even when it shares the replay's instant.
alter table endpoint_pause add column resumed_after_attempt bigint;
