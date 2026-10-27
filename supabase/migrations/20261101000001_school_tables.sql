-- School and Activities, part 1 of 3 (tables and who can see what). Module 7, everyone.
-- Simple on purpose: the one place for what matters from every school and club app – what's on, what to bring,
-- what's due and who's picking up. Clubs and babysitting are ordinary Calendar events; this module links to them.
-- Everyone in the household can see it; parents set it up; grown-ups can tick things and swap a pickup;
-- children add and tick their own homework.

create table public.school_places (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'school' check (kind in ('school', 'club', 'childcare')),
  phone text check (char_length(phone) <= 40),
  notes text not null default '' check (char_length(notes) <= 500),
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- each child's school and school day
create table public.school_children (
  member_id uuid primary key references public.family_members (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  place_id uuid references public.school_places (id) on delete set null,
  class_name text check (char_length(class_name) <= 60),
  teacher text check (char_length(teacher) <= 60),
  day_starts time,
  day_ends time,
  updated_at timestamptz not null default now()
);

-- the normal week: what to bring and lunch, per weekday (1 = Monday)
create table public.school_days (
  member_id uuid not null references public.family_members (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  bring text[] not null default '{}' check (cardinality(bring) <= 10),
  lunch text check (lunch in ('dinner', 'packed')),
  primary key (member_id, weekday)
);

-- clubs and activities: the times live in a Calendar event; this keeps the kit and cost
create table public.school_activities (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  place_id uuid references public.school_places (id) on delete set null,
  event_id uuid not null references public.cal_events (id) on delete cascade,
  kit text[] not null default '{}' check (cardinality(kit) <= 10),
  cost numeric(8, 2) check (cost >= 0 and cost < 10000),
  cost_every text check (cost_every in ('session', 'week', 'month', 'term', 'year')),
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id)
);

-- who takes them and who picks them up, in a normal week
create table public.school_runs (
  member_id uuid not null references public.family_members (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 5),
  drop_by uuid references public.family_members (id) on delete set null,
  pick_by uuid references public.family_members (id) on delete set null,
  pick_time time,
  primary key (member_id, weekday)
);

-- a change for one day ("Gran's picking up on Thursday")
create table public.school_run_changes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  on_date date not null,
  drop_by uuid references public.family_members (id) on delete set null,
  pick_by uuid references public.family_members (id) on delete set null,
  pick_time time,
  note text not null default '' check (char_length(note) <= 120),
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (member_id, on_date)
);

-- things to do: forms, money for trips, dress-up days, homework
create table public.school_tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid references public.family_members (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  kind text not null default 'other' check (kind in ('form', 'money', 'dressup', 'homework', 'other')),
  due_on date,
  amount numeric(8, 2) check (amount >= 0 and amount < 10000),
  note text not null default '' check (char_length(note) <= 500),
  photo_path text check (char_length(photo_path) <= 300),
  done_at timestamptz,
  done_by uuid references public.family_members (id) on delete set null,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index school_tasks_family_idx on public.school_tasks (family_id, due_on);

-- each person's choice about the morning summary
create table public.school_people (
  member_id uuid primary key references public.family_members (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  morning boolean not null default true
);

-- morning summaries already sent (service only)
create table public.school_sends (
  member_id uuid not null references public.family_members (id) on delete cascade,
  for_date date not null,
  primary key (member_id, for_date)
);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('changes', 'reminder', 'leave', 'wishlist', 'weekly', 'chore',
   'message', 'mention', 'announcement', 'location', 'prompt', 'goal', 'kudos', 'memory', 'food', 'money', 'reward', 'school'));

-- ---------------------------------------------------------------- who can see and change what

alter table public.school_places enable row level security;
alter table public.school_children enable row level security;
alter table public.school_days enable row level security;
alter table public.school_activities enable row level security;
alter table public.school_runs enable row level security;
alter table public.school_run_changes enable row level security;
alter table public.school_tasks enable row level security;
alter table public.school_people enable row level security;
alter table public.school_sends enable row level security;

revoke all on public.school_places, public.school_children, public.school_days, public.school_activities, public.school_runs,
  public.school_run_changes, public.school_tasks, public.school_people, public.school_sends from anon, authenticated;

-- everyone in the household reads; parents set up
create policy school_places_read on public.school_places for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy school_places_add on public.school_places for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy school_places_change on public.school_places for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));

create policy school_children_read on public.school_children for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy school_children_add on public.school_children for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy school_children_change on public.school_children for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));

create policy school_days_read on public.school_days for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy school_days_add on public.school_days for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy school_days_change on public.school_days for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));

create policy school_activities_read on public.school_activities for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy school_activities_add on public.school_activities for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy school_activities_change on public.school_activities for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy school_activities_remove on public.school_activities for delete to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));

create policy school_runs_read on public.school_runs for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy school_runs_add on public.school_runs for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy school_runs_change on public.school_runs for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));

-- grown-ups can swap a pickup for a day
create policy school_run_changes_read on public.school_run_changes for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy school_run_changes_add on public.school_run_changes for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy school_run_changes_change on public.school_run_changes for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy school_run_changes_remove on public.school_run_changes for delete to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));

-- things to do: everyone reads; grown-ups add and tick; children add and tick their own homework (the guard checks)
create policy school_tasks_read on public.school_tasks for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy school_tasks_add on public.school_tasks for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy school_tasks_change on public.school_tasks for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_member(family_id));

create policy school_people_read on public.school_people for select to authenticated
  using (family_id = (select public.my_family_id()) and member_id = (select public.my_member_id()));
create policy school_people_add on public.school_people for insert to authenticated
  with check (family_id = (select public.my_family_id()) and member_id = (select public.my_member_id()));
create policy school_people_change on public.school_people for update to authenticated
  using (family_id = (select public.my_family_id()) and member_id = (select public.my_member_id()))
  with check (family_id = (select public.my_family_id()) and member_id = (select public.my_member_id()));

-- ---------------------------------------------------------------- grants (exactly what the app needs)

grant select on public.school_places, public.school_children, public.school_days, public.school_activities, public.school_runs,
  public.school_run_changes, public.school_tasks, public.school_people to authenticated;

grant insert (family_id, name, kind, phone, notes) on public.school_places to authenticated;
grant update (name, kind, phone, notes, archived_at) on public.school_places to authenticated;
grant insert (member_id, family_id, place_id, class_name, teacher, day_starts, day_ends) on public.school_children to authenticated;
grant update (place_id, class_name, teacher, day_starts, day_ends) on public.school_children to authenticated;
grant insert (member_id, family_id, weekday, bring, lunch) on public.school_days to authenticated;
grant update (bring, lunch) on public.school_days to authenticated;
grant insert (family_id, member_id, place_id, event_id, kit, cost, cost_every) on public.school_activities to authenticated;
grant update (place_id, kit, cost, cost_every) on public.school_activities to authenticated;
grant delete on public.school_activities to authenticated;
grant insert (member_id, family_id, weekday, drop_by, pick_by, pick_time) on public.school_runs to authenticated;
grant update (drop_by, pick_by, pick_time) on public.school_runs to authenticated;
grant insert (family_id, member_id, on_date, drop_by, pick_by, pick_time, note) on public.school_run_changes to authenticated;
grant update (drop_by, pick_by, pick_time, note) on public.school_run_changes to authenticated;
grant delete on public.school_run_changes to authenticated;
grant insert (family_id, member_id, title, kind, due_on, amount, note, photo_path) on public.school_tasks to authenticated;
grant update (member_id, title, kind, due_on, amount, note, photo_path, done_at, deleted_at) on public.school_tasks to authenticated;
grant insert (member_id, family_id, morning) on public.school_people to authenticated;
grant update (morning) on public.school_people to authenticated;
