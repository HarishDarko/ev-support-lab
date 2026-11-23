-- The last delivery attempt recorded when an endpoint was resumed. The pause rule counts only attempts after it, so a
-- failure from before a replay never counts toward the next pause, even when it shares the replay's instant.
alter table endpoint_pause add column resumed_after_attempt bigint;

-- Pauses resumed before this column existed keep the rule they were resumed under: attempts from the resume's instant
-- on count. So the watermark is the last attempt recorded before that instant.
update endpoint_pause p
set resumed_after_attempt = (select coalesce(max(a.id), 0) from delivery_attempt a
                             where a.endpoint_id = p.endpoint_id and a.at < p.resumed_at)
where p.resumed_at is not null;
