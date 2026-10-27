-- Family Calendar, part 2 of 7 (tables). See part 1 for the rules.

-- ---------------------------------------------------------------- event history

create table public.cal_event_log (
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families (id) on delete cascade,
  event_id uuid not null references public.cal_events (id) on delete cascade,
  member_id uuid,
  action text not null check (action in ('added', 'changed', 'deleted', 'restored', 'done')),
  fields text[] not null default '{}',
  at timestamptz not null default now()
);
create index cal_event_log_event_idx on public.cal_event_log (event_id, at desc);

-- ---------------------------------------------------------------- comments and files

create table public.cal_comments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  event_id uuid not null references public.cal_events (id) on delete cascade,
  member_id uuid,
  body text check (char_length(body) <= 1000),
  photo_path text check (char_length(photo_path) <= 300),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (body is not null or photo_path is not null)
);
create index cal_comments_event_idx on public.cal_comments (event_id, created_at);

create table public.cal_files (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  event_id uuid not null references public.cal_events (id) on delete cascade,
  path text not null unique check (char_length(path) <= 300),
  name text not null check (char_length(name) between 1 and 120),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  created_by_member uuid,
  created_at timestamptz not null default now()
);
create index cal_files_event_idx on public.cal_files (event_id);

-- ---------------------------------------------------------------- school terms and holidays (parents)

create table public.cal_terms (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'holiday' check (kind in ('term', 'holiday', 'inset')),
  label text check (char_length(label) <= 60),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 366)
);
create index cal_terms_family_idx on public.cal_terms (family_id, starts_on);

-- ---------------------------------------------------------------- handover notes (one per day)

create table public.cal_day_notes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  day date not null,
  body text not null check (char_length(body) between 1 and 1000),
  member_id uuid,
  updated_at timestamptz not null default now(),
  unique (family_id, day)
);

-- ---------------------------------------------------------------- chores and cleaning rota

create table public.chores (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  icon text not null default 'sparkles' check (char_length(icon) <= 40),
  rrule text not null default 'FREQ=DAILY'
    check (rrule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY)(;[A-Z]+=[A-Z0-9,+\-]+)*$' and char_length(rrule) <= 300),
  starts_on date not null default current_date,
  -- each: everyone listed does it; rotate: one person per time, taking turns; anyone: first to do it
  mode text not null default 'each' check (mode in ('each', 'rotate', 'anyone')),
  people uuid[] not null default '{}' check (coalesce(array_length(people, 1), 0) <= 30),
  part_of_day text not null default 'any' check (part_of_day in ('morning', 'afternoon', 'evening', 'any')),
  needs_confirm boolean not null default false,
  stars integer not null default 1 check (stars between 0 and 100),
  notes text check (char_length(notes) <= 500),
  is_cleaning boolean not null default false,
  active boolean not null default true,
  created_by_member uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chores_family_idx on public.chores (family_id);

create table public.chore_done (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  chore_id uuid not null references public.chores (id) on delete cascade,
  due_on date not null,
  for_member uuid not null,
  done_by uuid,
  done_at timestamptz not null default now(),
  stars integer not null default 0,
  confirmed_by uuid,
  confirmed_at timestamptz,
  unique (chore_id, due_on, for_member)
);
create index chore_done_family_idx on public.chore_done (family_id, due_on);

-- ---------------------------------------------------------------- routines

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  icon text not null default 'sun' check (char_length(icon) <= 40),
  start_time time,
  days smallint[] not null default '{1,2,3,4,5,6,7}' check (days <@ array[1,2,3,4,5,6,7]::smallint[]),
  reward text check (char_length(reward) <= 120),
  stars integer not null default 1 check (stars between 0 and 100),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index routines_family_idx on public.routines (family_id);

create table public.routine_steps (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  routine_id uuid not null references public.routines (id) on delete cascade,
  position integer not null default 0,
  title text not null check (char_length(title) between 1 and 80),
  icon text not null default 'check' check (char_length(icon) <= 40),
  photo_path text check (char_length(photo_path) <= 300),
  minutes integer check (minutes between 1 and 120)
);
create index routine_steps_routine_idx on public.routine_steps (routine_id, position);

create table public.routine_runs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  routine_id uuid not null references public.routines (id) on delete cascade,
  run_on date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stars integer not null default 0,
  unique (routine_id, run_on)
);

create table public.routine_ticks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  routine_id uuid not null references public.routines (id) on delete cascade,
  step_id uuid not null references public.routine_steps (id) on delete cascade,
  done_on date not null,
  done_by uuid,
  done_at timestamptz not null default now(),
  unique (step_id, done_on)
);
create index routine_ticks_family_idx on public.routine_ticks (family_id, done_on);

-- ---------------------------------------------------------------- wish lists (surprise-safe)

create table public.wish_lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  owner_member uuid not null,
  occasion text not null check (occasion in ('birthday', 'christmas')),
  year integer not null check (year between 2020 and 2100),
  created_at timestamptz not null default now(),
  unique (owner_member, occasion, year)
);

create table public.wish_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  list_id uuid not null references public.wish_lists (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  link text check (link ~* '^https?://' and char_length(link) <= 500),
  price numeric(10, 2) check (price >= 0 and price < 100000),
  notes text check (char_length(notes) <= 500),
  priority smallint not null default 2 check (priority between 1 and 3),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz
);
create index wish_items_list_idx on public.wish_items (list_id);

-- who is buying what. NEVER readable by the person whose list it is.
create table public.wish_claims (
  item_id uuid primary key references public.wish_items (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  list_id uuid not null references public.wish_lists (id) on delete cascade,
  claimed_by uuid,
  bought boolean not null default false,
  claimed_at timestamptz not null default now()
);
create index wish_claims_list_idx on public.wish_claims (list_id);

create or replace function public.owns_wish_list(l uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select true from public.wish_lists where id = l and owner_member = public.my_member_id()), false)
$$;

-- the owner edits their own list; a parent may edit a child's list or a list for a profile with no login
create or replace function public.can_edit_wish_list(l uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select true from public.wish_lists w join public.family_members m on m.id = w.owner_member
    where w.id = l and public.is_family_member(w.family_id) and (
      w.owner_member = public.my_member_id()
      or (public.is_family_parent(w.family_id) and (m.role = 'child' or m.user_id is null))
    ) limit 1), false)
$$;

-- ---------------------------------------------------------------- share links (babysitter, outside family)

create table public.cal_shares (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('babysitter', 'outside')),
  people uuid[] not null default '{}',
  show_notes boolean not null default true,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by_member uuid,
  created_at timestamptz not null default now(),
  check (expires_at <= created_at + interval '400 days')
);
create index cal_shares_family_idx on public.cal_shares (family_id);

