-- Trips and Holidays, part 1 of 3 (tables and who can see what). Module 11, everyone.
-- Simple on purpose: a trip is an ordinary Calendar "trip" event (dates, who's going, where, countdown live there);
-- this adds what to pack, what to do before you go, the plans (flights, hotel, car hire) and an ideas list for days out.
-- Everyone who can see the trip's Calendar event sees the trip. Grown-ups plan; everyone ticks their own packing.

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  event_id uuid not null unique references public.cal_events (id) on delete cascade,
  emoji text check (char_length(emoji) <= 16),
  notes text not null default '' check (char_length(notes) <= 1000),
  -- the "two days to go" message (service only)
  reminded_on date,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now()
);
create index trips_family_idx on public.trips (family_id);

-- packing (someone's own, or shared when member_id is empty), before-we-go jobs, and plans
create table public.trip_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  kind text not null check (kind in ('pack', 'todo', 'plan')),
  member_id uuid references public.family_members (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  -- plans: what sort, when, reference, where
  plan_kind text check (plan_kind in ('travel', 'stay', 'car', 'activity', 'other')),
  starts_at timestamptz,
  ref text check (char_length(ref) <= 80),
  place text check (char_length(place) <= 200),
  notes text not null default '' check (char_length(notes) <= 500),
  position double precision not null default 0,
  done_at timestamptz,
  done_by uuid references public.family_members (id) on delete set null,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (kind = 'plan' or (plan_kind is null and starts_at is null and ref is null and place is null)),
  check (kind = 'pack' or member_id is null)
);
create index trip_items_trip_idx on public.trip_items (trip_id, kind, position);

-- days out and things we'd love to do (anyone adds; children too)
create table public.trip_ideas (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  place text check (char_length(place) <= 120),
  link text check (char_length(link) <= 500 and (link is null or link ~* '^https?://')),
  notes text not null default '' check (char_length(notes) <= 500),
  done_at timestamptz,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index trip_ideas_family_idx on public.trip_ideas (family_id, created_at desc);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('changes', 'reminder', 'leave', 'wishlist', 'weekly', 'chore',
   'message', 'mention', 'announcement', 'location', 'prompt', 'goal', 'kudos', 'memory', 'food', 'money', 'reward', 'school', 'docs', 'emergency', 'home', 'trip'));

-- a trip or hosting plan shows only while its Calendar event is still there, still that type, and I can see it
create or replace function public.module_event_ok(ev uuid, kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cal_events e where e.id = ev and e.type = kind and e.deleted_at is null)
    and public.can_see_event(ev)
$$;
revoke all on function public.module_event_ok(uuid, text) from public, anon;
grant execute on function public.module_event_ok(uuid, text) to authenticated;

-- who can see a trip: anyone in the household who can see its Calendar event
create or replace function public.trip_visible(t uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trips x where x.id = t and x.family_id = public.my_family_id()
    and public.is_family_member(x.family_id) and public.module_event_ok(x.event_id, 'trip'))
$$;
revoke all on function public.trip_visible(uuid) from public, anon;
grant execute on function public.trip_visible(uuid) to authenticated;

alter table public.trips enable row level security;
alter table public.trip_items enable row level security;
alter table public.trip_ideas enable row level security;
revoke all on public.trips, public.trip_items, public.trip_ideas from anon, authenticated;

create policy trips_read on public.trips for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id) and public.module_event_ok(event_id, 'trip'));
create policy trips_add on public.trips for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy trips_change on public.trips for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id) and public.module_event_ok(event_id, 'trip'))
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));

-- items: everyone who sees the trip reads; the guard decides who adds and ticks what
create policy trip_items_read on public.trip_items for select to authenticated using (public.trip_visible(trip_id));
create policy trip_items_add on public.trip_items for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.trip_visible(trip_id));
create policy trip_items_change on public.trip_items for update to authenticated
  using (public.trip_visible(trip_id)) with check (family_id = (select public.my_family_id()) and public.trip_visible(trip_id));

create policy trip_ideas_read on public.trip_ideas for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy trip_ideas_add on public.trip_ideas for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy trip_ideas_change on public.trip_ideas for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_member(family_id));

grant select on public.trips, public.trip_items, public.trip_ideas to authenticated;
grant insert (family_id, event_id, emoji, notes) on public.trips to authenticated;
grant update (emoji, notes) on public.trips to authenticated;
grant insert (family_id, trip_id, kind, member_id, title, plan_kind, starts_at, ref, place, notes, position) on public.trip_items to authenticated;
grant update (member_id, title, plan_kind, starts_at, ref, place, notes, position, done_at, deleted_at) on public.trip_items to authenticated;
grant insert (family_id, title, place, link, notes) on public.trip_ideas to authenticated;
grant update (title, place, link, notes, done_at, deleted_at) on public.trip_ideas to authenticated;
