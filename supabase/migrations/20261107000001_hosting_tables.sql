-- Bookings and Hosting, part 1 of 3 (tables and who can see what). Module 12, everyone.
-- Simple on purpose: hosting a party or a visit is an ordinary Calendar "party or visit" event (date, time, place live
-- there); this adds the guest list (who's coming, how many, what they can't eat) and what to get and do.
-- Bookings (restaurants, activities, services) need nothing new: they are Calendar events with a booking reference.
-- Everyone who can see the event sees the plans. Grown-ups plan; anyone can tick a job given to them.

create table public.host_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  event_id uuid not null unique references public.cal_events (id) on delete cascade,
  notes text not null default '' check (char_length(notes) <= 1000),
  -- the "tomorrow" message (service only)
  reminded_on date,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now()
);
create index host_events_family_idx on public.host_events (family_id);

create table public.host_guests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  host_id uuid not null references public.host_events (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  people smallint not null default 1 check (people between 1 and 50),
  status text not null default 'invited' check (status in ('invited', 'yes', 'maybe', 'no')),
  dietary text check (char_length(dietary) <= 120),
  notes text not null default '' check (char_length(notes) <= 300),
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index host_guests_host_idx on public.host_guests (host_id);

-- things to get and jobs to do (a job can be given to someone)
create table public.host_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  host_id uuid not null references public.host_events (id) on delete cascade,
  kind text not null check (kind in ('get', 'do')),
  title text not null check (char_length(title) between 1 and 120),
  who uuid references public.family_members (id) on delete set null,
  done_at timestamptz,
  done_by uuid references public.family_members (id) on delete set null,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (kind = 'do' or who is null)
);
create index host_items_host_idx on public.host_items (host_id);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('changes', 'reminder', 'leave', 'wishlist', 'weekly', 'chore',
   'message', 'mention', 'announcement', 'location', 'prompt', 'goal', 'kudos', 'memory', 'food', 'money', 'reward', 'school', 'docs', 'emergency', 'home', 'trip', 'hosting'));

-- who can see a hosting plan: anyone in the household who can see its Calendar event
create or replace function public.host_visible(h uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.host_events x where x.id = h and x.family_id = public.my_family_id()
    and public.is_family_member(x.family_id) and public.module_event_ok(x.event_id, 'social'))
$$;
revoke all on function public.host_visible(uuid) from public, anon;
grant execute on function public.host_visible(uuid) to authenticated;

alter table public.host_events enable row level security;
alter table public.host_guests enable row level security;
alter table public.host_items enable row level security;
revoke all on public.host_events, public.host_guests, public.host_items from anon, authenticated;

create policy host_events_read on public.host_events for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id) and public.module_event_ok(event_id, 'social'));
create policy host_events_add on public.host_events for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy host_events_change on public.host_events for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id) and public.module_event_ok(event_id, 'social'))
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));

-- guests: grown-ups who can see the plan
create policy host_guests_read on public.host_guests for select to authenticated using (public.host_visible(host_id));
create policy host_guests_add on public.host_guests for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id) and public.host_visible(host_id));
create policy host_guests_change on public.host_guests for update to authenticated
  using (public.host_visible(host_id) and public.is_family_adult(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id) and public.host_visible(host_id));

-- items: everyone who sees the plan reads; the guard decides who adds and ticks
create policy host_items_read on public.host_items for select to authenticated using (public.host_visible(host_id));
create policy host_items_add on public.host_items for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.host_visible(host_id));
create policy host_items_change on public.host_items for update to authenticated
  using (public.host_visible(host_id)) with check (family_id = (select public.my_family_id()) and public.host_visible(host_id));

grant select on public.host_events, public.host_guests, public.host_items to authenticated;
grant insert (family_id, event_id, notes) on public.host_events to authenticated;
grant update (notes) on public.host_events to authenticated;
grant insert (family_id, host_id, name, people, status, dietary, notes) on public.host_guests to authenticated;
grant update (name, people, status, dietary, notes, deleted_at) on public.host_guests to authenticated;
grant insert (family_id, host_id, kind, title, who) on public.host_items to authenticated;
grant update (title, who, done_at, deleted_at) on public.host_items to authenticated;
