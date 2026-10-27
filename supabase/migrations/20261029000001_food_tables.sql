-- Food, part 1 of 3 (tables and who can see what). Module 4: meal plan, recipes, shopping lists, stock,
-- packed lunches, takeaways, food budget, and calories for grown-ups who switch them on.
-- Rules as for the Calendar and Board: row-level security on every table, nothing granted by default, every
-- read policy starts with "my family", tables that go out as live updates have a plain uuid key.
-- Roles: parents change anything; other grown-ups change what they added (plus the shared list and stock);
-- children add and tick, request dinners, and change only their own things.

-- ---------------------------------------------------------------- per-person food settings and "avoid" tags

create table public.food_settings (
  member_id uuid primary key references public.family_members (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  -- calories and macros: grown-ups only, private to the person
  calories_on boolean not null default false,
  kcal_target integer check (kcal_target between 500 and 10000),
  updated_at timestamptz not null default now()
);

-- allergies, dislikes and diets: a short label per person (not medical records)
create table public.food_avoid (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  kind text not null check (kind in ('allergy', 'dislike', 'diet')),
  label text not null check (char_length(label) between 1 and 40),
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (member_id, kind, label)
);

-- ---------------------------------------------------------------- recipes

create table public.food_collections (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  emoji text check (char_length(emoji) <= 16),
  position double precision not null default 0,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.food_recipes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  photo_path text check (char_length(photo_path) <= 300),
  source_url text check (char_length(source_url) <= 1000 and (source_url is null or source_url ~* '^https?://')),
  servings integer not null default 4 check (servings between 1 and 100),
  prep_min integer check (prep_min between 0 and 2000),
  cook_min integer check (cook_min between 0 and 5000),
  -- [{ qty, unit, name, note, aisle }]
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) <= 100),
  -- [{ text, timer_s, uses: [ingredient index] }]
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 100),
  tags text[] not null default '{}' check (cardinality(tags) <= 30 and char_length(array_to_string(tags, '')) <= 900),
  -- what's in it (matched against people's "avoid" labels)
  allergens text[] not null default '{}' check (cardinality(allergens) <= 20 and char_length(array_to_string(allergens, '')) <= 400),
  collections uuid[] not null default '{}' check (cardinality(collections) <= 20),
  -- per serving, estimates: { kcal, protein, carbs, fat }
  nutrition jsonb check (nutrition is null or (jsonb_typeof(nutrition) = 'object' and pg_column_size(nutrition) < 2000)),
  notes text not null default '' check (char_length(notes) <= 4000),
  times_made integer not null default 0 check (times_made >= 0),
  last_made date,
  -- a seasonal menu (e.g. Christmas dinner): a timeline of steps relative to serving time
  timeline jsonb check (timeline is null or (jsonb_typeof(timeline) = 'array' and jsonb_array_length(timeline) <= 60
    and pg_column_size(timeline) < 20000)),
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (pg_column_size(ingredients) + pg_column_size(steps) < 200000)
);
create index food_recipes_family_idx on public.food_recipes (family_id, title);

create table public.food_ratings (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.food_recipes (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  unique (recipe_id, member_id)
);

-- ---------------------------------------------------------------- meal plan

create table public.food_plan (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  day date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id uuid references public.food_recipes (id) on delete set null,
  -- a meal without a recipe ("Pizza night", "Leftovers", "Takeaway")
  title text not null default '' check (char_length(title) <= 120),
  servings integer check (servings between 1 and 100),
  -- who's eating (empty = everyone) and who's cooking
  people uuid[] not null default '{}' check (cardinality(people) <= 30),
  cook uuid references public.family_members (id) on delete set null,
  -- leftovers of another planned meal
  leftover_of uuid references public.food_plan (id) on delete set null,
  takeaway_id uuid,
  notes text not null default '' check (char_length(notes) <= 500),
  position double precision not null default 0,
  -- children ask; a parent says yes or no
  status text not null default 'planned' check (status in ('planned', 'requested', 'declined')),
  requested_by uuid references public.family_members (id) on delete set null,
  cal_event_id uuid references public.cal_events (id) on delete set null,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recipe_id is not null or char_length(title) > 0)
);
create index food_plan_family_day_idx on public.food_plan (family_id, day);

-- packed lunches, per child per school day
create table public.food_lunches (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  day date not null,
  items text[] not null default '{}' check (cardinality(items) <= 20 and char_length(array_to_string(items, '')) <= 1200),
  packed boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 300),
  updated_by uuid references public.family_members (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (member_id, day)
);

-- ---------------------------------------------------------------- shopping

create table public.food_lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  emoji text check (char_length(emoji) <= 16),
  position double precision not null default 0,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- the family's aisles, in the order of their shop
create table public.food_aisles (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  position double precision not null default 0,
  unique (family_id, name)
);

-- items the family has bought before: remembers the aisle, favourites and recent items
create table public.food_known_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  name_key text not null,
  aisle text check (char_length(aisle) <= 40),
  unit text check (char_length(unit) <= 20),
  favourite boolean not null default false,
  used_count integer not null default 0,
  last_used timestamptz not null default now(),
  barcode text check (char_length(barcode) <= 32),
  unique (family_id, name_key)
);

create table public.food_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.food_lists (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  quantity numeric(10, 2) check (quantity > 0 and quantity < 100000),
  unit text check (char_length(unit) <= 20),
  note text not null default '' check (char_length(note) <= 200),
  aisle text check (char_length(aisle) <= 40),
  photo_path text check (char_length(photo_path) <= 300),
  assignee uuid references public.family_members (id) on delete set null,
  recipe_ids uuid[] not null default '{}' check (cardinality(recipe_ids) <= 30),
  position double precision not null default 0,
  done_at timestamptz,
  done_by uuid references public.family_members (id) on delete set null,
  added_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now()
);
create index food_list_items_list_idx on public.food_list_items (list_id, position);

-- ---------------------------------------------------------------- stock (light: use-soon things and the freezer)

create table public.food_stock (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  place text not null default 'fridge' check (place in ('fridge', 'freezer', 'cupboard')),
  quantity numeric(10, 2) check (quantity >= 0 and quantity < 100000),
  unit text check (char_length(unit) <= 20),
  portions integer check (portions between 0 and 100),
  use_by date,
  -- running low: add to the list when quantity drops to this
  low_at numeric(10, 2) check (low_at >= 0),
  barcode text check (char_length(barcode) <= 32),
  from_recipe uuid references public.food_recipes (id) on delete set null,
  -- per 100 g or per item, from the barcode database (estimates)
  nutrition jsonb check (nutrition is null or (jsonb_typeof(nutrition) = 'object' and pg_column_size(nutrition) < 2000)),
  added_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  used_up_at timestamptz
);
create index food_stock_family_idx on public.food_stock (family_id, use_by);

-- ---------------------------------------------------------------- takeaways

create table public.food_takeaways (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  phone text check (char_length(phone) <= 30),
  link text check (char_length(link) <= 500 and (link is null or link ~* '^https://')),
  notes text not null default '' check (char_length(notes) <= 500),
  last_ordered date,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
alter table public.food_plan add constraint food_plan_takeaway_fk
  foreign key (takeaway_id) references public.food_takeaways (id) on delete set null;

create table public.food_takeaway_orders (
  id uuid primary key default gen_random_uuid(),
  takeaway_id uuid not null references public.food_takeaways (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  order_text text not null check (char_length(order_text) between 1 and 300),
  updated_at timestamptz not null default now(),
  unique (takeaway_id, member_id)
);

-- ---------------------------------------------------------------- food budget (parents)

create table public.food_spend (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  spent_on date not null default current_date,
  amount numeric(10, 2) not null check (amount > 0 and amount < 100000),
  store text check (char_length(store) <= 60),
  note text not null default '' check (char_length(note) <= 200),
  added_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- calories (only the person themselves)

create table public.food_diary (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  day date not null default current_date,
  slot text not null default 'snack' check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  label text not null check (char_length(label) between 1 and 120),
  kcal integer check (kcal between 0 and 20000),
  protein numeric(7, 1) check (protein >= 0),
  carbs numeric(7, 1) check (carbs >= 0),
  fat numeric(7, 1) check (fat >= 0),
  created_at timestamptz not null default now()
);
create index food_diary_member_idx on public.food_diary (member_id, day);

-- recipe imports per person (service only): stops the import service being used to fetch pages in bulk
create table public.food_import_log (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.family_members (id) on delete cascade,
  at timestamptz not null default now()
);
create index food_import_log_member_idx on public.food_import_log (member_id, at desc);

-- use-by alerts already sent (service only)
create table public.food_alert_sends (
  stock_id uuid not null references public.food_stock (id) on delete cascade,
  day date not null,
  primary key (stock_id, day)
);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('changes', 'reminder', 'leave', 'wishlist', 'weekly', 'chore',
   'message', 'mention', 'announcement', 'location', 'prompt', 'goal', 'kudos', 'memory', 'food'));

-- ---------------------------------------------------------------- lock everything, then open exactly what's needed

alter table public.food_settings enable row level security;
alter table public.food_avoid enable row level security;
alter table public.food_collections enable row level security;
alter table public.food_recipes enable row level security;
alter table public.food_ratings enable row level security;
alter table public.food_plan enable row level security;
alter table public.food_lunches enable row level security;
alter table public.food_lists enable row level security;
alter table public.food_aisles enable row level security;
alter table public.food_known_items enable row level security;
alter table public.food_list_items enable row level security;
alter table public.food_stock enable row level security;
alter table public.food_takeaways enable row level security;
alter table public.food_takeaway_orders enable row level security;
alter table public.food_spend enable row level security;
alter table public.food_diary enable row level security;
alter table public.food_alert_sends enable row level security;
alter table public.food_import_log enable row level security;

revoke all on public.food_settings, public.food_avoid, public.food_collections, public.food_recipes, public.food_ratings,
  public.food_plan, public.food_lunches, public.food_lists, public.food_aisles, public.food_known_items,
  public.food_list_items, public.food_stock, public.food_takeaways, public.food_takeaway_orders, public.food_spend,
  public.food_diary, public.food_alert_sends, public.food_import_log
  from anon, authenticated;

-- settings and diary: only the person themselves
create policy food_settings_read on public.food_settings for select to authenticated
  using (member_id = (select public.my_member_id()));
create policy food_settings_add on public.food_settings for insert to authenticated
  with check (member_id = (select public.my_member_id()) and family_id = (select public.my_family_id()));
create policy food_settings_change on public.food_settings for update to authenticated
  using (member_id = (select public.my_member_id())) with check (member_id = (select public.my_member_id()));

create policy food_diary_read on public.food_diary for select to authenticated
  using (member_id = (select public.my_member_id()));
create policy food_diary_add on public.food_diary for insert to authenticated
  with check (member_id = (select public.my_member_id()) and family_id = (select public.my_family_id()));
create policy food_diary_change on public.food_diary for update to authenticated
  using (member_id = (select public.my_member_id())) with check (member_id = (select public.my_member_id()));
create policy food_diary_remove on public.food_diary for delete to authenticated
  using (member_id = (select public.my_member_id()));

-- "avoid" tags: the whole family sees them (whoever cooks needs to know); parents set anyone's, grown-ups their own
create policy food_avoid_read on public.food_avoid for select to authenticated
  using (family_id = (select public.my_family_id()));
create policy food_avoid_add on public.food_avoid for insert to authenticated
  with check (family_id = (select public.my_family_id()) and (public.is_family_parent(family_id)
    or (member_id = (select public.my_member_id()) and public.is_family_adult(family_id))));
create policy food_avoid_remove on public.food_avoid for delete to authenticated
  using (family_id = (select public.my_family_id()) and (public.is_family_parent(family_id)
    or (member_id = (select public.my_member_id()) and public.is_family_adult(family_id))));

-- recipes and collections: everyone reads and adds; the person who added it or a parent changes it
create policy food_collections_read on public.food_collections for select to authenticated using (family_id = (select public.my_family_id()));
create policy food_collections_add on public.food_collections for insert to authenticated with check (family_id = (select public.my_family_id()));
create policy food_collections_change on public.food_collections for update to authenticated
  using (family_id = (select public.my_family_id()) and (public.is_family_parent(family_id) or created_by = (select public.my_member_id())))
  with check (family_id = (select public.my_family_id()));
create policy food_collections_remove on public.food_collections for delete to authenticated
  using (family_id = (select public.my_family_id()) and (public.is_family_parent(family_id) or created_by = (select public.my_member_id())));

create policy food_recipes_read on public.food_recipes for select to authenticated using (family_id = (select public.my_family_id()));
create policy food_recipes_add on public.food_recipes for insert to authenticated with check (family_id = (select public.my_family_id()));
-- anyone may record "made it" (the guard allows only that for others' recipes)
create policy food_recipes_change on public.food_recipes for update to authenticated
  using (family_id = (select public.my_family_id())) with check (family_id = (select public.my_family_id()));

create policy food_ratings_read on public.food_ratings for select to authenticated using (family_id = (select public.my_family_id()));
create policy food_ratings_add on public.food_ratings for insert to authenticated
  with check (family_id = (select public.my_family_id()) and member_id = (select public.my_member_id()));
create policy food_ratings_change on public.food_ratings for update to authenticated
  using (member_id = (select public.my_member_id())) with check (member_id = (select public.my_member_id()));
create policy food_ratings_remove on public.food_ratings for delete to authenticated
  using (member_id = (select public.my_member_id()));

-- plan and lunches: everyone reads; the guard decides what each role may change
create policy food_plan_read on public.food_plan for select to authenticated using (family_id = (select public.my_family_id()));
create policy food_plan_add on public.food_plan for insert to authenticated with check (family_id = (select public.my_family_id()));
create policy food_plan_change on public.food_plan for update to authenticated
  using (family_id = (select public.my_family_id())) with check (family_id = (select public.my_family_id()));
create policy food_plan_remove on public.food_plan for delete to authenticated
  using (family_id = (select public.my_family_id()) and (public.is_family_adult(family_id)
    or (created_by = (select public.my_member_id()) and status = 'requested')));

create policy food_lunches_read on public.food_lunches for select to authenticated using (family_id = (select public.my_family_id()));
create policy food_lunches_add on public.food_lunches for insert to authenticated
  with check (family_id = (select public.my_family_id()) and (public.is_family_adult(family_id) or member_id = (select public.my_member_id())));
create policy food_lunches_change on public.food_lunches for update to authenticated
  using (family_id = (select public.my_family_id()) and (public.is_family_adult(family_id) or member_id = (select public.my_member_id())))
  with check (family_id = (select public.my_family_id()) and (public.is_family_adult(family_id) or member_id = (select public.my_member_id())));
create policy food_lunches_remove on public.food_lunches for delete to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));

-- shopping: everyone adds and ticks; grown-ups (or whoever added it) change and remove
create policy food_lists_read on public.food_lists for select to authenticated using (family_id = (select public.my_family_id()));
create policy food_lists_add on public.food_lists for insert to authenticated with check (family_id = (select public.my_family_id()));
create policy food_lists_change on public.food_lists for update to authenticated
  using (family_id = (select public.my_family_id()) and (public.is_family_adult(family_id) or created_by = (select public.my_member_id())))
  with check (family_id = (select public.my_family_id()));

create policy food_aisles_read on public.food_aisles for select to authenticated using (family_id = (select public.my_family_id()));
create policy food_aisles_add on public.food_aisles for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy food_aisles_change on public.food_aisles for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id))
  with check (family_id = (select public.my_family_id()));
create policy food_aisles_remove on public.food_aisles for delete to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));

create policy food_known_items_read on public.food_known_items for select to authenticated using (family_id = (select public.my_family_id()));
create policy food_known_items_change on public.food_known_items for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id))
  with check (family_id = (select public.my_family_id()));

create policy food_list_items_read on public.food_list_items for select to authenticated using (family_id = (select public.my_family_id()));
create policy food_list_items_add on public.food_list_items for insert to authenticated with check (family_id = (select public.my_family_id()));
create policy food_list_items_change on public.food_list_items for update to authenticated
  using (family_id = (select public.my_family_id())) with check (family_id = (select public.my_family_id()));
create policy food_list_items_remove on public.food_list_items for delete to authenticated
  using (family_id = (select public.my_family_id()) and (public.is_family_adult(family_id) or added_by = (select public.my_member_id())));

create policy food_stock_read on public.food_stock for select to authenticated using (family_id = (select public.my_family_id()));
create policy food_stock_add on public.food_stock for insert to authenticated with check (family_id = (select public.my_family_id()));
create policy food_stock_change on public.food_stock for update to authenticated
  using (family_id = (select public.my_family_id())) with check (family_id = (select public.my_family_id()));
create policy food_stock_remove on public.food_stock for delete to authenticated
  using (family_id = (select public.my_family_id()) and (public.is_family_adult(family_id) or added_by = (select public.my_member_id())));

create policy food_takeaways_read on public.food_takeaways for select to authenticated using (family_id = (select public.my_family_id()));
create policy food_takeaways_add on public.food_takeaways for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_adult(family_id));
create policy food_takeaways_change on public.food_takeaways for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_adult(family_id))
  with check (family_id = (select public.my_family_id()));

create policy food_takeaway_orders_read on public.food_takeaway_orders for select to authenticated using (family_id = (select public.my_family_id()));
create policy food_takeaway_orders_add on public.food_takeaway_orders for insert to authenticated
  with check (family_id = (select public.my_family_id()) and (member_id = (select public.my_member_id()) or public.is_family_parent(family_id)));
create policy food_takeaway_orders_change on public.food_takeaway_orders for update to authenticated
  using (family_id = (select public.my_family_id()) and (member_id = (select public.my_member_id()) or public.is_family_parent(family_id)))
  with check (family_id = (select public.my_family_id()));
create policy food_takeaway_orders_remove on public.food_takeaway_orders for delete to authenticated
  using (family_id = (select public.my_family_id()) and (member_id = (select public.my_member_id()) or public.is_family_parent(family_id)));

-- money: parents only
create policy food_spend_read on public.food_spend for select to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy food_spend_add on public.food_spend for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));
create policy food_spend_change on public.food_spend for update to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id))
  with check (family_id = (select public.my_family_id()));
create policy food_spend_remove on public.food_spend for delete to authenticated
  using (family_id = (select public.my_family_id()) and public.is_family_parent(family_id));

-- ---------------------------------------------------------------- grants (exactly what the app needs)

grant select on public.food_settings, public.food_avoid, public.food_collections, public.food_recipes, public.food_ratings,
  public.food_plan, public.food_lunches, public.food_lists, public.food_aisles, public.food_known_items,
  public.food_list_items, public.food_stock, public.food_takeaways, public.food_takeaway_orders, public.food_spend,
  public.food_diary to authenticated;

grant insert (member_id, family_id, calories_on, kcal_target) on public.food_settings to authenticated;
grant update (calories_on, kcal_target) on public.food_settings to authenticated;
grant insert (family_id, member_id, day, slot, label, kcal, protein, carbs, fat) on public.food_diary to authenticated;
grant update (day, slot, label, kcal, protein, carbs, fat) on public.food_diary to authenticated;
grant delete on public.food_diary to authenticated;

grant insert (family_id, member_id, kind, label) on public.food_avoid to authenticated;
grant delete on public.food_avoid to authenticated;

grant insert (family_id, title, emoji, position) on public.food_collections to authenticated;
grant update (title, emoji, position) on public.food_collections to authenticated;
grant delete on public.food_collections to authenticated;

grant insert (family_id, title, description, photo_path, source_url, servings, prep_min, cook_min, ingredients, steps, tags,
  allergens, collections, nutrition, notes, timeline) on public.food_recipes to authenticated;
grant update (title, description, photo_path, source_url, servings, prep_min, cook_min, ingredients, steps, tags, allergens,
  collections, nutrition, notes, timeline, times_made, last_made, archived_at) on public.food_recipes to authenticated;

grant insert (recipe_id, member_id, family_id, value, note) on public.food_ratings to authenticated;
grant update (value, note) on public.food_ratings to authenticated;
grant delete on public.food_ratings to authenticated;

grant insert (family_id, day, slot, recipe_id, title, servings, people, cook, leftover_of, takeaway_id, notes, position, status)
  on public.food_plan to authenticated;
grant update (day, slot, recipe_id, title, servings, people, cook, leftover_of, takeaway_id, notes, position, status, cal_event_id)
  on public.food_plan to authenticated;
grant delete on public.food_plan to authenticated;

grant insert (family_id, member_id, day, items, packed, notes) on public.food_lunches to authenticated;
grant update (items, packed, notes) on public.food_lunches to authenticated;
grant delete on public.food_lunches to authenticated;

grant insert (family_id, title, emoji, position) on public.food_lists to authenticated;
grant update (title, emoji, position, archived_at) on public.food_lists to authenticated;
grant insert (family_id, name, position) on public.food_aisles to authenticated;
grant update (name, position) on public.food_aisles to authenticated;
grant delete on public.food_aisles to authenticated;
grant update (aisle, unit, favourite) on public.food_known_items to authenticated;
grant insert (list_id, family_id, name, quantity, unit, note, aisle, photo_path, assignee, recipe_ids, position)
  on public.food_list_items to authenticated;
grant update (name, quantity, unit, note, aisle, photo_path, assignee, position, done_at) on public.food_list_items to authenticated;
grant delete on public.food_list_items to authenticated;

grant insert (family_id, name, place, quantity, unit, portions, use_by, low_at, barcode, from_recipe, nutrition)
  on public.food_stock to authenticated;
grant update (name, place, quantity, unit, portions, use_by, low_at, nutrition, used_up_at) on public.food_stock to authenticated;
grant delete on public.food_stock to authenticated;

grant insert (family_id, name, phone, link, notes) on public.food_takeaways to authenticated;
grant update (name, phone, link, notes, last_ordered, archived_at) on public.food_takeaways to authenticated;
grant insert (takeaway_id, family_id, member_id, order_text) on public.food_takeaway_orders to authenticated;
grant update (order_text) on public.food_takeaway_orders to authenticated;
grant delete on public.food_takeaway_orders to authenticated;

grant insert (family_id, spent_on, amount, store, note) on public.food_spend to authenticated;
grant update (spent_on, amount, store, note) on public.food_spend to authenticated;
grant delete on public.food_spend to authenticated;
