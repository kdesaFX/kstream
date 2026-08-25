-- Prefer Discord/Google identity names over email local-part for new profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, color_a, color_b, icon)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'nickname'), ''),
      nullif(trim(new.raw_user_meta_data->>'preferred_username'), ''),
      nullif(trim(new.raw_user_meta_data->>'user_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->'custom_claims'->>'global_name'), ''),
      nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
      'User'
    ),
    coalesce(new.raw_user_meta_data->>'color_a', '#6366f1'),
    coalesce(new.raw_user_meta_data->>'color_b', '#8b5cf6'),
    coalesce(new.raw_user_meta_data->>'icon', 'user')
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id, payload) values (new.id, '{}'::jsonb)
  on conflict (user_id) do nothing;

  insert into public.group_order (user_id, groups) values (new.id, '{}')
  on conflict (user_id) do nothing;

  return new;
end;
$$;
