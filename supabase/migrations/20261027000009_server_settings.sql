-- Settings only the server functions can read (the schedule's secret, the push keys). Kept in a private
-- schema that the app's API can't see; the functions reach them through two service-only functions.
create schema if not exists luex_private;
revoke all on schema luex_private from public, anon, authenticated;

create table if not exists luex_private.settings (
  name text primary key check (char_length(name) <= 60),
  value text not null,
  created_at timestamptz not null default now()
);
revoke all on luex_private.settings from public, anon, authenticated;

-- the schedule's secret is made here and never leaves the database
insert into luex_private.settings (name, value) values ('cron_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create or replace function public.server_setting(p_name text)
returns text language sql stable security definer set search_path = '' as $$
  select value from luex_private.settings where name = p_name
$$;

-- first one wins, so two runs can never end up with different push keys
create or replace function public.save_server_setting(p_name text, p_value text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  insert into luex_private.settings (name, value) values (p_name, p_value) on conflict (name) do nothing;
  return (select value from luex_private.settings where name = p_name);
end $$;

-- the push public key is public by design: browsers need it to subscribe
create or replace function public.push_public_key()
returns text language sql stable security definer set search_path = '' as $$
  select (value::jsonb) ->> 'publicKey' from luex_private.settings where name = 'vapid'
$$;

revoke all on function public.server_setting(text), public.save_server_setting(text, text), public.push_public_key()
  from public, anon, authenticated;
grant execute on function public.server_setting(text), public.save_server_setting(text, text) to service_role;
grant execute on function public.push_public_key() to anon, authenticated;
