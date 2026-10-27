-- Family Health, part 1 of 3 (tables and who can see what). Module 10, parents only.
-- Simple on purpose, and dates only: never medical records, results or diagnoses.
--   1. Appointments: ordinary Calendar "appointment" events (nothing new stored).
--   2. Medicine reminders: what, for whom, at what times, from and until; a tick when it's given, so two parents
--      don't both give it. Amounts are whatever the parent types from the label or the doctor; Luex never suggests one.
--   3. Check-ups and jabs: what's due when (dentist every 6 months, eye test every 2 years, a booster once),
--      ticked when done.
-- Only parents see and change any of it.

create table public.health_meds (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  person_id uuid not null references public.family_members (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  amount text check (char_length(amount) <= 40),
  times text[] not null check (cardinality(times) between 1 and 6 and array_position(times, null) is null
    and array_to_string(times, ',') ~ '^([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9])*$'),
  start_on date not null,
  end_on date,
  remind uuid[] not null default '{}',
  notes text not null default '' check (char_length(notes) <= 200),
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_on is null or end_on >= start_on),
  check (cardinality(remind) <= 10)
);
create index health_meds_family_idx on public.health_meds (family_id);

-- one row per dose time per day: when we reminded, and when (and by whom) it was given
create table public.health_doses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  med_id uuid not null references public.health_meds (id) on delete cascade,
  on_date date not null,
  at_time text not null check (at_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  reminded_at timestamptz,
  given_at timestamptz,
  given_by uuid references public.family_members (id) on delete set null,
  unique (med_id, on_date, at_time)
);
create index health_doses_family_idx on public.health_doses (family_id, on_date);

create table public.health_checks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  person_id uuid not null references public.family_members (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  due_on date not null,
  -- repeats every so many months once done; empty for a one-off
  every_months smallint check (every_months between 1 and 120),
  last_done_on date,
  done_at timestamptz,
  notes text not null default '' check (char_length(notes) <= 200),
  reminded_on date,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index health_checks_family_idx on public.health_checks (family_id, due_on);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('changes', 'reminder', 'leave', 'wishlist', 'weekly', 'chore',
   'message', 'mention', 'announcement', 'location', 'prompt', 'goal', 'kudos', 'memory', 'food', 'money', 'reward', 'school', 'docs', 'emergency', 'home', 'trip', 'hosting', 'kids', 'health'));

alter table public.health_meds enable row level security;
alter table public.health_doses enable row level security;
alter table public.health_checks enable row level security;
revoke all on public.health_meds, public.health_doses, public.health_checks from anon, authenticated;

create policy health_meds_read on public.health_meds for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy health_meds_add on public.health_meds for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy health_meds_change on public.health_meds for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));

create policy health_doses_read on public.health_doses for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy health_doses_add on public.health_doses for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy health_doses_change on public.health_doses for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));

create policy health_checks_read on public.health_checks for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy health_checks_add on public.health_checks for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy health_checks_change on public.health_checks for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));

grant select on public.health_meds, public.health_doses, public.health_checks to authenticated;
grant insert (family_id, person_id, name, amount, times, start_on, end_on, remind, notes) on public.health_meds to authenticated;
grant update (name, amount, times, start_on, end_on, remind, notes, deleted_at) on public.health_meds to authenticated;
grant insert (family_id, med_id, on_date, at_time, given_at) on public.health_doses to authenticated;
-- the app ticks with an upsert, which names every column; the guard refuses changes to anything but given_at
grant update (family_id, med_id, on_date, at_time, given_at) on public.health_doses to authenticated;
grant insert (family_id, person_id, title, due_on, every_months, notes) on public.health_checks to authenticated;
-- done only through last_done_on, so a repeating one always moves on
grant update (title, due_on, every_months, last_done_on, notes, deleted_at) on public.health_checks to authenticated;
