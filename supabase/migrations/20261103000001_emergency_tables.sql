-- Contacts and Emergency, part 1 of 3 (tables and who can see what). Module 9, everyone.
-- Simple on purpose: who to call and what to do, for everyone in the house and the babysitter. Never replaces 999 or 112.
-- Everyone in the household can see it (children too: it's for emergencies). Grown-ups keep the contacts and home
-- essentials; each grown-up keeps their own emergency card; parents keep the children's, pets' and anyone who doesn't sign in.
-- A grown-up can hide their medical conditions from everyone else.

create table public.em_contacts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  grp text not null default 'other' check (grp in ('family', 'medical', 'school', 'home', 'neighbours', 'other')),
  phone text check (char_length(phone) <= 40),
  phone2 text check (char_length(phone2) <= 40),
  email text check (char_length(email) <= 120),
  address text check (char_length(address) <= 200),
  notes text not null default '' check (char_length(notes) <= 500),
  -- "who to call", in order (1 first)
  call_order smallint check (call_order between 1 and 20),
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index em_contacts_family_idx on public.em_contacts (family_id);

-- an emergency card for each person (member_id) or pet (pet_name)
create table public.em_cards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid unique references public.family_members (id) on delete cascade,
  pet_name text check (char_length(pet_name) between 1 and 40),
  allergies text not null default '' check (char_length(allergies) <= 300),
  medicines text not null default '' check (char_length(medicines) <= 300),
  blood_group text check (blood_group in ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-')),
  -- GP (or vet, for a pet)
  doctor text check (char_length(doctor) <= 80),
  doctor_phone text check (char_length(doctor_phone) <= 40),
  -- pets
  microchip text check (char_length(microchip) <= 40),
  insurer text check (char_length(insurer) <= 80),
  notes text not null default '' check (char_length(notes) <= 300),
  updated_by uuid references public.family_members (id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((member_id is null) <> (pet_name is null))
);
create index em_cards_family_idx on public.em_cards (family_id);

-- medical conditions, kept apart so a grown-up can hide theirs
create table public.em_conditions (
  card_id uuid primary key references public.em_cards (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  conditions text not null default '' check (char_length(conditions) <= 500),
  shared boolean not null default true
);

-- where things are, and the family plan
create table public.em_home (
  family_id uuid primary key references public.families (id) on delete cascade,
  address text check (char_length(address) <= 300),
  stopcock text check (char_length(stopcock) <= 120),
  fuse_box text check (char_length(fuse_box) <= 120),
  gas_meter text check (char_length(gas_meter) <= 120),
  first_aid text check (char_length(first_aid) <= 120),
  spare_key text check (char_length(spare_key) <= 120),
  wifi_name text check (char_length(wifi_name) <= 60),
  wifi_password text check (char_length(wifi_password) <= 80),
  -- the Wi-Fi only goes in a babysitter link when this is ticked
  wifi_in_link boolean not null default false,
  meet_point text check (char_length(meet_point) <= 200),
  plan text check (char_length(plan) <= 500),
  bedtimes text check (char_length(bedtimes) <= 500),
  updated_by uuid references public.family_members (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- babysitter links (no sign-in; they run out)
create table public.em_shares (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at <= created_at + interval '32 days')
);
create index em_shares_family_idx on public.em_shares (family_id);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('changes', 'reminder', 'leave', 'wishlist', 'weekly', 'chore',
   'message', 'mention', 'announcement', 'location', 'prompt', 'goal', 'kudos', 'memory', 'food', 'money', 'reward', 'school', 'docs', 'emergency'));

-- who looks after a card: a grown-up their own; parents the children's, pets' and anyone who doesn't sign in
create or replace function public.em_can_edit(f uuid, m uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select f = public.my_family_id() and public.is_family_adult(f) and (
    m = public.my_member_id()
    or (public.is_family_parent(f) and (m is null or exists (
      select 1 from public.family_members x where x.id = m and x.family_id = f and (x.role = 'child' or x.user_id is null)))))
$$;
revoke all on function public.em_can_edit(uuid, uuid) from public, anon;
grant execute on function public.em_can_edit(uuid, uuid) to authenticated;

-- conditions: everyone in the household when shared; otherwise only whoever looks after the card
create or replace function public.em_sees_conditions(c uuid, sh boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.em_cards k where k.id = c and k.family_id = public.my_family_id()
    and public.is_family_member(k.family_id) and (sh or public.em_can_edit(k.family_id, k.member_id)))
$$;
revoke all on function public.em_sees_conditions(uuid, boolean) from public, anon;
grant execute on function public.em_sees_conditions(uuid, boolean) to authenticated;

create or replace function public.em_edits_card(c uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.em_cards k where k.id = c and public.em_can_edit(k.family_id, k.member_id))
$$;
revoke all on function public.em_edits_card(uuid) from public, anon;
grant execute on function public.em_edits_card(uuid) to authenticated;

alter table public.em_contacts enable row level security;
alter table public.em_cards enable row level security;
alter table public.em_conditions enable row level security;
alter table public.em_home enable row level security;
alter table public.em_shares enable row level security;
revoke all on public.em_contacts, public.em_cards, public.em_conditions, public.em_home, public.em_shares from anon, authenticated;

create policy em_contacts_read on public.em_contacts for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy em_contacts_add on public.em_contacts for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy em_contacts_change on public.em_contacts for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));

create policy em_cards_read on public.em_cards for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy em_cards_add on public.em_cards for insert to authenticated with check (public.em_can_edit(family_id, member_id));
create policy em_cards_change on public.em_cards for update to authenticated
  using (public.em_can_edit(family_id, member_id)) with check (public.em_can_edit(family_id, member_id));

create policy em_conditions_read on public.em_conditions for select to authenticated using (public.em_sees_conditions(card_id, shared));
create policy em_conditions_add on public.em_conditions for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.em_edits_card(card_id));
create policy em_conditions_change on public.em_conditions for update to authenticated
  using (public.em_edits_card(card_id)) with check (family_id = (select public.my_family_id()) and public.em_edits_card(card_id));

create policy em_home_read on public.em_home for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_member(family_id));
create policy em_home_add on public.em_home for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy em_home_change on public.em_home for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));

create policy em_shares_read on public.em_shares for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy em_shares_change on public.em_shares for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id))
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));

grant select on public.em_contacts, public.em_cards, public.em_conditions, public.em_home to authenticated;
grant select (id, family_id, name, expires_at, revoked_at, last_used_at, created_by, created_at) on public.em_shares to authenticated;
grant insert (family_id, name, grp, phone, phone2, email, address, notes, call_order) on public.em_contacts to authenticated;
grant update (name, grp, phone, phone2, email, address, notes, call_order, deleted_at) on public.em_contacts to authenticated;
grant insert (family_id, member_id, pet_name, allergies, medicines, blood_group, doctor, doctor_phone, microchip, insurer, notes) on public.em_cards to authenticated;
grant update (pet_name, allergies, medicines, blood_group, doctor, doctor_phone, microchip, insurer, notes, deleted_at) on public.em_cards to authenticated;
grant insert (card_id, family_id, conditions, shared) on public.em_conditions to authenticated;
grant update (conditions, shared) on public.em_conditions to authenticated;
grant insert (family_id, address, stopcock, fuse_box, gas_meter, first_aid, spare_key, wifi_name, wifi_password, wifi_in_link, meet_point, plan, bedtimes)
  on public.em_home to authenticated;
grant update (address, stopcock, fuse_box, gas_meter, first_aid, spare_key, wifi_name, wifi_password, wifi_in_link, meet_point, plan, bedtimes)
  on public.em_home to authenticated;
grant update (revoked_at) on public.em_shares to authenticated;
