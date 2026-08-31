-- Track web vs desktop app for signed-in device rows.
alter table public.devices
  add column if not exists platform text;

alter table public.devices
  drop constraint if exists devices_platform_check;

alter table public.devices
  add constraint devices_platform_check
  check (platform is null or platform in ('desktop', 'web'));

create index if not exists devices_platform_last_seen_idx
  on public.devices (platform, last_seen desc)
  where platform is not null;
