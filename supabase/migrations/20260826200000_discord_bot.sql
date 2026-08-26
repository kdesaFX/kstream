-- Discord support bot: ticket channels tracked in Postgres (service role only).

create table if not exists public.discord_tickets (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  channel_id text not null unique,
  opener_discord_id text not null,
  subject text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists discord_tickets_guild_opener_open_idx
  on public.discord_tickets (guild_id, opener_discord_id)
  where status = 'open';

alter table public.discord_tickets enable row level security;

-- No policies: edge function uses service role key only.
