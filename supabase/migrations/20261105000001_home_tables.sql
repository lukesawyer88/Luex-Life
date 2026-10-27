-- Home Care, part 1 of 3 (tables and who can see what). Module 10, everyone.
-- Simple on purpose: bins, the yearly jobs (boiler, smoke alarms, gutters), things to fix and meter readings.
-- Cleaning stays in the Calendar's Chores; tradespeople are in Contacts; warranties in Documents.
-- Everyone in the household can see it. Grown-ups set up bins, jobs and meters; anyone (children too) can add something
-- to fix, and change their own until it's fixed.

-- bins: "Black bin, every other Tuesday" (first_on is any collection day; every_weeks repeats it)
create table public.hc_bins (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  colour text not null default 'black' check (colour in ('black', 'grey', 'blue', 'green', 'brown', 'purple', 'red', 'yellow')),
  every_weeks smallint not null default 1 check (every_weeks between 1 and 8),
  first_on date not null,
  notes text not null default '' check (char_length(notes) <= 200),
  -- who puts it out, taking turns collection by collection (empty: every grown-up is reminded)
  people uuid[] not null default '{}' check (cardinality(people) <= 10),
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index hc_bins_family_idx on public.hc_bins (family_id);

-- one collection changed: moved (bank holidays), skipped, or someone else doing it
create table public.hc_bin_changes (
  bin_id uuid not null references public.hc_bins (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  on_date date not null,
  move_to date,
  skip boolean not null default false,
  who uuid references public.family_members (id) on delete set null,
  primary key (bin_id, on_date),
  check (not (skip and move_to is not null))
);

-- yearly and seasonal jobs
create table public.hc_jobs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  emoji text check (char_length(emoji) <= 16),
  every_months smallint not null default 12 check (every_months between 1 and 120),
  next_due date not null,
  notes text not null default '' check (char_length(notes) <= 300),
  contact_id uuid references public.em_contacts (id) on delete set null,
  -- who looks after it (empty: every grown-up is reminded)
  who uuid references public.family_members (id) on delete set null,
  last_done_on date,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index hc_jobs_family_idx on public.hc_jobs (family_id, next_due);

-- when each job was done (the last boiler service, and so on)
create table public.hc_job_done (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.hc_jobs (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  done_on date not null,
  note text not null default '' check (char_length(note) <= 200),
  done_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now()
);
create index hc_job_done_job_idx on public.hc_job_done (job_id, done_on desc);

-- things to fix
create table public.hc_repairs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  place text check (char_length(place) <= 60),
  photo_path text check (char_length(photo_path) <= 300),
  notes text not null default '' check (char_length(notes) <= 500),
  -- who's sorting it, and the tradesperson
  who uuid references public.family_members (id) on delete set null,
  contact_id uuid references public.em_contacts (id) on delete set null,
  done_at timestamptz,
  done_by uuid references public.family_members (id) on delete set null,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index hc_repairs_family_idx on public.hc_repairs (family_id, created_at desc);

-- meters and readings
create table public.hc_meters (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  unit text check (char_length(unit) <= 10),
  archived_at timestamptz
);
create table public.hc_readings (
  id uuid primary key default gen_random_uuid(),
  meter_id uuid not null references public.hc_meters (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  value numeric(14, 3) not null check (value >= 0 and value < 100000000000),
  read_on date not null,
  photo_path text check (char_length(photo_path) <= 300),
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index hc_readings_meter_idx on public.hc_readings (meter_id, read_on desc);

-- reminders already sent (service only)
create table public.hc_sends (
  ref_id uuid not null,
  for_date date not null,
  kind text not null check (kind in ('bin', 'job_week', 'job_day')),
  primary key (ref_id, for_date, kind)
);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('changes', 'reminder', 'leave', 'wishlist', 'weekly', 'chore',
   'message', 'mention', 'announcement', 'location', 'prompt', 'goal', 'kudos', 'memory', 'food', 'money', 'reward', 'school', 'docs', 'emergency', 'home'));

-- ---------------------------------------------------------------- who can see and change what

alter table public.hc_bins enable row level security;
alter table public.hc_bin_changes enable row level security;
alter table public.hc_jobs enable row level security;
alter table public.hc_job_done enable row level security;
alter table public.hc_repairs enable row level security;
alter table public.hc_meters enable row level security;
alter table public.hc_readings enable row level security;
alter table public.hc_sends enable row level security;
revoke all on public.hc_bins, public.hc_bin_changes, public.hc_jobs, public.hc_job_done, public.hc_repairs,
  public.hc_meters, public.hc_readings, public.hc_sends from anon, authenticated;

-- everyone reads; grown-ups change (repairs: anyone adds, the guard decides who changes)
create policy hc_bins_read on public.hc_bins for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy hc_bins_add on public.hc_bins for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy hc_bins_change on public.hc_bins for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));

create policy hc_bin_changes_read on public.hc_bin_changes for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy hc_bin_changes_add on public.hc_bin_changes for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy hc_bin_changes_change on public.hc_bin_changes for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy hc_bin_changes_remove on public.hc_bin_changes for delete to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));

create policy hc_jobs_read on public.hc_jobs for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy hc_jobs_add on public.hc_jobs for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy hc_jobs_change on public.hc_jobs for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));

create policy hc_job_done_read on public.hc_job_done for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));

create policy hc_repairs_read on public.hc_repairs for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy hc_repairs_add on public.hc_repairs for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy hc_repairs_change on public.hc_repairs for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_member(family_id));

create policy hc_meters_read on public.hc_meters for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy hc_meters_add on public.hc_meters for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy hc_meters_change on public.hc_meters for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));

create policy hc_readings_read on public.hc_readings for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy hc_readings_add on public.hc_readings for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy hc_readings_change on public.hc_readings for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));

grant select on public.hc_bins, public.hc_bin_changes, public.hc_jobs, public.hc_job_done, public.hc_repairs,
  public.hc_meters, public.hc_readings to authenticated;
grant insert (family_id, name, colour, every_weeks, first_on, notes, people) on public.hc_bins to authenticated;
grant update (name, colour, every_weeks, first_on, notes, people, archived_at) on public.hc_bins to authenticated;
grant insert (bin_id, family_id, on_date, move_to, skip, who) on public.hc_bin_changes to authenticated;
grant update (move_to, skip, who) on public.hc_bin_changes to authenticated;
grant delete on public.hc_bin_changes to authenticated;
grant insert (family_id, title, emoji, every_months, next_due, notes, contact_id, who) on public.hc_jobs to authenticated;
grant update (title, emoji, every_months, next_due, notes, contact_id, who, archived_at) on public.hc_jobs to authenticated;
grant insert (family_id, title, place, photo_path, notes, who, contact_id) on public.hc_repairs to authenticated;
grant update (title, place, photo_path, notes, who, contact_id, done_at, deleted_at) on public.hc_repairs to authenticated;
grant insert (family_id, name, unit) on public.hc_meters to authenticated;
grant update (name, unit, archived_at) on public.hc_meters to authenticated;
grant insert (meter_id, family_id, value, read_on, photo_path) on public.hc_readings to authenticated;
grant update (value, read_on, photo_path, deleted_at) on public.hc_readings to authenticated;
