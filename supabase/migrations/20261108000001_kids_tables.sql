-- Kids' Space, part 1 of 2 (tables and who can see what). Module 9, everyone.
-- Simple on purpose: a little space for each child, with three things.
--   1. Screen time: the household's rules for that child (written by a parent), and "Can I have more time?" asks
--      that a parent answers yes or no. Nothing controls the device itself (Apple and Google don't allow it).
--   2. Growing up: milestones (first steps, lost a tooth, rode a bike) and heights, with the age worked out.
--   3. All about me: the child's favourite things, for grandparents and the fridge door.
-- Who: a child sees their own rules and asks; parents see and answer everything; the whole household sees
-- milestones and "all about me".

create table public.kid_rules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.family_members (id) on delete cascade,
  emoji text check (char_length(emoji) <= 16),
  title text not null check (char_length(title) between 1 and 120),
  position double precision not null default 0,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index kid_rules_child_idx on public.kid_rules (child_id);

-- "Can I have more time?" (one open ask per child at a time; an ask left unanswered for 3 hours lapses)
create table public.kid_asks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.family_members (id) on delete cascade,
  minutes smallint not null check (minutes in (15, 30, 60)),
  reason text not null default '' check (char_length(reason) <= 120),
  status text not null default 'asked' check (status in ('asked', 'yes', 'no', 'lapsed')),
  answered_by uuid references public.family_members (id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index kid_asks_child_idx on public.kid_asks (child_id, created_at desc);
create unique index kid_asks_one_open on public.kid_asks (child_id) where status = 'asked';

create table public.kid_milestones (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid not null references public.family_members (id) on delete cascade,
  on_date date not null,
  emoji text check (char_length(emoji) <= 16),
  title text not null check (char_length(title) between 1 and 80),
  height_cm numeric(4, 1) check (height_cm between 30 and 250),
  notes text not null default '' check (char_length(notes) <= 300),
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index kid_milestones_child_idx on public.kid_milestones (child_id, on_date desc);

-- answers to a fixed set of questions, kept as {question: answer}
create or replace function public.kid_answers_ok(a jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(a) = 'object'
    and not exists (select 1 from jsonb_each(a) e
      where e.key not in ('colour', 'food', 'animal', 'game', 'friend', 'good_at', 'learning', 'grow_up')
         or jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 80)
$$;

create table public.kid_about (
  child_id uuid primary key references public.family_members (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb check (public.kid_answers_ok(answers)),
  updated_by uuid references public.family_members (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index kid_about_family_idx on public.kid_about (family_id);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('changes', 'reminder', 'leave', 'wishlist', 'weekly', 'chore',
   'message', 'mention', 'announcement', 'location', 'prompt', 'goal', 'kudos', 'memory', 'food', 'money', 'reward', 'school', 'docs', 'emergency', 'home', 'trip', 'hosting', 'kids'));

-- a child in my household (not archived)
create or replace function public.kid_in_family(f uuid, c uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.family_members where id = c and family_id = f and role = 'child' and archived_at is null)
$$;
revoke all on function public.kid_in_family(uuid, uuid) from public, anon;
grant execute on function public.kid_in_family(uuid, uuid) to authenticated;

alter table public.kid_rules enable row level security;
alter table public.kid_asks enable row level security;
alter table public.kid_milestones enable row level security;
alter table public.kid_about enable row level security;
revoke all on public.kid_rules, public.kid_asks, public.kid_milestones, public.kid_about from anon, authenticated;

-- rules: the child themselves and grown-ups read; parents write
create policy kid_rules_read on public.kid_rules for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id)
         and (child_id = (select public.my_member_id()) or public.is_family_adult(family_id)));
create policy kid_rules_add on public.kid_rules for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy kid_rules_change on public.kid_rules for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));

-- asks: the child and parents read; the child asks for themselves; parents answer
create policy kid_asks_read on public.kid_asks for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id)
         and (child_id = (select public.my_member_id()) or public.is_family_parent(family_id)));
create policy kid_asks_add on public.kid_asks for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_member(family_id) and child_id = (select public.my_member_id()));
create policy kid_asks_change on public.kid_asks for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));

-- milestones: the household reads; grown-ups add for any child, a child for themselves (the guard decides changes)
create policy kid_milestones_read on public.kid_milestones for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy kid_milestones_add on public.kid_milestones for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_member(family_id)
              and (public.is_family_adult(family_id) or child_id = (select public.my_member_id())));
create policy kid_milestones_change on public.kid_milestones for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_member(family_id));

-- all about me: the household reads; the child and parents write
create policy kid_about_read on public.kid_about for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy kid_about_add on public.kid_about for insert to authenticated
  with check (family_id = (select public.my_family_id())
              and (child_id = (select public.my_member_id()) or public.is_family_parent(family_id)));
create policy kid_about_change on public.kid_about for update to authenticated
  using (family_id = (select public.my_family_id()) and (child_id = (select public.my_member_id()) or public.is_family_parent(family_id)))
  with check (family_id = (select public.my_family_id()) and (child_id = (select public.my_member_id()) or public.is_family_parent(family_id)));

grant select on public.kid_rules, public.kid_asks, public.kid_milestones, public.kid_about to authenticated;
grant insert (family_id, child_id, emoji, title, position) on public.kid_rules to authenticated;
grant update (emoji, title, position, deleted_at) on public.kid_rules to authenticated;
grant insert (family_id, child_id, minutes, reason) on public.kid_asks to authenticated;
grant update (status) on public.kid_asks to authenticated;
grant insert (family_id, child_id, on_date, emoji, title, height_cm, notes) on public.kid_milestones to authenticated;
grant update (on_date, emoji, title, height_cm, notes, deleted_at) on public.kid_milestones to authenticated;
grant insert (family_id, child_id, answers) on public.kid_about to authenticated;
grant update (answers) on public.kid_about to authenticated;
