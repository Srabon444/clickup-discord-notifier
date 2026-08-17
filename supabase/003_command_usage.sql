create table if not exists command_usage (
  discord_user_id text not null,
  usage_date date not null,
  count integer not null default 0,
  primary key (discord_user_id, usage_date)
);

-- Single-statement upsert+increment is atomic under concurrent calls —
-- no separate check-then-write race.
create or replace function increment_command_usage(p_discord_user_id text, p_usage_date date)
returns integer
language sql
as $$
  insert into command_usage (discord_user_id, usage_date, count)
  values (p_discord_user_id, p_usage_date, 1)
  on conflict (discord_user_id, usage_date)
  do update set count = command_usage.count + 1
  returning count;
$$;
