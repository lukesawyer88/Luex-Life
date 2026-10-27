-- Family Calendar (module 2): events, chores, routines, reminders, wish lists, terms, places,
-- handover notes, comments, files, share links, calendar imports, notifications and push.
-- Rules: RLS on every table, nothing granted by default, one policy per command,
-- security definer functions with an empty search_path that check who is calling.

-- ---------------------------------------------------------------- helpers

create or replace function public.my_member_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.family_members
  where user_id = (select auth.uid()) and archived_at is null
  limit 1
$$;

create or replace function public.is_family_adult(f uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select true from public.family_members
    where family_id = f and user_id = (select auth.uid()) and role in ('parent', 'member') and archived_at is null limit 1), false)
$$;

-- true when every id in the list is a current profile in family f
create or replace function public.members_in_family(f uuid, ids uuid[])
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(array_length(ids, 1), 0) = 0 or (array_position(ids, null) is null and (
    select count(distinct m.id) = (select count(distinct x) from unnest(ids) x)
    from public.family_members m where m.family_id = f and m.archived_at is null and m.id = any(ids)))
$$;

revoke all on function public.my_member_id(), public.is_family_adult(uuid), public.members_in_family(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.my_member_id(), public.is_family_adult(uuid) to authenticated;
-- members_in_family is for the guards only: outsiders must not be able to test who is in a family

-- ---------------------------------------------------------------- family-wide calendar settings

alter table public.families
  add column timezone text not null default 'Europe/London' check (char_length(timezone) between 3 and 60),
  add column calendar_prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(calendar_prefs) = 'object' and pg_column_size(calendar_prefs) < 8000),
  add column weather_place text check (char_length(weather_place) <= 80),
  add column weather_lat numeric(8, 5) check (weather_lat between -90 and 90),
  add column weather_lon numeric(8, 5) check (weather_lon between -180 and 180);

grant update (timezone, calendar_prefs, weather_place, weather_lat, weather_lon) on public.families to authenticated;

create or replace function public.check_family_timezone()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone';
  end if;
  return new;
end $$;
create trigger families_timezone before insert or update of timezone on public.families
  for each row execute function public.check_family_timezone();

-- today's date where the family lives
create or replace function public.family_today(f uuid)
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select timezone from public.families where id = f), 'Europe/London'))::date
$$;

-- ---------------------------------------------------------------- places (journey times)

create table public.cal_places (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  address text check (char_length(address) <= 200),
  travel_minutes integer check (travel_minutes between 0 and 600),
  created_at timestamptz not null default now()
);
create index cal_places_family_idx on public.cal_places (family_id);

-- ---------------------------------------------------------------- calendar imports (parents only)

create table public.cal_feeds (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  url text not null check (url ~* '^(https|webcal)://' and char_length(url) <= 1000),
  type text not null default 'other',
  people uuid[] not null default '{}',
  visibility text not null default 'all' check (visibility in ('all', 'selected')),
  viewers uuid[] not null default '{}',
  active boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  event_count integer not null default 0,
  created_by_member uuid,
  created_at timestamptz not null default now()
);
create index cal_feeds_family_idx on public.cal_feeds (family_id);

create or replace function public.can_see_feed(fd uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select true from public.cal_feeds f where f.id = fd and public.is_family_parent(f.family_id)
    and (f.visibility = 'all' or f.created_by_member = public.my_member_id() or public.my_member_id() = any(f.viewers)) limit 1), false)
$$;
revoke all on function public.can_see_feed(uuid) from public, anon, authenticated;
grant execute on function public.can_see_feed(uuid) to authenticated;

-- ---------------------------------------------------------------- events

create table public.cal_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  type text not null default 'other'
    check (type in ('birthday', 'school', 'activity', 'appointment', 'social', 'trip', 'work', 'reminder', 'other')),
  all_day boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- repeat rule in RFC 5545 form without DTSTART, e.g. FREQ=WEEKLY;INTERVAL=2;BYDAY=MO
  rrule text check (rrule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,+\-]+)*$' and char_length(rrule) <= 300),
  exdates timestamptz[] not null default '{}' check (coalesce(array_length(exdates, 1), 0) <= 500),
  -- a changed single occurrence of a repeating event points at its series
  recurrence_of uuid references public.cal_events (id) on delete cascade,
  recurrence_date timestamptz,
  people uuid[] not null default '{}' check (coalesce(array_length(people, 1), 0) <= 30),
  visibility text not null default 'all' check (visibility in ('all', 'selected')),
  viewers uuid[] not null default '{}' check (coalesce(array_length(viewers, 1), 0) <= 30),
  driver uuid,
  place_id uuid references public.cal_places (id) on delete set null,
  location text check (char_length(location) <= 200),
  travel_minutes integer check (travel_minutes between 0 and 600),
  reminders integer[] not null default '{}'
    check (coalesce(array_length(reminders, 1), 0) <= 5 and 0 <= all(reminders) and 40320 >= all(reminders)),
  notes text check (char_length(notes) <= 4000),
  booking_ref text check (char_length(booking_ref) <= 200),
  link text check (link ~* '^https?://' and char_length(link) <= 500),
  countdown boolean not null default false,
  done_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'import')),
  feed_id uuid references public.cal_feeds (id) on delete cascade,
  external_key text check (char_length(external_key) <= 600),
  created_by_member uuid,
  updated_by_member uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (ends_at >= starts_at),
  check (ends_at - starts_at <= interval '400 days'),
  check ((recurrence_of is null) = (recurrence_date is null)),
  check ((source = 'import') = (feed_id is not null)),
  check (source = 'manual' or place_id is null)
);
create index cal_events_family_time_idx on public.cal_events (family_id, starts_at);
create index cal_events_series_idx on public.cal_events (recurrence_of) where recurrence_of is not null;
-- plain (not partial) so imports can upsert on it; rows people type in have no feed and never clash
create unique index cal_events_import_key on public.cal_events (feed_id, external_key);

-- can the signed-in person see this event?
create or replace function public.can_see_event(e uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select true from public.cal_events ev
    where ev.id = e and public.is_family_member(ev.family_id)
      and (ev.visibility = 'all' or ev.created_by_member = public.my_member_id() or public.my_member_id() = any(ev.viewers))
      -- a changed single date is only visible to people who can see its series
      and (ev.recurrence_of is null or exists (select 1 from public.cal_events s where s.id = ev.recurrence_of
           and (s.visibility = 'all' or s.created_by_member = public.my_member_id() or public.my_member_id() = any(s.viewers))))
    limit 1), false)
$$;

-- can a given profile see this event? (used for alerts and reminders)
create or replace function public.member_sees_event(ev public.cal_events, m uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (ev.visibility = 'all' or ev.created_by_member = m or m = any(ev.viewers))
    and (ev.recurrence_of is null or exists (select 1 from public.cal_events s where s.id = ev.recurrence_of
         and (s.visibility = 'all' or s.created_by_member = m or m = any(s.viewers))))
$$;

create or replace function public.guard_event_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  me uuid := public.my_member_id();
  parent boolean;
  series public.cal_events%rowtype;
  syncing boolean := coalesce(current_setting('luex.feedsync', true), '') = 'on';
begin
  -- app users (not the import service, and not a feed's settings being copied to its events)
  if uid is not null and not syncing then
    if not public.is_family_member(new.family_id) then raise exception 'That change is not allowed'; end if;
    parent := public.is_family_parent(new.family_id);
    if tg_op = 'INSERT' then
      new.created_by_member := me;
      new.source := 'manual';
      new.feed_id := null;
      new.external_key := null;
      new.version := 1;
      new.created_at := now();
      new.deleted_at := null;
      if new.visibility = 'selected' and not parent and new.recurrence_of is null then
        raise exception 'Only a parent can choose who sees an event';
      end if;
    else
      if old.source = 'import' then raise exception 'Imported events can only be changed in the calendar they came from'; end if;
      if new.family_id <> old.family_id or new.created_by_member is distinct from old.created_by_member
         or new.recurrence_of is distinct from old.recurrence_of or new.recurrence_date is distinct from old.recurrence_date then
        raise exception 'That change is not allowed';
      end if;
      -- only parents choose (or undo) who sees something
      if not parent and new.recurrence_of is null
         and (new.visibility is distinct from old.visibility or new.viewers is distinct from old.viewers) then
        raise exception 'Only a parent can choose who sees an event';
      end if;
      new.version := old.version + 1;
    end if;
    new.updated_by_member := me;
    new.updated_at := now();
  end if;

  -- a changed single date always has exactly the same audience as its series
  if new.recurrence_of is not null then
    select * into series from public.cal_events where id = new.recurrence_of;
    if not found or series.family_id <> new.family_id then raise exception 'That change is not allowed'; end if;
    if uid is not null and not syncing and tg_op = 'INSERT' and (
         not public.can_see_event(series.id) or series.rrule is null or series.recurrence_of is not null
         or series.source <> 'manual' or not (parent or series.created_by_member = me)) then
      raise exception 'That change is not allowed';
    end if;
    new.visibility := series.visibility;
    new.viewers := case when series.visibility = 'selected'
      then array(select distinct x from unnest(series.viewers || array[series.created_by_member]) x where x is not null)
      else '{}'::uuid[] end;
    new.rrule := null;
    new.exdates := '{}';
  end if;

  if new.visibility = 'all' then new.viewers := '{}'; end if;
  if not public.members_in_family(new.family_id, new.people || new.viewers
       || case when new.driver is null then '{}'::uuid[] else array[new.driver] end) then
    raise exception 'Those people are not in this family';
  end if;
  -- only people who can log in can be chosen to see a private event (a profile without a login could be taken over by an invite later)
  if new.visibility = 'selected' and new.recurrence_of is null and exists (
       select 1 from unnest(new.viewers) v join public.family_members m on m.id = v where m.user_id is null) then
    raise exception 'Only people with a login can be chosen';
  end if;
  if new.place_id is not null and not exists (select 1 from public.cal_places where id = new.place_id and family_id = new.family_id) then
    raise exception 'That place is not in this family';
  end if;
  return new;
end $$;

create trigger cal_events_guard before insert or update on public.cal_events
  for each row execute function public.guard_event_change();

