-- Discord bot settings in Vault (readable by edge function via service role RPC).
-- Secrets themselves are stored in Vault via Supabase SQL editor / MCP — never commit token values.

create or replace function public.discord_bot_setting(setting_name text)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  val text;
begin
  select decrypted_secret into val
  from vault.decrypted_secrets
  where name = setting_name
  limit 1;
  return val;
end;
$$;

create or replace function public.discord_bot_upsert_setting(
  setting_name text,
  setting_value text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  existing uuid;
begin
  select id into existing
  from vault.secrets
  where name = setting_name
  limit 1;

  if existing is null then
    perform vault.create_secret(setting_value, setting_name, 'Discord bot config');
  else
    perform vault.update_secret(existing, setting_value, setting_name, 'Discord bot config');
  end if;
end;
$$;

revoke all on function public.discord_bot_setting(text) from public;
revoke all on function public.discord_bot_setting(text) from anon;
revoke all on function public.discord_bot_setting(text) from authenticated;
grant execute on function public.discord_bot_setting(text) to service_role;

revoke all on function public.discord_bot_upsert_setting(text, text) from public;
revoke all on function public.discord_bot_upsert_setting(text, text) from anon;
revoke all on function public.discord_bot_upsert_setting(text, text) from authenticated;
grant execute on function public.discord_bot_upsert_setting(text, text) to service_role;
