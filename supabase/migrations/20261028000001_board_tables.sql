-- Family Board, part 1 of 5 (tables). Module 3: messages, photos, lists, notes, goals, journal and memories.
-- Rules as for the Calendar: row-level security on every table, nothing granted by default, the database
-- refuses what the screen hides. Tables that go out as live updates have a plain uuid key, so a delete
-- message (which skips row security) carries nothing but a random id.

-- ---------------------------------------------------------------- per-person settings

create table public.board_settings (
  member_id uuid primary key references public.family_members (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  -- children's switches (parents set them; ignored for adults)
  chat boolean not null default true,
  private_chats boolean not null default true,
  photos boolean not null default true,
  voice boolean not null default true,
  location boolean not null default true,
  parents_can_read boolean not null default false,
  journal_prompts boolean not null default false,
  journal_time time not null default '18:00',
  journal_parents_see boolean not null default true,
  -- everyone: quiet hours (children's set by a parent) and how much the Board notifies them
  quiet_from time,
  quiet_to time,
  alerts text not null default 'all' check (alerts in ('all', 'mentions', 'off')),
  updated_at timestamptz not null default now(),
  check ((quiet_from is null) = (quiet_to is null) and (quiet_from is null or quiet_from <> quiet_to))
);

-- ---------------------------------------------------------------- chats

create table public.board_threads (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kind text not null check (kind in ('family', 'group', 'direct')),
  title text check (char_length(title) between 1 and 60),
  emoji text check (char_length(emoji) <= 16),
  -- direct chats: the two people, smallest id first, so there is only ever one chat per pair
  direct_key text,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((kind = 'group') = (title is not null)),
  check ((kind = 'direct') = (direct_key is not null))
);
create unique index board_threads_one_family_chat on public.board_threads (family_id) where kind = 'family';
create unique index board_threads_one_direct on public.board_threads (family_id, direct_key) where kind = 'direct';

-- who is in a group or direct chat (the family chat is everyone)
create table public.board_thread_people (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.board_threads (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (thread_id, member_id)
);
create index board_thread_people_member_idx on public.board_thread_people (member_id);

-- read position and mute, per person per chat (also gives "seen by")
create table public.board_thread_state (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.board_threads (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  unique (thread_id, member_id)
);

create table public.board_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  thread_id uuid not null references public.board_threads (id) on delete cascade,
  author uuid references public.family_members (id) on delete set null,
  kind text not null default 'text' check (kind in
    ('text', 'photo', 'voice', 'poll', 'location', 'location_request', 'sticker', 'announcement', 'kudos')),
  body text not null default '' check (char_length(body) <= 4000),
  reply_to uuid references public.board_messages (id) on delete set null,
  mentions uuid[] not null default '{}' check (cardinality(mentions) <= 20),
  kudos_to uuid references public.family_members (id) on delete set null,
  ask_member uuid references public.family_members (id) on delete set null,
  sticker text check (char_length(sticker) <= 40),
  -- the sending device's own id, so a message sent twice after a lost signal is only saved once
  client_id text check (char_length(client_id) <= 64),
  pinned_at timestamptz,
  pinned_by uuid references public.family_members (id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.family_members (id) on delete set null,
  -- bumped when reactions, votes or "Got it" change, so screens know to refresh
  activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (author, client_id)
);
create index board_messages_thread_idx on public.board_messages (thread_id, created_at desc);
create index board_messages_family_idx on public.board_messages (family_id, created_at desc);

create table public.board_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.board_messages (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (message_id, member_id, emoji)
);

-- "Got it" on announcements
create table public.board_acks (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.board_messages (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  acked_at timestamptz not null default now(),
  unique (message_id, member_id)
);

-- polls (a poll is a message; "date" polls can become a calendar event)
create table public.board_polls (
  message_id uuid primary key references public.board_messages (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 200),
  kind text not null default 'choice' check (kind in ('choice', 'date')),
  multi boolean not null default false,
  closed_at timestamptz,
  event_id uuid references public.cal_events (id) on delete set null
);
create table public.board_poll_options (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.board_polls (message_id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 100),
  on_date date,
  position integer not null default 0
);
create index board_poll_options_poll_idx on public.board_poll_options (message_id);
create table public.board_poll_votes (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.board_poll_options (id) on delete cascade,
  message_id uuid not null references public.board_polls (message_id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (option_id, member_id)
);
create index board_poll_votes_poll_idx on public.board_poll_votes (message_id);

-- "Where are you?" answers: the place itself is kept for one hour only
create table public.board_locations (
  message_id uuid primary key references public.board_messages (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  thread_id uuid not null references public.board_threads (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy integer check (accuracy between 0 and 100000),
  expires_at timestamptz not null default (now() + interval '1 hour')
);

-- ---------------------------------------------------------------- albums and media

create table public.board_albums (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  kind text not null default 'album' check (kind in ('album', 'drawings')),
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- journal entries, memories and milestones
create table public.board_memories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  author uuid references public.family_members (id) on delete set null,
  kind text not null default 'memory' check (kind in ('memory', 'milestone', 'journal')),
  title text not null default '' check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 10000),
  happened_on date not null default current_date,
  people uuid[] not null default '{}' check (cardinality(people) <= 30),
  -- milestones belong to one child
  milestone_for uuid references public.family_members (id) on delete cascade,
  prompt_id uuid,
  prompt_text text check (char_length(prompt_text) <= 200),
  -- 'private': the author (and parents, for a child who lets them see journal answers)
  audience text not null default 'family' check (audience in ('family', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((kind = 'milestone') = (milestone_for is not null))
);
create index board_memories_family_idx on public.board_memories (family_id, happened_on desc);

create table public.board_media (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  owner uuid references public.family_members (id) on delete set null,
  -- where it lives: a chat message, an album, or a memory (exactly one of thread / album-or-family / memory)
  thread_id uuid references public.board_threads (id) on delete cascade,
  message_id uuid references public.board_messages (id) on delete cascade,
  album_id uuid references public.board_albums (id) on delete set null,
  memory_id uuid references public.board_memories (id) on delete cascade,
  path text not null unique check (char_length(path) <= 300),
  kind text not null check (kind in ('photo', 'video', 'voice', 'drawing')),
  mime text not null check (char_length(mime) <= 100),
  bytes bigint not null default 0 check (bytes >= 0),
  width integer,
  height integer,
  duration_s numeric(6, 1) check (duration_s is null or duration_s between 0 and 180),
  caption text not null default '' check (char_length(caption) <= 500),
  people uuid[] not null default '{}' check (cardinality(people) <= 30),
  taken_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (message_id is null or thread_id is not null),
  check (not (thread_id is not null and memory_id is not null))
);
create index board_media_family_idx on public.board_media (family_id, created_at desc);
create index board_media_thread_idx on public.board_media (thread_id);
create index board_media_memory_idx on public.board_media (memory_id);

-- read-only album links for relatives without a login
create table public.board_album_shares (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  album_id uuid not null references public.board_albums (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- lists and notes

create table public.board_lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  emoji text check (char_length(emoji) <= 16),
  kind text not null default 'list' check (kind in ('list', 'bucket')),
  is_template boolean not null default false,
  position double precision not null default 0,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.board_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.board_lists (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 300),
  assignee uuid references public.family_members (id) on delete set null,
  position double precision not null default 0,
  done_at timestamptz,
  done_by uuid references public.family_members (id) on delete set null,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now()
);
create index board_list_items_list_idx on public.board_list_items (list_id, position);

create table public.board_notes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  author uuid references public.family_members (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  colour text not null default 'yellow' check (colour in ('yellow', 'blue', 'green', 'pink', 'orange', 'purple')),
  pinned boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index board_notes_family_idx on public.board_notes (family_id, created_at desc);

-- ---------------------------------------------------------------- goals

create table public.board_goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  emoji text check (char_length(emoji) <= 16),
  -- a number to reach (e.g. 50 books), or steps, or both
  target integer check (target is null or target between 1 and 100000),
  unit text check (char_length(unit) <= 30),
  progress integer not null default 0 check (progress between 0 and 100000),
  due_on date,
  -- who it's for (empty = the whole family); stars go to each of them when a grown-up confirms it's done
  people uuid[] not null default '{}' check (cardinality(people) <= 30),
  stars integer not null default 0 check (stars between 0 and 100),
  done_at timestamptz,
  done_by uuid references public.family_members (id) on delete set null,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.board_goal_steps (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.board_goals (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  position double precision not null default 0,
  done_at timestamptz,
  done_by uuid references public.family_members (id) on delete set null
);
create index board_goal_steps_goal_idx on public.board_goal_steps (goal_id, position);

-- ---------------------------------------------------------------- journal questions

-- family_id null = one of Luex's built-in questions
create table public.board_prompts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families (id) on delete cascade,
  text text not null check (char_length(text) between 3 and 200),
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- which question each child was sent each day (service only)
create table public.board_prompt_sends (
  member_id uuid not null references public.family_members (id) on delete cascade,
  day date not null,
  prompt_id uuid references public.board_prompts (id) on delete set null,
  sent_at timestamptz not null default now(),
  primary key (member_id, day)
);

alter table public.board_memories add constraint board_memories_prompt_fk
  foreign key (prompt_id) references public.board_prompts (id) on delete set null;

insert into public.board_prompts (text) values
  ('What made you laugh today?'),
  ('What was the best bit of your day?'),
  ('Who did you play with today?'),
  ('What did you learn today?'),
  ('What was tricky today, and what helped?'),
  ('What are you looking forward to?'),
  ('What was the yummiest thing you ate today?'),
  ('If you could have any superpower, what would it be?'),
  ('What made you feel proud today?'),
  ('Who was kind to you today?'),
  ('What was a kind thing you did for someone?'),
  ('What would you like to do this weekend?'),
  ('What is your favourite song right now?'),
  ('If you were a teacher for a day, what would you teach?'),
  ('What made you feel happy today?'),
  ('What is something new you tried?'),
  ('Where would you like to go on holiday?'),
  ('What is your favourite thing about our family?'),
  ('What animal would you be, and why?'),
  ('What did you dream about last night?'),
  ('What game did you enjoy today?'),
  ('What is one thing you want to get better at?'),
  ('What was the funniest thing someone said today?'),
  ('What are you thankful for today?'),
  ('If you could invent something, what would it be?'),
  ('What made today different from yesterday?'),
  ('What would you cook for the family?'),
  ('Who would you like to see soon?'),
  ('What is your favourite book or story right now?'),
  ('What was the best thing you saw outside today?');

-- every table locked until part 3 opens exactly what is needed
alter table public.board_settings enable row level security;
alter table public.board_threads enable row level security;
alter table public.board_thread_people enable row level security;
alter table public.board_thread_state enable row level security;
alter table public.board_messages enable row level security;
alter table public.board_reactions enable row level security;
alter table public.board_acks enable row level security;
alter table public.board_polls enable row level security;
alter table public.board_poll_options enable row level security;
alter table public.board_poll_votes enable row level security;
alter table public.board_locations enable row level security;
alter table public.board_albums enable row level security;
alter table public.board_memories enable row level security;
alter table public.board_media enable row level security;
alter table public.board_album_shares enable row level security;
alter table public.board_lists enable row level security;
alter table public.board_list_items enable row level security;
alter table public.board_notes enable row level security;
alter table public.board_goals enable row level security;
alter table public.board_goal_steps enable row level security;
alter table public.board_prompts enable row level security;
alter table public.board_prompt_sends enable row level security;

revoke all on public.board_settings, public.board_threads, public.board_thread_people, public.board_thread_state,
  public.board_messages, public.board_reactions, public.board_acks, public.board_polls, public.board_poll_options,
  public.board_poll_votes, public.board_locations, public.board_albums, public.board_memories, public.board_media,
  public.board_album_shares, public.board_lists, public.board_list_items, public.board_notes, public.board_goals,
  public.board_goal_steps, public.board_prompts, public.board_prompt_sends
  from anon, authenticated;

-- new Board notification kinds
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('changes', 'reminder', 'leave', 'wishlist', 'weekly', 'chore',
   'message', 'mention', 'announcement', 'location', 'prompt', 'goal', 'kudos', 'memory'));
