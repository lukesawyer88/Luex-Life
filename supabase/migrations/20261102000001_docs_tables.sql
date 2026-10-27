-- Documents and Papers, part 1 of 3 (tables and who can see what). Module 8, grown-ups.
-- Simple on purpose: snap it, it goes in the right folder, and you're told before it runs out.
-- Household papers (and the children's) are for parents. Any grown-up can keep their own papers "just mine":
-- only they can see them. Children see nothing here. Privacy is set when a document is added and never changes.

create table public.doc_folders (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  emoji text check (char_length(emoji) <= 16),
  position double precision not null default 0,
  archived_at timestamptz
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  folder_id uuid references public.doc_folders (id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  -- who it's about (a passport is someone's)
  person_id uuid references public.family_members (id) on delete set null,
  -- the photos or PDF pages, in order
  pages text[] not null default '{}' check (cardinality(pages) <= 30),
  expires_on date,
  remind_days integer not null default 30 check (remind_days between 0 and 400),
  where_kept text check (char_length(where_kept) <= 120),
  -- key details, so you don't have to open the scan
  ref text check (char_length(ref) <= 80),
  phone text check (char_length(phone) <= 40),
  price numeric(10, 2) check (price >= 0 and price < 1000000),
  notes text not null default '' check (char_length(notes) <= 1000),
  -- "just mine": only this grown-up sees it (set when added, never changed)
  private_to uuid references public.family_members (id) on delete cascade,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index documents_family_idx on public.documents (family_id, expires_on);

-- reminders already sent (service only)
create table public.doc_sends (
  document_id uuid not null references public.documents (id) on delete cascade,
  for_date date not null,
  primary key (document_id, for_date)
);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('changes', 'reminder', 'leave', 'wishlist', 'weekly', 'chore',
   'message', 'mention', 'announcement', 'location', 'prompt', 'goal', 'kudos', 'memory', 'food', 'money', 'reward', 'school', 'docs'));

-- household papers: parents of my family; "just mine": only me (any grown-up)
create or replace function public.doc_ok(f uuid, priv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select f = public.my_family_id() and public.is_family_adult(f)
    and ((priv is null and public.is_family_parent(f)) or priv = public.my_member_id())
$$;
revoke all on function public.doc_ok(uuid, uuid) from public, anon;
grant execute on function public.doc_ok(uuid, uuid) to authenticated;

alter table public.doc_folders enable row level security;
alter table public.documents enable row level security;
alter table public.doc_sends enable row level security;
revoke all on public.doc_folders, public.documents, public.doc_sends from anon, authenticated;

-- folders: every grown-up reads (they file their own papers in them); parents change them
create policy doc_folders_read on public.doc_folders for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy doc_folders_add on public.doc_folders for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy doc_folders_change on public.doc_folders for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));

create policy documents_read on public.documents for select to authenticated using (public.doc_ok(family_id, private_to));
create policy documents_add on public.documents for insert to authenticated with check (public.doc_ok(family_id, private_to));
create policy documents_change on public.documents for update to authenticated
  using (public.doc_ok(family_id, private_to)) with check (public.doc_ok(family_id, private_to));

grant select on public.doc_folders, public.documents to authenticated;
grant insert (family_id, name, emoji, position) on public.doc_folders to authenticated;
grant update (name, emoji, position, archived_at) on public.doc_folders to authenticated;
grant insert (family_id, folder_id, title, person_id, pages, expires_on, remind_days, where_kept, ref, phone, price, notes, private_to)
  on public.documents to authenticated;
grant update (folder_id, title, person_id, pages, expires_on, remind_days, where_kept, ref, phone, price, notes, deleted_at)
  on public.documents to authenticated;
