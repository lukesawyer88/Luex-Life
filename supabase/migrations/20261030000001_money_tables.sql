-- Household Money, part 1 of 3 (tables and who can see what). Module 5, parents only.
-- Rules as for the rest of the app: row-level security on every table, nothing granted by default, every read
-- policy starts with "my family". On top of that: only parents ever see money, and anything marked "just mine"
-- (private_to = that parent) is invisible to the other parent too.

-- ---------------------------------------------------------------- family money settings

create table public.money_settings (
  family_id uuid primary key references public.families (id) on delete cascade,
  -- budget months run by calendar month, or payday to payday
  period text not null default 'month' check (period in ('month', 'payday')),
  payday_day integer check (payday_day between 1 and 31),
  four_weekly_anchor date,
  weekly_summary boolean not null default true,
  updated_at timestamptz not null default now(),
  check (period = 'month' or payday_day is not null or four_weekly_anchor is not null)
);

-- ---------------------------------------------------------------- accounts, categories, budgets

create table public.money_accounts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'current' check (kind in ('current', 'joint', 'savings', 'credit', 'cash', 'other')),
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  opening_balance numeric(14, 2) not null default 0 check (abs(opening_balance) < 1e11),
  owner uuid references public.family_members (id) on delete set null,
  -- "just mine": only this parent sees it (and everything on it)
  private_to uuid references public.family_members (id) on delete cascade,
  position double precision not null default 0,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check (kind <> 'joint' or private_to is null)
);

create table public.money_categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  emoji text check (char_length(emoji) <= 16),
  direction text not null default 'out' check (direction in ('out', 'in')),
  -- unspent money rolls into next month
  carry_over boolean not null default false,
  position double precision not null default 0,
  archived_at timestamptz,
  unique (family_id, name, direction)
);

create table public.money_budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  category_id uuid not null references public.money_categories (id) on delete cascade,
  -- the first day of the budget period
  period_start date not null,
  planned numeric(12, 2) not null default 0 check (planned >= 0 and planned < 1e10),
  unique (category_id, period_start)
);

-- ---------------------------------------------------------------- bills, subscriptions, pots, gifts

create table public.money_bills (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'bill' check (kind in ('bill', 'subscription')),
  amount numeric(12, 2) not null check (amount >= 0 and amount < 1e9),
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  every text not null default 'month' check (every in ('week', 'four_weeks', 'month', 'quarter', 'year')),
  next_due date not null,
  account_id uuid references public.money_accounts (id) on delete set null,
  category_id uuid references public.money_categories (id) on delete set null,
  -- words in a statement line that mean "this bill" (for imports)
  payee_match text check (char_length(payee_match) <= 60),
  trial_ends date,
  contract_ends date,
  remind_days integer not null default 2 check (remind_days between 0 and 30),
  -- direct debits: recorded automatically on the due date
  auto_record boolean not null default false,
  -- the amount before the last change (for price-rise alerts)
  previous_amount numeric(12, 2),
  amount_changed_on date,
  notes text not null default '' check (char_length(notes) <= 500),
  private_to uuid references public.family_members (id) on delete cascade,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index money_bills_family_due_idx on public.money_bills (family_id, next_due);

-- savings goals, Christmas and holiday pots, and the cash envelope
create table public.money_pots (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'goal' check (kind in ('goal', 'pot', 'cash')),
  emoji text check (char_length(emoji) <= 16),
  target numeric(12, 2) check (target > 0 and target < 1e10),
  target_date date,
  private_to uuid references public.family_members (id) on delete cascade,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.money_pot_moves (
  id uuid primary key default gen_random_uuid(),
  pot_id uuid not null references public.money_pots (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  amount numeric(12, 2) not null check (amount <> 0 and abs(amount) < 1e10),
  on_date date not null default current_date,
  note text not null default '' check (char_length(note) <= 200),
  private_to uuid references public.family_members (id) on delete cascade,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now()
);

-- gift budgets per person per occasion (linked to the Calendar's wish lists by person, occasion and year)
create table public.money_gift_budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  person uuid references public.family_members (id) on delete cascade,
  -- someone outside the family (Grandad, teacher)
  person_name text check (char_length(person_name) <= 60),
  occasion text not null check (occasion in ('birthday', 'christmas', 'other')),
  year integer not null check (year between 2000 and 2100),
  budget numeric(10, 2) not null check (budget >= 0 and budget < 1e8),
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((person is null) <> (person_name is null))
);

-- ---------------------------------------------------------------- payments (money in and out)

create table public.money_payments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  account_id uuid references public.money_accounts (id) on delete set null,
  category_id uuid references public.money_categories (id) on delete set null,
  direction text not null default 'out' check (direction in ('out', 'in')),
  amount numeric(12, 2) not null check (amount >= 0 and amount < 1e10),
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  -- the amount in pounds (worked out with that day's rate when the currency isn't GBP)
  amount_gbp numeric(12, 2) not null check (amount_gbp >= 0 and amount_gbp < 1e10),
  on_date date not null default current_date,
  payee text not null default '' check (char_length(payee) <= 120),
  note text not null default '' check (char_length(note) <= 300),
  paid_by uuid references public.family_members (id) on delete set null,
  -- "not in the budget": transfers between accounts, one-offs
  in_budget boolean not null default true,
  bill_id uuid references public.money_bills (id) on delete set null,
  pot_id uuid references public.money_pots (id) on delete set null,
  -- child costs and gifts
  child_id uuid references public.family_members (id) on delete set null,
  gift_budget_id uuid references public.money_gift_budgets (id) on delete set null,
  receipt_path text check (char_length(receipt_path) <= 300),
  source text not null default 'manual' check (source in ('manual', 'import', 'food', 'bill')),
  -- statement imports: the same line is only ever saved once
  import_key text check (char_length(import_key) <= 200),
  food_spend_id uuid unique references public.food_spend (id) on delete cascade,
  private_to uuid references public.family_members (id) on delete cascade,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (family_id, import_key)
);
create index money_payments_family_date_idx on public.money_payments (family_id, on_date desc);

-- remembered categories per payee (from imports and changes)
create table public.money_payee_rules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  match text not null check (char_length(match) between 2 and 60),
  category_id uuid not null references public.money_categories (id) on delete cascade,
  unique (family_id, match)
);

-- how each bank's statement file is laid out (remembered after the first import)
create table public.money_import_profiles (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  -- the file's header line, so the same layout is recognised next time
  signature text not null check (char_length(signature) <= 500),
  mapping jsonb not null check (jsonb_typeof(mapping) = 'object' and pg_column_size(mapping) < 2000),
  unique (family_id, signature)
);

-- ---------------------------------------------------------------- debts, investments, credit scores

create table public.money_debts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'loan' check (kind in ('loan', 'card', 'mortgage', 'car', 'other')),
  balance numeric(14, 2) not null check (balance >= 0 and balance < 1e11),
  rate numeric(6, 3) check (rate >= 0 and rate < 100),
  payment numeric(12, 2) check (payment >= 0 and payment < 1e10),
  as_of date not null default current_date,
  private_to uuid references public.family_members (id) on delete cascade,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.money_holdings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'isa' check (kind in ('isa', 'pension', 'shares', 'savings', 'other')),
  owner uuid references public.family_members (id) on delete set null,
  private_to uuid references public.family_members (id) on delete cascade,
  created_by uuid references public.family_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create table public.money_holding_values (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid not null references public.money_holdings (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  value numeric(14, 2) not null check (value >= 0 and value < 1e12),
  on_date date not null default current_date,
  private_to uuid references public.family_members (id) on delete cascade,
  unique (holding_id, on_date)
);

create table public.money_credit_scores (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  agency text not null check (char_length(agency) between 1 and 40),
  score integer not null check (score between 0 and 2000),
  on_date date not null default current_date,
  private_to uuid references public.family_members (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- weekly summaries already sent (service only)
create table public.money_summary_sends (
  member_id uuid not null references public.family_members (id) on delete cascade,
  week_start date not null,
  primary key (member_id, week_start)
);

-- reminders already sent (service only)
create table public.money_alert_sends (
  bill_id uuid not null references public.money_bills (id) on delete cascade,
  kind text not null,
  for_date date not null,
  primary key (bill_id, kind, for_date)
);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('changes', 'reminder', 'leave', 'wishlist', 'weekly', 'chore',
   'message', 'mention', 'announcement', 'location', 'prompt', 'goal', 'kudos', 'memory', 'food', 'money'));

-- ---------------------------------------------------------------- who can see money

-- a parent of my family, and the row isn't someone else's "just mine"
create or replace function public.money_ok(f uuid, priv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select f = public.my_family_id() and public.is_family_parent(f) and (priv is null or priv = public.my_member_id())
$$;
revoke all on function public.money_ok(uuid, uuid) from public, anon;
grant execute on function public.money_ok(uuid, uuid) to authenticated;

alter table public.money_settings enable row level security;
alter table public.money_accounts enable row level security;
alter table public.money_categories enable row level security;
alter table public.money_budgets enable row level security;
alter table public.money_bills enable row level security;
alter table public.money_pots enable row level security;
alter table public.money_pot_moves enable row level security;
alter table public.money_gift_budgets enable row level security;
alter table public.money_payments enable row level security;
alter table public.money_payee_rules enable row level security;
alter table public.money_import_profiles enable row level security;
alter table public.money_debts enable row level security;
alter table public.money_holdings enable row level security;
alter table public.money_holding_values enable row level security;
alter table public.money_credit_scores enable row level security;
alter table public.money_alert_sends enable row level security;
alter table public.money_summary_sends enable row level security;

revoke all on public.money_settings, public.money_accounts, public.money_categories, public.money_budgets, public.money_bills,
  public.money_pots, public.money_pot_moves, public.money_gift_budgets, public.money_payments, public.money_payee_rules,
  public.money_import_profiles, public.money_debts, public.money_holdings, public.money_holding_values,
  public.money_credit_scores, public.money_alert_sends, public.money_summary_sends
  from anon, authenticated;

-- shared tables (no "just mine"): parents of the family
create policy money_settings_read on public.money_settings for select to authenticated using (public.money_ok(family_id, null));
create policy money_settings_add on public.money_settings for insert to authenticated with check (public.money_ok(family_id, null));
create policy money_settings_change on public.money_settings for update to authenticated
  using (public.money_ok(family_id, null)) with check (public.money_ok(family_id, null));

create policy money_categories_read on public.money_categories for select to authenticated using (public.money_ok(family_id, null));
create policy money_categories_add on public.money_categories for insert to authenticated with check (public.money_ok(family_id, null));
create policy money_categories_change on public.money_categories for update to authenticated
  using (public.money_ok(family_id, null)) with check (public.money_ok(family_id, null));

create policy money_budgets_read on public.money_budgets for select to authenticated using (public.money_ok(family_id, null));
create policy money_budgets_add on public.money_budgets for insert to authenticated with check (public.money_ok(family_id, null));
create policy money_budgets_change on public.money_budgets for update to authenticated
  using (public.money_ok(family_id, null)) with check (public.money_ok(family_id, null));
create policy money_budgets_remove on public.money_budgets for delete to authenticated using (public.money_ok(family_id, null));

create policy money_gift_budgets_read on public.money_gift_budgets for select to authenticated using (public.money_ok(family_id, null));
create policy money_gift_budgets_add on public.money_gift_budgets for insert to authenticated with check (public.money_ok(family_id, null));
create policy money_gift_budgets_change on public.money_gift_budgets for update to authenticated
  using (public.money_ok(family_id, null)) with check (public.money_ok(family_id, null));
create policy money_gift_budgets_remove on public.money_gift_budgets for delete to authenticated using (public.money_ok(family_id, null));

create policy money_payee_rules_read on public.money_payee_rules for select to authenticated using (public.money_ok(family_id, null));
create policy money_payee_rules_add on public.money_payee_rules for insert to authenticated with check (public.money_ok(family_id, null));
create policy money_payee_rules_change on public.money_payee_rules for update to authenticated
  using (public.money_ok(family_id, null)) with check (public.money_ok(family_id, null));
create policy money_payee_rules_remove on public.money_payee_rules for delete to authenticated using (public.money_ok(family_id, null));

create policy money_import_profiles_read on public.money_import_profiles for select to authenticated using (public.money_ok(family_id, null));
create policy money_import_profiles_add on public.money_import_profiles for insert to authenticated with check (public.money_ok(family_id, null));
create policy money_import_profiles_change on public.money_import_profiles for update to authenticated
  using (public.money_ok(family_id, null)) with check (public.money_ok(family_id, null));

-- tables with "just mine": the same, plus private rows only for their parent
create policy money_accounts_read on public.money_accounts for select to authenticated using (public.money_ok(family_id, private_to));
create policy money_accounts_add on public.money_accounts for insert to authenticated with check (public.money_ok(family_id, private_to));
create policy money_accounts_change on public.money_accounts for update to authenticated
  using (public.money_ok(family_id, private_to)) with check (public.money_ok(family_id, private_to));

create policy money_bills_read on public.money_bills for select to authenticated using (public.money_ok(family_id, private_to));
create policy money_bills_add on public.money_bills for insert to authenticated with check (public.money_ok(family_id, private_to));
create policy money_bills_change on public.money_bills for update to authenticated
  using (public.money_ok(family_id, private_to)) with check (public.money_ok(family_id, private_to));

create policy money_pots_read on public.money_pots for select to authenticated using (public.money_ok(family_id, private_to));
create policy money_pots_add on public.money_pots for insert to authenticated with check (public.money_ok(family_id, private_to));
create policy money_pots_change on public.money_pots for update to authenticated
  using (public.money_ok(family_id, private_to)) with check (public.money_ok(family_id, private_to));

create policy money_pot_moves_read on public.money_pot_moves for select to authenticated using (public.money_ok(family_id, private_to));
create policy money_pot_moves_add on public.money_pot_moves for insert to authenticated with check (public.money_ok(family_id, private_to));
create policy money_pot_moves_remove on public.money_pot_moves for delete to authenticated using (public.money_ok(family_id, private_to));

create policy money_payments_read on public.money_payments for select to authenticated using (public.money_ok(family_id, private_to));
create policy money_payments_add on public.money_payments for insert to authenticated with check (public.money_ok(family_id, private_to));
create policy money_payments_change on public.money_payments for update to authenticated
  using (public.money_ok(family_id, private_to)) with check (public.money_ok(family_id, private_to));

create policy money_debts_read on public.money_debts for select to authenticated using (public.money_ok(family_id, private_to));
create policy money_debts_add on public.money_debts for insert to authenticated with check (public.money_ok(family_id, private_to));
create policy money_debts_change on public.money_debts for update to authenticated
  using (public.money_ok(family_id, private_to)) with check (public.money_ok(family_id, private_to));

create policy money_holdings_read on public.money_holdings for select to authenticated using (public.money_ok(family_id, private_to));
create policy money_holdings_add on public.money_holdings for insert to authenticated with check (public.money_ok(family_id, private_to));
create policy money_holdings_change on public.money_holdings for update to authenticated
  using (public.money_ok(family_id, private_to)) with check (public.money_ok(family_id, private_to));

create policy money_holding_values_read on public.money_holding_values for select to authenticated using (public.money_ok(family_id, private_to));
create policy money_holding_values_add on public.money_holding_values for insert to authenticated with check (public.money_ok(family_id, private_to));
create policy money_holding_values_change on public.money_holding_values for update to authenticated
  using (public.money_ok(family_id, private_to)) with check (public.money_ok(family_id, private_to));
create policy money_holding_values_remove on public.money_holding_values for delete to authenticated using (public.money_ok(family_id, private_to));

create policy money_credit_scores_read on public.money_credit_scores for select to authenticated using (public.money_ok(family_id, private_to));
create policy money_credit_scores_add on public.money_credit_scores for insert to authenticated with check (public.money_ok(family_id, private_to));
create policy money_credit_scores_remove on public.money_credit_scores for delete to authenticated using (public.money_ok(family_id, private_to));

-- ---------------------------------------------------------------- grants (exactly what the app needs)

grant select on public.money_settings, public.money_accounts, public.money_categories, public.money_budgets, public.money_bills,
  public.money_pots, public.money_pot_moves, public.money_gift_budgets, public.money_payments, public.money_payee_rules,
  public.money_import_profiles, public.money_debts, public.money_holdings, public.money_holding_values,
  public.money_credit_scores to authenticated;

grant insert (family_id, period, payday_day, four_weekly_anchor, weekly_summary) on public.money_settings to authenticated;
grant update (period, payday_day, four_weekly_anchor, weekly_summary) on public.money_settings to authenticated;

grant insert (family_id, name, kind, currency, opening_balance, owner, private_to, position) on public.money_accounts to authenticated;
grant update (name, kind, currency, opening_balance, owner, private_to, position, archived_at) on public.money_accounts to authenticated;

grant insert (family_id, name, emoji, direction, carry_over, position) on public.money_categories to authenticated;
grant update (name, emoji, carry_over, position, archived_at) on public.money_categories to authenticated;

grant insert (family_id, category_id, period_start, planned) on public.money_budgets to authenticated;
grant update (planned) on public.money_budgets to authenticated;
grant delete on public.money_budgets to authenticated;

grant insert (family_id, name, kind, amount, currency, every, next_due, account_id, category_id, payee_match, trial_ends,
  contract_ends, remind_days, auto_record, notes, private_to) on public.money_bills to authenticated;
grant update (name, kind, amount, currency, every, next_due, account_id, category_id, payee_match, trial_ends, contract_ends,
  remind_days, auto_record, notes, private_to, archived_at) on public.money_bills to authenticated;

grant insert (family_id, name, kind, emoji, target, target_date, private_to) on public.money_pots to authenticated;
grant update (name, emoji, target, target_date, private_to, archived_at) on public.money_pots to authenticated;
grant insert (pot_id, family_id, amount, on_date, note, private_to) on public.money_pot_moves to authenticated;
grant delete on public.money_pot_moves to authenticated;

grant insert (family_id, person, person_name, occasion, year, budget) on public.money_gift_budgets to authenticated;
grant update (budget) on public.money_gift_budgets to authenticated;
grant delete on public.money_gift_budgets to authenticated;

grant insert (family_id, account_id, category_id, direction, amount, currency, amount_gbp, on_date, payee, note, paid_by,
  in_budget, bill_id, pot_id, child_id, gift_budget_id, receipt_path, source, import_key, private_to)
  on public.money_payments to authenticated;
grant update (account_id, category_id, direction, amount, currency, amount_gbp, on_date, payee, note, paid_by, in_budget,
  bill_id, pot_id, child_id, gift_budget_id, receipt_path, private_to, deleted_at) on public.money_payments to authenticated;

grant insert (family_id, match, category_id) on public.money_payee_rules to authenticated;
grant update (category_id) on public.money_payee_rules to authenticated;
grant delete on public.money_payee_rules to authenticated;
grant insert (family_id, name, signature, mapping) on public.money_import_profiles to authenticated;
grant update (name, mapping) on public.money_import_profiles to authenticated;

grant insert (family_id, name, kind, balance, rate, payment, as_of, private_to) on public.money_debts to authenticated;
grant update (name, kind, balance, rate, payment, as_of, private_to, archived_at) on public.money_debts to authenticated;
grant insert (family_id, name, kind, owner, private_to) on public.money_holdings to authenticated;
grant update (name, kind, owner, private_to, archived_at) on public.money_holdings to authenticated;
grant insert (holding_id, family_id, value, on_date, private_to) on public.money_holding_values to authenticated;
grant update (value) on public.money_holding_values to authenticated;
grant delete on public.money_holding_values to authenticated;
grant insert (family_id, member_id, agency, score, on_date, private_to) on public.money_credit_scores to authenticated;
grant delete on public.money_credit_scores to authenticated;
