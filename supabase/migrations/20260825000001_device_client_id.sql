-- Distinguish browsers that share the same display name (e.g. "This device").
-- Also add updated_at — set_updated_at trigger was attached without the column.
alter table public.devices
  add column if not exists client_id text,
  add column if not exists user_agent text,
  add column if not exists updated_at timestamptz not null default now();

update public.devices
set client_id = device_name
where client_id is null;

alter table public.devices
  alter column client_id set not null;

alter table public.devices
  drop constraint if exists devices_user_id_device_name_key;

create unique index if not exists devices_user_id_client_id_key
  on public.devices (user_id, client_id);
