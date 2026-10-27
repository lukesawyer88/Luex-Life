-- Household Money, part 2 of 3 (guards, bills, alerts, food link, files). See part 1 for the rules.

-- ---------------------------------------------------------------- helpers

-- the parents who may see a row (shared: every parent; "just mine": only that parent)
create or replace function public.money_viewers(f uuid, priv uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select id from public.family_members
  where family_id = f and role = 'parent' and archived_at is null and user_id is not null and (priv is null or id = priv)
$$;

-- the next due date after d
create or replace function public.money_next_due(d date, every text)
returns date language sql immutable set search_path = '' as $$
  select case every
    when 'week' then d + 7
    when 'four_weeks' then d + 28
    when 'month' then (d + interval '1 month')::date
    when 'quarter' then (d + interval '3 months')::date
    else (d + interval '1 year')::date end
$$;

-- the start of the budget period containing d
create or replace function public.money_period_start(f uuid, d date)
returns date language plpgsql stable security definer set search_path = '' as $$
declare s public.money_settings%rowtype; cand date; last_day integer;
begin
  select * into s from public.money_settings where family_id = f;
  if not found or s.period = 'month' then return date_trunc('month', d)::date; end if;
  if s.four_weekly_anchor is not null then
    return s.four_weekly_anchor + (floor((d - s.four_weekly_anchor) / 28.0)::integer * 28);
  end if;
  -- payday on a day of the month (moved back to the month's last day when shorter)
  last_day := extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::integer;
  cand := date_trunc('month', d)::date + (least(s.payday_day, last_day) - 1);
  if cand <= d then return cand; end if;
  last_day := extract(day from (date_trunc('month', d) - interval '1 day'))::integer;
  return (date_trunc('month', d) - interval '1 month')::date + (least(s.payday_day, last_day) - 1);
end $$;

revoke all on function public.money_viewers(uuid, uuid) from public, anon, authenticated;
revoke all on function public.money_next_due(date, text), public.money_period_start(uuid, date) from public, anon;
grant execute on function public.money_next_due(date, text), public.money_period_start(uuid, date) to authenticated;

create or replace function public.money_sys() returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('luex.moneysys', true), 'off') = 'on' and pg_trigger_depth() > 0
$$;
revoke all on function public.money_sys() from public, anon, authenticated;

-- a linked row's "just mine" must be visible to me; returns it (null = shared)
create or replace function public.money_link_private(tbl text, link uuid, f uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare p uuid; fam uuid;
begin
  if link is null then return null; end if;
  execute format('select private_to, family_id from public.%I where id = $1', tbl) into p, fam using link;
  if fam is null or fam <> f then raise exception 'That change is not allowed'; end if;
  if p is not null and p is distinct from public.my_member_id() then raise exception 'That change is not allowed'; end if;
  return p;
end $$;
revoke all on function public.money_link_private(text, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- the guard

create or replace function public.stamp_money_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); linked uuid; j jsonb := to_jsonb(new); o jsonb;
begin
  if (select auth.uid()) is null or public.money_sys() then return new; end if;
  if new.family_id is distinct from public.my_family_id() or not public.is_family_parent(new.family_id) then
    raise exception 'That change is not allowed';
  end if;
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    if new.family_id <> old.family_id then raise exception 'That change is not allowed'; end if;
  end if;

  -- who made it
  if j ? 'created_by' then
    if tg_op = 'INSERT' then new := jsonb_populate_record(new, jsonb_build_object('created_by', me, 'created_at', now()));
    elsif (j ->> 'created_by') is distinct from (o ->> 'created_by') then raise exception 'That change is not allowed'; end if;
  end if;

  -- "just mine": only ever private to me; only the person who made a shared thing can make it private
  if j ? 'private_to' then
    if (j ->> 'private_to') is not null and (j ->> 'private_to')::uuid is distinct from me then
      raise exception 'You can only keep things private to yourself';
    end if;
    if tg_op = 'UPDATE' and (o ->> 'private_to') is null and (j ->> 'private_to') is not null
       and (o ->> 'created_by') is distinct from me::text then
      raise exception 'Only the person who added this can make it private';
    end if;
  end if;

  case tg_table_name
    when 'money_accounts' then
      if new.owner is not null and not public.members_in_family(new.family_id, array[new.owner]) then raise exception 'That person is not in this family'; end if;

    when 'money_bills' then
      linked := coalesce(public.money_link_private('money_accounts', new.account_id, new.family_id), new.private_to);
      new.private_to := linked;
      if new.category_id is not null and not exists (select 1 from public.money_categories where id = new.category_id and family_id = new.family_id) then
        raise exception 'That change is not allowed';
      end if;
      if tg_op = 'UPDATE' and new.amount <> old.amount then
        new.previous_amount := old.amount; new.amount_changed_on := current_date;
      end if;

    when 'money_pot_moves' then
      new.private_to := public.money_link_private('money_pots', new.pot_id, new.family_id);
      if new.pot_id is null then raise exception 'That change is not allowed'; end if;

    when 'money_holding_values' then
      new.private_to := public.money_link_private('money_holdings', new.holding_id, new.family_id);
      if tg_op = 'UPDATE' and new.holding_id <> old.holding_id then raise exception 'That change is not allowed'; end if;

    when 'money_holdings' then
      if new.owner is not null and not public.members_in_family(new.family_id, array[new.owner]) then raise exception 'That person is not in this family'; end if;

    when 'money_credit_scores' then
      if not public.members_in_family(new.family_id, array[new.member_id]) then raise exception 'That person is not in this family'; end if;

    when 'money_budgets' then
      if not exists (select 1 from public.money_categories where id = new.category_id and family_id = new.family_id) then
        raise exception 'That change is not allowed';
      end if;

    when 'money_gift_budgets' then
      if new.person is not null and not public.members_in_family(new.family_id, array[new.person]) then raise exception 'That person is not in this family'; end if;

    when 'money_payee_rules' then
      new.match := lower(btrim(new.match));
      if not exists (select 1 from public.money_categories where id = new.category_id and family_id = new.family_id) then
        raise exception 'That change is not allowed';
      end if;

    when 'money_payments' then
      if tg_op = 'INSERT' then
        new.deleted_at := null;
        if new.source not in ('manual', 'import') then raise exception 'That change is not allowed'; end if;
        if new.source = 'import' and new.import_key is null then raise exception 'That change is not allowed'; end if;
      else
        if new.source <> old.source or new.import_key is distinct from old.import_key or new.food_spend_id is distinct from old.food_spend_id then
          raise exception 'That change is not allowed';
        end if;
        if old.food_spend_id is not null and (new.amount <> old.amount or new.on_date <> old.on_date) then
          raise exception 'Change this in Food''s budget';
        end if;
        if new.deleted_at is not null and old.deleted_at is null then new.deleted_at := now(); end if;
      end if;
      -- anything on a private account, bill or pot is private too (and must be mine)
      new.private_to := coalesce(public.money_link_private('money_accounts', new.account_id, new.family_id),
        public.money_link_private('money_bills', new.bill_id, new.family_id),
        public.money_link_private('money_pots', new.pot_id, new.family_id), new.private_to);
      if new.category_id is not null and not exists (select 1 from public.money_categories where id = new.category_id and family_id = new.family_id) then
        raise exception 'That change is not allowed';
      end if;
      if new.gift_budget_id is not null and not exists (select 1 from public.money_gift_budgets where id = new.gift_budget_id and family_id = new.family_id) then
        raise exception 'That change is not allowed';
      end if;
      if not public.members_in_family(new.family_id, array_remove(array[new.paid_by, new.child_id], null)) then
        raise exception 'Those people are not in this family';
      end if;
      if new.currency = 'GBP' then new.amount_gbp := new.amount; end if;
      if new.receipt_path is not null then
        linked := null;
        if new.private_to is null then
          if new.receipt_path not like new.family_id::text || '/money/s/%' then raise exception 'That change is not allowed'; end if;
        elsif new.receipt_path not like new.family_id::text || '/money/p/' || new.private_to::text || '/%' then
          raise exception 'That change is not allowed';
        end if;
      end if;

    else null;
  end case;
  return new;
end $$;
revoke all on function public.stamp_money_row() from public, anon, authenticated;

create trigger money_settings_stamp before insert or update on public.money_settings for each row execute function public.stamp_money_row();
create trigger money_accounts_stamp before insert or update on public.money_accounts for each row execute function public.stamp_money_row();
create trigger money_categories_stamp before insert or update on public.money_categories for each row execute function public.stamp_money_row();
create trigger money_budgets_stamp before insert or update on public.money_budgets for each row execute function public.stamp_money_row();
create trigger money_bills_stamp before insert or update on public.money_bills for each row execute function public.stamp_money_row();
create trigger money_pots_stamp before insert or update on public.money_pots for each row execute function public.stamp_money_row();
create trigger money_pot_moves_stamp before insert on public.money_pot_moves for each row execute function public.stamp_money_row();
create trigger money_gift_budgets_stamp before insert or update on public.money_gift_budgets for each row execute function public.stamp_money_row();
create trigger money_payments_stamp before insert or update on public.money_payments for each row execute function public.stamp_money_row();
create trigger money_payee_rules_stamp before insert or update on public.money_payee_rules for each row execute function public.stamp_money_row();
create trigger money_import_profiles_stamp before insert or update on public.money_import_profiles for each row execute function public.stamp_money_row();
create trigger money_debts_stamp before insert or update on public.money_debts for each row execute function public.stamp_money_row();
create trigger money_holdings_stamp before insert or update on public.money_holdings for each row execute function public.stamp_money_row();
create trigger money_holding_values_stamp before insert or update on public.money_holding_values for each row execute function public.stamp_money_row();
create trigger money_credit_scores_stamp before insert on public.money_credit_scores for each row execute function public.stamp_money_row();

-- ---------------------------------------------------------------- privacy follows the parent thing

-- an account, pot or holding made private (or shared again): everything on it follows
create or replace function public.after_money_private()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.private_to is not distinct from old.private_to then return null; end if;
  perform set_config('luex.moneysys', 'on', true);
  if tg_table_name = 'money_accounts' then
    update public.money_payments set private_to = new.private_to where account_id = new.id;
    update public.money_bills set private_to = new.private_to where account_id = new.id;
  elsif tg_table_name = 'money_pots' then
    update public.money_pot_moves set private_to = new.private_to where pot_id = new.id;
    update public.money_payments set private_to = new.private_to where pot_id = new.id and account_id is null;
  elsif tg_table_name = 'money_holdings' then
    update public.money_holding_values set private_to = new.private_to where holding_id = new.id;
  elsif tg_table_name = 'money_bills' then
    update public.money_payments set private_to = new.private_to where bill_id = new.id and account_id is null;
  end if;
  perform set_config('luex.moneysys', 'off', true);
  return null;
end $$;
revoke all on function public.after_money_private() from public, anon, authenticated;
create trigger money_accounts_private after update of private_to on public.money_accounts for each row execute function public.after_money_private();
create trigger money_pots_private after update of private_to on public.money_pots for each row execute function public.after_money_private();
create trigger money_holdings_private after update of private_to on public.money_holdings for each row execute function public.after_money_private();
create trigger money_bills_private after update of private_to on public.money_bills for each row execute function public.after_money_private();

-- ---------------------------------------------------------------- paying a bill moves it on; price rises are flagged

create or replace function public.after_money_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare b public.money_bills%rowtype; v uuid;
begin
  if new.bill_id is null or new.deleted_at is not null then return null; end if;
  select * into b from public.money_bills where id = new.bill_id;
  if not found then return null; end if;
  perform set_config('luex.moneysys', 'on', true);
  -- the payment counts for this bill's due date when it's within 10 days of it
  if new.on_date >= b.next_due - 10 then
    update public.money_bills set next_due = public.money_next_due(b.next_due, b.every) where id = b.id;
  end if;
  if new.currency = b.currency and abs(new.amount - b.amount) >= 0.01 then
    update public.money_bills set previous_amount = b.amount, amount = new.amount, amount_changed_on = new.on_date where id = b.id;
    if new.amount > b.amount then
      for v in select public.money_viewers(b.family_id, b.private_to) loop
        perform public.notify(v, 'money', 'Price rise: ' || b.name,
          to_char(b.amount, 'FM£999,990.00') || ' → ' || to_char(new.amount, 'FM£999,990.00'),
          '/m/money?bill=' || b.id, null, interval '0');
      end loop;
    end if;
  end if;
  perform set_config('luex.moneysys', 'off', true);
  return null;
end $$;
revoke all on function public.after_money_payment() from public, anon, authenticated;
create trigger money_payments_after after insert on public.money_payments for each row execute function public.after_money_payment();

-- ---------------------------------------------------------------- Food's shop totals flow in

create or replace function public.after_food_spend()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cat uuid;
begin
  perform set_config('luex.moneysys', 'on', true);
  if tg_op = 'INSERT' then
    select id into cat from public.money_categories where family_id = new.family_id and name = 'Food shopping' and direction = 'out';
    insert into public.money_payments (family_id, category_id, direction, amount, currency, amount_gbp, on_date, payee, note,
        paid_by, source, food_spend_id, created_by)
      values (new.family_id, cat, 'out', new.amount, 'GBP', new.amount, new.spent_on, coalesce(new.store, 'Food shop'), new.note,
        new.added_by, 'food', new.id, new.added_by);
  else
    update public.money_payments set amount = new.amount, amount_gbp = new.amount, on_date = new.spent_on,
      payee = coalesce(new.store, 'Food shop'), note = new.note
      where food_spend_id = new.id;
  end if;
  perform set_config('luex.moneysys', 'off', true);
  return null;
end $$;
revoke all on function public.after_food_spend() from public, anon, authenticated;
create trigger food_spend_to_money after insert or update on public.food_spend for each row execute function public.after_food_spend();

-- ---------------------------------------------------------------- first visit: settings and everyday categories

create or replace function public.money_setup()
returns void language plpgsql security definer set search_path = '' as $$
declare f uuid := public.my_family_id(); x record;
begin
  if f is null or not public.is_family_parent(f) then raise exception 'That change is not allowed'; end if;
  insert into public.money_settings (family_id) values (f) on conflict do nothing;
  if exists (select 1 from public.money_categories where family_id = f) then return; end if;
  for x in select * from (values
    ('Housing', '🏠', 'out', 1), ('Energy and water', '💡', 'out', 2), ('Council tax', '🏛️', 'out', 3), ('Food shopping', '🛒', 'out', 4),
    ('Eating out and takeaways', '🍕', 'out', 5), ('Transport', '🚗', 'out', 6), ('Children', '🧒', 'out', 7), ('Clothes', '👕', 'out', 8),
    ('Health', '💊', 'out', 9), ('Phones and internet', '📱', 'out', 10), ('Subscriptions', '📺', 'out', 11), ('Insurance', '🛡️', 'out', 12),
    ('Gifts', '🎁', 'out', 13), ('Holidays', '✈️', 'out', 14), ('Fun', '🎉', 'out', 15), ('Home and garden', '🪴', 'out', 16),
    ('Pets', '🐾', 'out', 17), ('Savings', '🐷', 'out', 18), ('Other', '📦', 'out', 19),
    ('Wages', '💷', 'in', 1), ('Child benefit', '👶', 'in', 2), ('Other income', '➕', 'in', 3)
  ) as t(name, emoji, direction, pos) loop
    insert into public.money_categories (family_id, name, emoji, direction, position) values (f, x.name, x.emoji, x.direction, x.pos)
      on conflict do nothing;
  end loop;
end $$;
revoke all on function public.money_setup() from public, anon;
grant execute on function public.money_setup() to authenticated;

-- ---------------------------------------------------------------- daily reminders, direct debits, weekly summary (run by the schedule)

create or replace function public.queue_money_alerts()
returns integer language plpgsql security definer set search_path = '' as $$
declare f record; b record; v uuid; today date; n integer := 0; i integer; wk date; left_amt numeric; due_n integer; ps date;
begin
  perform set_config('luex.moneysys', 'on', true);
  for f in select id, coalesce(timezone, 'Europe/London') as tz from public.families where archived_at is null loop
    if (now() at time zone f.tz)::time < '08:00' then continue; end if;
    today := (now() at time zone f.tz)::date;

    -- direct debits record themselves on the due date
    for b in select * from public.money_bills where family_id = f.id and archived_at is null and auto_record and next_due <= today loop
      i := 0;
      while b.next_due <= today and i < 3 loop
        insert into public.money_payments (family_id, account_id, category_id, direction, amount, currency, amount_gbp, on_date, payee,
            bill_id, source, private_to)
          values (f.id, b.account_id, b.category_id, 'out', b.amount, b.currency, case when b.currency = 'GBP' then b.amount else b.amount end,
            b.next_due, b.name, b.id, 'bill', b.private_to);
        select * into b from public.money_bills where id = b.id;
        i := i + 1;
      end loop;
    end loop;

    -- bills coming up, free trials ending, contracts ending
    for b in select * from public.money_bills where family_id = f.id and archived_at is null loop
      if not b.auto_record and b.next_due between today and today + b.remind_days then
        insert into public.money_alert_sends (bill_id, kind, for_date) values (b.id, 'due', b.next_due) on conflict do nothing;
        if found then
          for v in select public.money_viewers(f.id, b.private_to) loop
            perform public.notify(v, 'money', case when b.next_due = today then 'Due today: ' else 'Due ' || to_char(b.next_due, 'FMDay') || ': ' end || b.name,
              to_char(b.amount, 'FM£999,990.00'), '/m/money?bill=' || b.id, null, interval '0');
          end loop;
          n := n + 1;
        end if;
      end if;
      if b.trial_ends is not null and b.trial_ends between today and today + 3 then
        insert into public.money_alert_sends (bill_id, kind, for_date) values (b.id, 'trial', b.trial_ends) on conflict do nothing;
        if found then
          for v in select public.money_viewers(f.id, b.private_to) loop
            perform public.notify(v, 'money', 'Free trial ending: ' || b.name, 'Ends ' || to_char(b.trial_ends, 'FMDay FMDD FMMonth') || '. Cancel before then if you don''t want it',
              '/m/money?bill=' || b.id, null, interval '0');
          end loop;
        end if;
      end if;
      if b.contract_ends is not null and b.contract_ends between today and today + 30 then
        insert into public.money_alert_sends (bill_id, kind, for_date) values (b.id, 'contract', b.contract_ends) on conflict do nothing;
        if found then
          for v in select public.money_viewers(f.id, b.private_to) loop
            perform public.notify(v, 'money', 'Contract ending: ' || b.name, 'Ends ' || to_char(b.contract_ends, 'FMDD FMMonth') || ' — time to shop around',
              '/m/money?bill=' || b.id, null, interval '0');
          end loop;
        end if;
      end if;
    end loop;

    -- Monday morning summary, per parent (counting only what that parent can see)
    if extract(isodow from today) = 1 and coalesce((select weekly_summary from public.money_settings where family_id = f.id), false) then
      wk := today;
      ps := public.money_period_start(f.id, today);
      for v in select public.money_viewers(f.id, null) loop
        insert into public.money_summary_sends (member_id, week_start) values (v, wk) on conflict do nothing;
        if not found then continue; end if;
        select coalesce((select sum(planned) from public.money_budgets bu join public.money_categories c on c.id = bu.category_id
                           where bu.family_id = f.id and bu.period_start = ps and c.direction = 'out'), 0)
             - coalesce((select sum(amount_gbp) from public.money_payments p
                           where p.family_id = f.id and p.deleted_at is null and p.in_budget and p.direction = 'out' and p.on_date >= ps
                             and (p.private_to is null or p.private_to = v)), 0)
          into left_amt;
        select count(*) into due_n from public.money_bills
          where family_id = f.id and archived_at is null and next_due between today and today + 6 and (private_to is null or private_to = v);
        perform public.notify(v, 'money', 'Your money this week',
          to_char(left_amt, 'FM£999,990.00') || ' left this month · ' || due_n || case when due_n = 1 then ' bill' else ' bills' end || ' due this week',
          '/m/money', null, interval '0');
      end loop;
    end if;
  end loop;
  perform set_config('luex.moneysys', 'off', true);
  return n;
end $$;
create or replace function public.money_tidy_sends()
returns void language sql security definer set search_path = '' as $$
  delete from public.money_alert_sends where for_date < current_date - 60
$$;
create or replace function public.money_tidy_summaries()
returns void language sql security definer set search_path = '' as $$
  delete from public.money_summary_sends where week_start < current_date - 60
$$;
revoke all on function public.queue_money_alerts(), public.money_tidy_sends(), public.money_tidy_summaries() from public, anon, authenticated;

-- ---------------------------------------------------------------- files (receipts; private bucket)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('money-files', 'money-files', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- <family>/money/s/<file>          shared: parents
-- <family>/money/p/<parent>/<file> "just mine": that parent only
create or replace function public.money_file_ok(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_name, '/');
  uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if parts[1] is null or parts[1] !~ uuid_re or parts[2] is distinct from 'money' then return false; end if;
  if parts[1]::uuid is distinct from public.my_family_id() or not public.is_family_parent(parts[1]::uuid) then return false; end if;
  if parts[3] = 's' and array_length(parts, 1) = 4 and parts[4] <> '' then return true; end if;
  if parts[3] = 'p' and array_length(parts, 1) = 5 and parts[4] = public.my_member_id()::text and parts[5] <> '' then return true; end if;
  return false;
end $$;
revoke all on function public.money_file_ok(text) from public, anon;
grant execute on function public.money_file_ok(text) to authenticated;

-- receipts count towards the family's storage allowance (the allowance functions stay private)
create or replace function public.money_can_add_file()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.my_family_id() is not null and public.food_bytes_used(public.my_family_id()) < public.board_allowance()
$$;
revoke all on function public.money_can_add_file() from public, anon;
grant execute on function public.money_can_add_file() to authenticated;

create policy money_files_read on storage.objects for select to authenticated
  using (bucket_id = 'money-files' and public.money_file_ok(name));
create policy money_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'money-files' and public.money_file_ok(name) and public.money_can_add_file());
create policy money_files_remove on storage.objects for delete to authenticated
  using (bucket_id = 'money-files' and public.money_file_ok(name));

-- ---------------------------------------------------------------- live updates (plain uuid keys only)

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.money_payments, public.money_bills, public.money_budgets, public.money_pots;
  end if;
end $$;
