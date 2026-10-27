-- Luex Life foundation: families, people in a family, roles, invites, modules on/off, audit log, avatars.
-- Rules: row-level security on every table; no access by default; the database refuses what the screen hides.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tables

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references auth.users (id),
  -- where the family came from ('direct' now; later e.g. 'luex_work' for the discount route)
  signup_source text not null default 'direct',
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  -- null = a profile managed by a parent (young children, or people who never log in)
  user_id uuid references auth.users (id),
  display_name text not null check (char_length(display_name) between 1 and 60),
  role text not null check (role in ('parent', 'member', 'child')),
  colour text not null default '#2f6bd8' check (colour ~ '^#[0-9a-fA-F]{6}$'),
  avatar_path text,
  birthday date,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index family_members_family_idx on public.family_members (family_id);
-- one family per login for now
create unique index family_members_one_family_per_user
  on public.family_members (user_id) where user_id is not null and archived_at is null;

create table public.family_modules (
  family_id uuid not null references public.families (id) on delete cascade,
  module_key text not null check (char_length(module_key) between 1 and 40),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (family_id, module_key)
);

create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  -- optional: the managed profile this person will take over when they accept
  member_id uuid references public.family_members (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 254),
  role text not null check (role in ('parent', 'member', 'child')),
  display_name text not null check (char_length(display_name) between 1 and 60),
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index family_invites_family_idx on public.family_invites (family_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  family_id uuid not null,
  actor uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_family_idx on public.audit_log (family_id, created_at desc);

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_modules enable row level security;
alter table public.family_invites enable row level security;
alter table public.audit_log enable row level security;

-- ---------------------------------------------------------------- who is who

create or replace function public.my_family_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select family_id from public.family_members
  where user_id = (select auth.uid()) and archived_at is null
  limit 1
$$;

create or replace function public.is_family_member(f uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select true from public.family_members
    where family_id = f and user_id = (select auth.uid()) and archived_at is null limit 1), false)
$$;

create or replace function public.is_family_parent(f uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select true from public.family_members
    where family_id = f and user_id = (select auth.uid()) and role = 'parent' and archived_at is null limit 1), false)
$$;

create or replace function public.log_event(f uuid, a text, d jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (family_id, actor, action, detail) values (f, (select auth.uid()), a, coalesce(d, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------- policies (one per command)

create policy families_read on public.families for select to authenticated
  using (public.is_family_member(id));
create policy families_rename on public.families for update to authenticated
  using (public.is_family_parent(id)) with check (public.is_family_parent(id));

create policy members_read on public.family_members for select to authenticated
  using (public.is_family_member(family_id));
-- parents add profiles that are managed by a parent (no login); logins join through invites only
create policy members_add on public.family_members for insert to authenticated
  with check (public.is_family_parent(family_id) and user_id is null);
create policy members_change on public.family_members for update to authenticated
  using (public.is_family_parent(family_id) or user_id = (select auth.uid()))
  with check (public.is_family_parent(family_id) or user_id = (select auth.uid()));

create policy modules_read on public.family_modules for select to authenticated
  using (public.is_family_member(family_id));
create policy modules_add on public.family_modules for insert to authenticated
  with check (public.is_family_parent(family_id));
create policy modules_change on public.family_modules for update to authenticated
  using (public.is_family_parent(family_id)) with check (public.is_family_parent(family_id));

create policy invites_read on public.family_invites for select to authenticated
  using (public.is_family_parent(family_id));

create policy audit_read on public.audit_log for select to authenticated
  using (public.is_family_parent(family_id));

-- ---------------------------------------------------------------- grants (nothing by default)

revoke all on public.families, public.family_members, public.family_modules,
  public.family_invites, public.audit_log from anon, authenticated;

grant select on public.families to authenticated;
grant update (name) on public.families to authenticated;

grant select on public.family_members to authenticated;
grant insert (family_id, display_name, role, colour, birthday, created_by) on public.family_members to authenticated;
grant update (display_name, role, colour, avatar_path, birthday, archived_at) on public.family_members to authenticated;

grant select on public.family_modules to authenticated;
grant insert (family_id, module_key, enabled) on public.family_modules to authenticated;
grant update (enabled, updated_at) on public.family_modules to authenticated;

-- the invite token (hash) is never readable from the app
grant select (id, family_id, member_id, email, role, display_name, expires_at, accepted_at, revoked_at, created_by, created_at)
  on public.family_invites to authenticated;

grant select on public.audit_log to authenticated;

-- ---------------------------------------------------------------- guard: what a person may change

create or replace function public.guard_member_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  linking boolean := coalesce(current_setting('luex.linking', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    new.created_by := uid;
    return new;
  end if;

  if new.family_id <> old.family_id or new.created_by is distinct from old.created_by then
    raise exception 'That change is not allowed';
  end if;
  -- the login on a profile can only be set when someone accepts an invite for a profile with no login
  if new.user_id is distinct from old.user_id and not (linking and old.user_id is null) then
    raise exception 'That change is not allowed';
  end if;

  if uid is not null and not linking then
    if not public.is_family_parent(old.family_id) then
      if old.user_id is distinct from uid then
        raise exception 'That change is not allowed';
      end if;
      if new.role <> old.role or new.archived_at is distinct from old.archived_at then
        raise exception 'Only a parent can change roles or remove people';
      end if;
    end if;
  end if;

  -- a family always keeps at least one parent who can log in
  if old.role = 'parent' and old.archived_at is null and old.user_id is not null
     and (new.role <> 'parent' or new.archived_at is not null) then
    if not exists (
      select 1 from public.family_members
      where family_id = old.family_id and role = 'parent' and archived_at is null
        and user_id is not null and id <> old.id
    ) then
      raise exception 'A family needs at least one parent who can log in';
    end if;
  end if;
  return new;
end $$;

create trigger family_members_guard before insert or update on public.family_members
  for each row execute function public.guard_member_change();

create or replace function public.audit_member_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event(new.family_id, 'member_added', jsonb_build_object('member', new.id, 'role', new.role));
  elsif new.archived_at is not null and old.archived_at is null then
    perform public.log_event(new.family_id, 'member_removed', jsonb_build_object('member', new.id));
  elsif new.role <> old.role then
    perform public.log_event(new.family_id, 'role_changed', jsonb_build_object('member', new.id, 'from', old.role, 'to', new.role));
  end if;
  return new;
end $$;

create trigger family_members_audit after insert or update on public.family_members
  for each row execute function public.audit_member_change();

-- ---------------------------------------------------------------- doing things

create or replace function public.create_family(p_family_name text, p_my_name text, p_colour text default '#2f6bd8', p_source text default 'direct')
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); fid uuid;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  if public.my_family_id() is not null then raise exception 'You are already part of a family'; end if;
  insert into public.families (name, owner_id, signup_source) values (trim(p_family_name), uid, coalesce(p_source, 'direct')) returning id into fid;
  insert into public.family_members (family_id, user_id, display_name, role, colour, created_by)
    values (fid, uid, trim(p_my_name), 'parent', coalesce(p_colour, '#2f6bd8'), uid);
  perform public.log_event(fid, 'family_created', '{}'::jsonb);
  return fid;
end $$;

create or replace function public.create_invite(p_family uuid, p_email text, p_role text, p_name text, p_member uuid default null)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); tok text; em text := lower(trim(p_email));
begin
  if uid is null or not public.is_family_parent(p_family) then raise exception 'Only a parent can invite people'; end if;
  if p_role not in ('parent', 'member', 'child') then raise exception 'Unknown role'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email address'; end if;
  if (select count(*) from public.family_invites
      where family_id = p_family and accepted_at is null and revoked_at is null and expires_at > now()) >= 20 then
    raise exception 'Too many open invites. Cancel some first';
  end if;
  if p_member is not null and not exists (
    select 1 from public.family_members where id = p_member and family_id = p_family and user_id is null and archived_at is null
  ) then raise exception 'That profile cannot take an invite'; end if;
  -- a new invite for the same address replaces the old one
  update public.family_invites set revoked_at = now()
    where family_id = p_family and email = em and accepted_at is null and revoked_at is null;
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.family_invites (family_id, member_id, email, role, display_name, token_hash, created_by)
    values (p_family, p_member, em, p_role, trim(p_name), encode(extensions.digest(tok, 'sha256'), 'hex'), uid);
  perform public.log_event(p_family, 'invite_sent', jsonb_build_object('role', p_role));
  return tok;
end $$;

create or replace function public.revoke_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare fid uuid;
begin
  select family_id into fid from public.family_invites where id = p_invite;
  if fid is null or not public.is_family_parent(fid) then raise exception 'Only a parent can cancel an invite'; end if;
  update public.family_invites set revoked_at = now() where id = p_invite and accepted_at is null and revoked_at is null;
  perform public.log_event(fid, 'invite_cancelled', '{}'::jsonb);
end $$;

-- what the join page shows before sign-in: the family name and the person's name, nothing else
create or replace function public.preview_invite(p_token text)
returns table (family_name text, display_name text, role text)
language sql stable security definer set search_path = '' as $$
  select f.name, i.display_name, i.role
  from public.family_invites i join public.families f on f.id = i.family_id
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
$$;

create or replace function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  em text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  inv public.family_invites%rowtype;
  n integer;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  select * into inv from public.family_invites
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      and accepted_at is null and revoked_at is null and expires_at > now()
    for update;
  if not found then raise exception 'This invite is not valid any more. Ask for a new one'; end if;
  if inv.email <> em then raise exception 'This invite was sent to a different email address'; end if;
  if public.my_family_id() is not null then raise exception 'You are already part of a family'; end if;

  if inv.member_id is not null then
    perform set_config('luex.linking', 'on', true);
    update public.family_members set user_id = uid, role = inv.role
      where id = inv.member_id and user_id is null and archived_at is null;
    get diagnostics n = row_count;
    perform set_config('luex.linking', 'off', true);
    if n = 0 then raise exception 'This invite is not valid any more. Ask for a new one'; end if;
  else
    insert into public.family_members (family_id, user_id, display_name, role, created_by)
      values (inv.family_id, uid, inv.display_name, inv.role, inv.created_by);
  end if;
  update public.family_invites set accepted_at = now() where id = inv.id;
  perform public.log_event(inv.family_id, 'invite_accepted', jsonb_build_object('role', inv.role));
  return inv.family_id;
end $$;

revoke all on function public.my_family_id(), public.is_family_member(uuid), public.is_family_parent(uuid),
  public.log_event(uuid, text, jsonb), public.create_family(text, text, text, text),
  public.create_invite(uuid, text, text, text, uuid), public.revoke_invite(uuid),
  public.preview_invite(text), public.accept_invite(text),
  public.guard_member_change(), public.audit_member_change() from public, anon, authenticated;

grant execute on function public.my_family_id(), public.is_family_member(uuid), public.is_family_parent(uuid),
  public.create_family(text, text, text, text), public.create_invite(uuid, text, text, text, uuid),
  public.revoke_invite(uuid), public.accept_invite(text) to authenticated;
grant execute on function public.preview_invite(text) to anon, authenticated;

-- ---------------------------------------------------------------- profile pictures (private)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- path is <family id>/<member id>-<anything>.<ext>; read = any member of that family,
-- write = a parent of that family, or the person whose picture it is
create or replace function public.avatar_path_ok(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare fid uuid; mid uuid; parts text[] := string_to_array(p_name, '/');
begin
  if array_length(parts, 1) <> 2 then return false; end if;
  if parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  fid := parts[1]::uuid;
  if not p_write then return public.is_family_member(fid); end if;
  if public.is_family_parent(fid) then return true; end if;
  if substring(parts[2] from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}') is null then return false; end if;
  mid := substring(parts[2] from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')::uuid;
  return exists (select 1 from public.family_members
    where id = mid and family_id = fid and user_id = (select auth.uid()) and archived_at is null);
end $$;
revoke all on function public.avatar_path_ok(text, boolean) from public, anon;
grant execute on function public.avatar_path_ok(text, boolean) to authenticated;

create policy avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.avatar_path_ok(name, false));
create policy avatars_add on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.avatar_path_ok(name, true));
create policy avatars_change on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.avatar_path_ok(name, true))
  with check (bucket_id = 'avatars' and public.avatar_path_ok(name, true));
create policy avatars_remove on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.avatar_path_ok(name, true));
