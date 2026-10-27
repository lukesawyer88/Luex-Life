-- Rewards and Pocket Money, part 1 of 3 (tables and who can see what). Module 6, everyone.
-- Three ways, chosen per household: for me (habits and personal rewards), for us (shared rewards), for the children
-- (pocket money, stars and the reward shop). Nothing here moves real money: balances are a record kept by the household.
-- Rules: row-level security on every table, nothing granted by default, every read starts with "my family".
-- A person's stars, pocket money and habits are seen by that person, and by parents when the person is a child.

-- ---------------------------------------------------------------- household and personal settings

create table public.reward_settings (
  family_id uuid primary key references public.families (id) on delete cascade,
  for_me boolean not null default true,
  for_us boolean not null default true,
  children boolean not null default true,
  -- swap stars for money: this many stars make £1 (null = no swapping)
  stars_per_pound integer check (stars_per_pound between 1 and 1000),
  deductions_on boolean not null default false,
  -- paid each Sunday evening to a child whose chores for the week are all done
  week_bonus numeric(8, 2) not null default 0 check (week_bonus >= 0 and week_bonus < 1000),
  week_bonus_stars integer not null default 0 check (week_bonus_stars between 0 and 1000),
  updated_at timestamptz not null default now()
);

create table public.reward_people (
  member_id uuid primary key references public.family_members (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  -- regular pocket money (children) or treat-jar money (grown-ups, for themselves)
  pocket_amount numeric(8, 2) not null default 0 check (pocket_amount >= 0 and pocket_amount < 10000),
  pocket_every text not null default 'week' check (pocket_every in ('week', 'fortnight', 'month')),
  next_pay date,
  save_pct integer not null default 0 check (save_pct between 0 and 100),
  give_pct integer not null default 0 check (give_pct between 0 and 100),
  paused_until date,
  -- paid by the parents each month on the save pot
  interest_pct numeric(5, 2) not null default 0 check (interest_pct between 0 and 20),
  -- the parents add this % of what was saved each month
  match_pct integer not null default 0 check (match_pct between 0 and 200),
  teen_mode boolean not null default false,
  advance_owed numeric(8, 2) not null default 0 check (advance_owed >= 0 and advance_owed < 100000),
  advance_repay numeric(8, 2) not null default 0 check (advance_repay >= 0 and advance_repay < 10000),
  -- which notifications this person wants
  alerts text[] not null default '{goal,approval,pay,streak,cheer}'
    check (alerts <@ array['goal', 'approval', 'pay', 'streak', 'cheer']::text[]),
  updated_at timestamptz not null default now(),
  check (save_pct + give_pct <= 100)
);

-- ---------------------------------------------------------------- stars

create table public.star_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  delta integer not null check (delta <> 0 and abs(delta) < 100000),
  kind text not null check (kind in ('chore', 'routine', 'goal', 'habit', 'claim', 'give', 'swap', 'bonus', 'deduction', 'job', 'week')),
  -- where it came from (one entry per source, so nothing is counted twice)
  source_key text unique check (char_length(source_key) <= 200),
  note text not null default '' check (char_length(note) <= 120),
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now()
);
create index star_entries_member_idx on public.star_entries (member_id, created_at desc);
create index star_entries_family_idx on public.star_entries (family_id);

-- ---------------------------------------------------------------- habits

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  emoji text check (char_length(emoji) <= 16),
  -- 'day': reach the target each day (1 = a tick, 8 = eight glasses); 'week': reach it on that many days a week
  per text not null default 'day' check (per in ('day', 'week')),
  target integer not null default 1 check (target between 1 and 1000),
  unit text check (char_length(unit) <= 20),
  stars integer not null default 0 check (stars between 0 and 100),
  -- one person who sees this habit and can cheer
  buddy uuid references public.family_members (id) on delete set null,
  position double precision not null default 0,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index habits_member_idx on public.habits (member_id);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  day date not null,
  count integer not null default 1 check (count between 0 and 1000),
  -- ill, holiday: the day doesn't count for or against the streak
  skipped boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (habit_id, day)
);

-- ---------------------------------------------------------------- rewards (mine, shared, the children's shop)

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kind text not null check (kind in ('me', 'shared', 'shop')),
  -- 'me': whose it is
  owner uuid references public.family_members (id) on delete cascade,
  -- 'shared': who's in it (empty = everyone)
  people uuid[] not null default '{}' check (cardinality(people) <= 30),
  title text not null check (char_length(title) between 1 and 80),
  emoji text check (char_length(emoji) <= 16),
  stars integer not null check (stars between 1 and 100000),
  done_at timestamptz,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((kind = 'me') = (owner is not null)),
  check (kind = 'shared' or cardinality(people) = 0)
);

create table public.reward_gives (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  reward_id uuid not null references public.rewards (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  stars integer not null check (stars between 1 and 100000),
  created_at timestamptz not null default now()
);

create table public.reward_claims (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  reward_id uuid not null references public.rewards (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  stars integer not null default 0,
  status text not null default 'waiting' check (status in ('waiting', 'approved', 'declined')),
  decided_by uuid references public.family_members (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- pocket money and the treat jar

create table public.pocket_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  pot text not null default 'spend' check (pot in ('spend', 'save', 'give')),
  amount numeric(10, 2) not null check (amount <> 0 and abs(amount) < 1000000),
  kind text not null check (kind in ('pay', 'chore', 'job', 'bonus', 'deduction', 'spend', 'cash', 'gift', 'interest', 'match',
    'advance', 'repay', 'move', 'swap', 'tooth_fairy', 'birthday', 'week', 'other')),
  note text not null default '' check (char_length(note) <= 120),
  -- a child's spending, or a gift from someone who isn't a parent, waits for a parent's OK
  status text not null default 'ok' check (status in ('ok', 'waiting', 'declined')),
  on_date date not null default current_date,
  source_key text unique check (char_length(source_key) <= 200),
  created_by uuid references public.family_members (id) on delete set null,
  decided_by uuid references public.family_members (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index pocket_entries_member_idx on public.pocket_entries (member_id, on_date desc);
create index pocket_entries_family_idx on public.pocket_entries (family_id, on_date desc);

create table public.pocket_goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  emoji text check (char_length(emoji) <= 16),
  target numeric(10, 2) not null check (target > 0 and target < 1000000),
  wish_item_id uuid references public.wish_items (id) on delete set null,
  reached_at timestamptz,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- ---------------------------------------------------------------- up-for-grabs jobs

create table public.reward_jobs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  emoji text check (char_length(emoji) <= 16),
  money numeric(8, 2) not null default 0 check (money >= 0 and money < 10000),
  stars integer not null default 0 check (stars between 0 and 1000),
  -- who may claim it (empty = anyone in the household)
  people uuid[] not null default '{}' check (cardinality(people) <= 30),
  needs_photo boolean not null default false,
  claimed_by uuid references public.family_members (id) on delete set null,
  claimed_at timestamptz,
  done_at timestamptz,
  photo_path text check (char_length(photo_path) <= 300),
  confirmed_by uuid references public.family_members (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- ---------------------------------------------------------------- reminders already sent (service only)

create table public.reward_sends (
  member_id uuid not null references public.family_members (id) on delete cascade,
  kind text not null check (char_length(kind) <= 80),
  for_date date not null,
  primary key (member_id, kind, for_date)
);

-- ---------------------------------------------------------------- Calendar chores can pay money and ask for a photo

alter table public.chores add column money numeric(8, 2) not null default 0 check (money >= 0 and money < 1000);
alter table public.chores add column needs_photo boolean not null default false;
alter table public.chore_done add column photo_path text check (char_length(photo_path) <= 300);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('changes', 'reminder', 'leave', 'wishlist', 'weekly', 'chore',
   'message', 'mention', 'announcement', 'location', 'prompt', 'goal', 'kudos', 'memory', 'food', 'money', 'reward'));

-- ---------------------------------------------------------------- who can see whose things

-- me, or a child of my family when I'm a parent
create or replace function public.reward_sees(f uuid, m uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select f = public.my_family_id() and (
    m = public.my_member_id()
    or (public.is_family_parent(f) and exists (select 1 from public.family_members where id = m and family_id = f and role = 'child')))
$$;
revoke all on function public.reward_sees(uuid, uuid) from public, anon;
grant execute on function public.reward_sees(uuid, uuid) to authenticated;

create or replace function public.reward_sees_habit(h public.habits)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.reward_sees(h.family_id, h.member_id) or (h.family_id = public.my_family_id() and h.buddy = public.my_member_id())
$$;
create or replace function public.reward_sees_habit_id(hid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public.reward_sees_habit(h) from public.habits h where h.id = hid), false)
$$;

create or replace function public.reward_sees_reward(r public.rewards)
returns boolean language sql stable security definer set search_path = '' as $$
  select r.family_id = public.my_family_id() and case r.kind
    when 'me' then public.reward_sees(r.family_id, r.owner)
    when 'shared' then cardinality(r.people) = 0 or public.my_member_id() = any(r.people) or r.created_by = public.my_member_id()
      or public.is_family_parent(r.family_id)
    else true end
$$;
create or replace function public.reward_sees_reward_id(rid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public.reward_sees_reward(r) from public.rewards r where r.id = rid), false)
$$;

create or replace function public.reward_sees_job(j public.reward_jobs)
returns boolean language sql stable security definer set search_path = '' as $$
  select j.family_id = public.my_family_id() and (cardinality(j.people) = 0 or public.my_member_id() = any(j.people)
    or j.created_by = public.my_member_id() or j.claimed_by = public.my_member_id() or public.is_family_parent(j.family_id))
$$;
revoke all on function public.reward_sees_habit(public.habits), public.reward_sees_habit_id(uuid), public.reward_sees_reward(public.rewards),
  public.reward_sees_reward_id(uuid), public.reward_sees_job(public.reward_jobs) from public, anon;
grant execute on function public.reward_sees_habit(public.habits), public.reward_sees_habit_id(uuid), public.reward_sees_reward(public.rewards),
  public.reward_sees_reward_id(uuid), public.reward_sees_job(public.reward_jobs) to authenticated;

alter table public.reward_settings enable row level security;
alter table public.reward_people enable row level security;
alter table public.star_entries enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_gives enable row level security;
alter table public.reward_claims enable row level security;
alter table public.pocket_entries enable row level security;
alter table public.pocket_goals enable row level security;
alter table public.reward_jobs enable row level security;
alter table public.reward_sends enable row level security;

revoke all on public.reward_settings, public.reward_people, public.star_entries, public.habits, public.habit_logs, public.rewards,
  public.reward_gives, public.reward_claims, public.pocket_entries, public.pocket_goals, public.reward_jobs, public.reward_sends
  from anon, authenticated;

create policy reward_settings_read on public.reward_settings for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy reward_settings_add on public.reward_settings for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy reward_settings_change on public.reward_settings for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));

create policy reward_people_read on public.reward_people for select to authenticated using (public.reward_sees(family_id, member_id));
create policy reward_people_add on public.reward_people for insert to authenticated with check (public.reward_sees(family_id, member_id));
create policy reward_people_change on public.reward_people for update to authenticated
  using (public.reward_sees(family_id, member_id)) with check (public.reward_sees(family_id, member_id));

create policy star_entries_read on public.star_entries for select to authenticated using (public.reward_sees(family_id, member_id));
create policy star_entries_add on public.star_entries for insert to authenticated
  with check (public.reward_sees(family_id, member_id) and public.is_family_parent(family_id));

create policy habits_read on public.habits for select to authenticated
  using (family_id = (select public.my_family_id()) and public.reward_sees_habit(habits));
create policy habits_add on public.habits for insert to authenticated with check (public.reward_sees(family_id, member_id));
create policy habits_change on public.habits for update to authenticated
  using (public.reward_sees(family_id, member_id)) with check (public.reward_sees(family_id, member_id));

create policy habit_logs_read on public.habit_logs for select to authenticated
  using (family_id = (select public.my_family_id()) and public.reward_sees_habit_id(habit_id));
create policy habit_logs_add on public.habit_logs for insert to authenticated with check (public.reward_sees(family_id, member_id));
create policy habit_logs_change on public.habit_logs for update to authenticated
  using (public.reward_sees(family_id, member_id)) with check (public.reward_sees(family_id, member_id));
create policy habit_logs_remove on public.habit_logs for delete to authenticated using (public.reward_sees(family_id, member_id));

create policy rewards_read on public.rewards for select to authenticated
  using (family_id = (select public.my_family_id()) and public.reward_sees_reward(rewards));
create policy rewards_add on public.rewards for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.reward_sees_reward(rewards));
create policy rewards_change on public.rewards for update to authenticated
  using (family_id = (select public.my_family_id()) and public.reward_sees_reward(rewards))
  with check (family_id = (select public.my_family_id()) and public.reward_sees_reward(rewards));

create policy reward_gives_read on public.reward_gives for select to authenticated
  using (family_id = (select public.my_family_id()) and public.reward_sees_reward_id(reward_id));
create policy reward_gives_add on public.reward_gives for insert to authenticated
  with check (family_id = (select public.my_family_id()) and member_id = (select public.my_member_id()) and public.reward_sees_reward_id(reward_id));

create policy reward_claims_read on public.reward_claims for select to authenticated using (public.reward_sees(family_id, member_id));
create policy reward_claims_add on public.reward_claims for insert to authenticated
  with check (public.reward_sees(family_id, member_id) and public.reward_sees_reward_id(reward_id));
create policy reward_claims_decide on public.reward_claims for update to authenticated
  using (public.reward_sees(family_id, member_id) and public.is_family_parent(family_id))
  with check (public.reward_sees(family_id, member_id) and public.is_family_parent(family_id));

create policy pocket_entries_read on public.pocket_entries for select to authenticated using (public.reward_sees(family_id, member_id));
-- grown-ups who aren't parents may give a child gift money (it waits for a parent)
create policy pocket_entries_add on public.pocket_entries for insert to authenticated
  with check (public.reward_sees(family_id, member_id)
    or (family_id = (select public.my_family_id()) and public.is_family_adult(family_id) and kind in ('gift', 'birthday')
        and exists (select 1 from public.family_members m where m.id = member_id and m.family_id = pocket_entries.family_id and m.role = 'child')));
create policy pocket_entries_decide on public.pocket_entries for update to authenticated
  using (public.reward_sees(family_id, member_id) and public.is_family_parent(family_id))
  with check (public.reward_sees(family_id, member_id) and public.is_family_parent(family_id));
create policy pocket_entries_remove on public.pocket_entries for delete to authenticated
  using (public.reward_sees(family_id, member_id) and (public.is_family_parent(family_id) or created_by = (select public.my_member_id())));

create policy pocket_goals_read on public.pocket_goals for select to authenticated using (public.reward_sees(family_id, member_id));
create policy pocket_goals_add on public.pocket_goals for insert to authenticated with check (public.reward_sees(family_id, member_id));
create policy pocket_goals_change on public.pocket_goals for update to authenticated
  using (public.reward_sees(family_id, member_id)) with check (public.reward_sees(family_id, member_id));

create policy reward_jobs_read on public.reward_jobs for select to authenticated
  using (family_id = (select public.my_family_id()) and public.reward_sees_job(reward_jobs));
create policy reward_jobs_add on public.reward_jobs for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy reward_jobs_change on public.reward_jobs for update to authenticated
  using (family_id = (select public.my_family_id()) and public.reward_sees_job(reward_jobs))
  with check (family_id = (select public.my_family_id()) and public.reward_sees_job(reward_jobs));

-- ---------------------------------------------------------------- grants (exactly what the app needs)

grant select on public.reward_settings, public.reward_people, public.star_entries, public.habits, public.habit_logs, public.rewards,
  public.reward_gives, public.reward_claims, public.pocket_entries, public.pocket_goals, public.reward_jobs to authenticated;

grant insert (family_id, for_me, for_us, children, stars_per_pound, deductions_on, week_bonus, week_bonus_stars) on public.reward_settings to authenticated;
grant update (for_me, for_us, children, stars_per_pound, deductions_on, week_bonus, week_bonus_stars) on public.reward_settings to authenticated;

grant insert (member_id, family_id, pocket_amount, pocket_every, next_pay, save_pct, give_pct, paused_until, interest_pct, match_pct, teen_mode,
  advance_repay, alerts) on public.reward_people to authenticated;
grant update (pocket_amount, pocket_every, next_pay, save_pct, give_pct, paused_until, interest_pct, match_pct, teen_mode,
  advance_repay, alerts) on public.reward_people to authenticated;

grant insert (family_id, member_id, delta, kind, note) on public.star_entries to authenticated;

grant insert (family_id, member_id, title, emoji, per, target, unit, stars, buddy, position) on public.habits to authenticated;
grant update (title, emoji, per, target, unit, stars, buddy, position, archived_at) on public.habits to authenticated;
grant insert (family_id, habit_id, member_id, day, count, skipped) on public.habit_logs to authenticated;
grant update (count, skipped) on public.habit_logs to authenticated;
grant delete on public.habit_logs to authenticated;

grant insert (family_id, kind, owner, people, title, emoji, stars) on public.rewards to authenticated;
grant update (people, title, emoji, stars, archived_at) on public.rewards to authenticated;
grant insert (family_id, reward_id, member_id, stars) on public.reward_gives to authenticated;
grant insert (family_id, reward_id, member_id) on public.reward_claims to authenticated;
grant update (status) on public.reward_claims to authenticated;

grant insert (family_id, member_id, pot, amount, kind, note, on_date) on public.pocket_entries to authenticated;
grant update (status) on public.pocket_entries to authenticated;
grant delete on public.pocket_entries to authenticated;
grant insert (family_id, member_id, title, emoji, target, wish_item_id) on public.pocket_goals to authenticated;
grant update (title, emoji, target, archived_at) on public.pocket_goals to authenticated;

grant insert (family_id, title, emoji, money, stars, people, needs_photo) on public.reward_jobs to authenticated;
grant update (title, emoji, money, stars, people, needs_photo, claimed_by, done_at, photo_path, confirmed_at, archived_at) on public.reward_jobs to authenticated;

-- the Calendar's chores: the new columns
grant insert (money, needs_photo) on public.chores to authenticated;
grant update (money, needs_photo) on public.chores to authenticated;
grant insert (photo_path) on public.chore_done to authenticated;
