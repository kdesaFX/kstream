-- Discord source intel: URLs discovered from channel scans, ingests, or exports.

create table if not exists public.discord_discovered_links (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null default 'import',
  channel_id text,
  message_id text,
  label text,
  url text not null,
  domain text not null,
  category text not null default 'unknown'
    check (category in ('streaming', 'ddl', 'tools', 'wiki', 'unknown')),
  source text not null default 'scan'
    check (source in ('scan', 'ingest', 'import', 'live')),
  discovered_at timestamptz not null default now(),
  unique (guild_id, url)
);

create index if not exists discord_discovered_links_domain_idx
  on public.discord_discovered_links (domain);

create index if not exists discord_discovered_links_discovered_at_idx
  on public.discord_discovered_links (discovered_at desc);

create index if not exists discord_discovered_links_category_idx
  on public.discord_discovered_links (category);

alter table public.discord_discovered_links enable row level security;

-- Edge function uses service role only.
