-- Luex Life Household Money access test. Creates throwaway families, tries to break every Board rule, then rolls
-- itself back (it always ends with an error carrying the report). Run after ANY change to Money access:
--   all passed  -> error text starts "REPORT: ALL n CHECKS PASSED"
create temp table t_results (passed boolean, msg text) on commit drop;
grant all on t_results to public;

create function pg_temp.act(u uuid, em text) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'email', em, 'role', 'authenticated')::text end, true);
  if u is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $$;
create function pg_temp.chk(ok boolean, msg text) returns void language sql as $$
  insert into t_results values (coalesce(ok, false), msg)
$$;
create function pg_temp.sys() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
grant execute on function pg_temp.act(uuid, text), pg_temp.chk(boolean, text), pg_temp.sys() to public;

do $$
declare
  ua uuid := gen_random_uuid(); up uuid := gen_random_uuid(); ug uuid := gen_random_uuid();
  uk uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  fa uuid; fb uuid; ann uuid; pat uuid; gran uuid; kid uuid; ben uuid;
  cat uuid; acc uuid; mine uuid; bill uuid; pbill uuid; pay uuid; ppay uuid; pot uuid; ppot uuid; x uuid; tok text; n int; t text; d date;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'ann@test.dev', 'authenticated', 'authenticated'), (up, 'pat@test.dev', 'authenticated', 'authenticated'),
    (ug, 'gran@test.dev', 'authenticated', 'authenticated'), (uk, 'kid@test.dev', 'authenticated', 'authenticated'),
    (ub, 'ben@test.dev', 'authenticated', 'authenticated');
  perform pg_temp.act(ub, 'ben@test.dev'); fb := public.create_family('Beta', 'Ben'); ben := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); fa := public.create_family('Alpha', 'Ann'); ann := public.my_member_id();
  tok := public.create_invite(fa, 'pat@test.dev', 'parent', 'Pat');
  perform pg_temp.act(up, 'pat@test.dev'); perform public.accept_invite(tok); pat := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'gran@test.dev', 'member', 'Gran');
  perform pg_temp.act(ug, 'gran@test.dev'); perform public.accept_invite(tok); gran := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'kid@test.dev', 'child', 'Kid');
  perform pg_temp.act(uk, 'kid@test.dev'); perform public.accept_invite(tok); kid := public.my_member_id();

  -- ===== set-up
  perform pg_temp.act(ua, 'ann@test.dev');
  perform public.money_setup();
  perform pg_temp.chk((select count(*) from public.money_categories where family_id = fa) >= 20, 'everyday categories are ready on day one');
  select id into cat from public.money_categories where family_id = fa and name = 'Energy and water';
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    perform public.money_setup();
    perform pg_temp.chk(false, 'a grown-up who is not a parent set up Money');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.chk(not exists (select 1 from public.money_categories), 'a grown-up who is not a parent sees Money');
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.money_categories), 'a child sees Money');
  begin
    insert into public.money_payments (family_id, amount, amount_gbp) values (fa, 5, 5);
    perform pg_temp.chk(false, 'a child added a payment');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== shared things: both parents
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.money_accounts (family_id, name, kind) values (fa, 'Joint account', 'joint') returning id into acc;
  insert into public.money_bills (family_id, name, amount, every, next_due, account_id, category_id) values (fa, 'Electricity', 95, 'month', current_date + 1, acc, cat) returning id into bill;
  insert into public.money_payments (family_id, account_id, category_id, amount, amount_gbp, payee, paid_by) values (fa, acc, cat, 40, 1, 'Water', pat) returning id into pay;
  perform pg_temp.chk((select amount_gbp from public.money_payments where id = pay) = 40, 'pounds are worked out for pound payments');
  perform pg_temp.chk((select created_by from public.money_payments where id = pay) = ann, 'payments record who added them');
  perform pg_temp.act(up, 'pat@test.dev');
  perform pg_temp.chk(exists (select 1 from public.money_payments where id = pay), 'the other parent sees shared payments');
  perform pg_temp.chk(exists (select 1 from public.money_bills where id = bill), 'the other parent sees shared bills');

  -- ===== "just mine"
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.money_accounts (family_id, name, private_to) values (fa, 'My account', ann) returning id into mine;
  insert into public.money_payments (family_id, account_id, amount, amount_gbp, payee) values (fa, mine, 120, 120, 'Surprise present') returning id into ppay;
  perform pg_temp.chk((select private_to from public.money_payments where id = ppay) = ann, 'a payment on a private account is private too');
  insert into public.money_bills (family_id, name, amount, next_due, private_to) values (fa, 'Gym', 30, current_date + 2, ann) returning id into pbill;
  insert into public.money_pots (family_id, name, private_to) values (fa, 'Secret fund', ann) returning id into ppot;
  insert into public.money_pot_moves (pot_id, family_id, amount) values (ppot, fa, 50);
  perform pg_temp.chk((select private_to from public.money_pot_moves where pot_id = ppot) = ann, 'moves into a private pot are private');
  perform pg_temp.act(up, 'pat@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.money_accounts where id = mine), 'the other parent sees a private account');
  perform pg_temp.chk(not exists (select 1 from public.money_payments where id = ppay), 'the other parent sees a private payment');
  perform pg_temp.chk(not exists (select 1 from public.money_bills where id = pbill), 'the other parent sees a private bill');
  perform pg_temp.chk(not exists (select 1 from public.money_pot_moves where pot_id = ppot), 'the other parent sees money in a private pot');
  update public.money_payments set note = 'seen' where id = ppay;
  get diagnostics n = row_count; perform pg_temp.chk(n = 0, 'the other parent changed a private payment');
  begin
    insert into public.money_payments (family_id, account_id, amount, amount_gbp) values (fa, mine, 1, 1);
    perform pg_temp.chk(false, 'the other parent added to a private account');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.money_payments (family_id, amount, amount_gbp, private_to) values (fa, 1, 1, ann);
    perform pg_temp.chk(false, 'a parent made something private to the other parent');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.money_payments set private_to = pat where id = pay;
    perform pg_temp.chk(false, 'a parent hid a shared payment that the other parent added');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.money_payments set account_id = mine where id = pay;
    perform pg_temp.chk(false, 'a payment was moved onto the other parent''s private account');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.money_pot_moves (pot_id, family_id, amount) values (ppot, fa, 10);
    perform pg_temp.chk(false, 'the other parent added to a private pot');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.chk(not public.money_file_ok(fa || '/money/p/' || ann || '/r.jpg'), 'the other parent opens a private receipt');
  perform pg_temp.chk(public.money_file_ok(fa || '/money/s/r.jpg'), 'a parent opens a shared receipt');
  -- making an account private hides what's on it
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.money_accounts (family_id, name) values (fa, 'Old account') returning id into x;
  insert into public.money_payments (family_id, account_id, amount, amount_gbp, payee) values (fa, x, 9, 9, 'Old thing');
  update public.money_accounts set private_to = ann where id = x;
  perform pg_temp.act(up, 'pat@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.money_payments where payee = 'Old thing'), 'payments stay visible after their account was made private');
  -- the other parent can't make someone else's shared account private
  begin
    update public.money_accounts set private_to = pat where id = acc;
    perform pg_temp.chk(false, 'a parent hid the joint account');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== bills move on when paid; price rises are flagged
  perform pg_temp.act(up, 'pat@test.dev');
  d := (select next_due from public.money_bills where id = bill);
  insert into public.money_payments (family_id, bill_id, category_id, amount, amount_gbp, payee) values (fa, bill, cat, 110, 110, 'Electricity');
  perform pg_temp.chk((select next_due from public.money_bills where id = bill) = (d + interval '1 month')::date, 'paying a bill moves its due date on');
  perform pg_temp.chk((select amount = 110 and previous_amount = 95 from public.money_bills where id = bill), 'a new amount is remembered');
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'money' and title like 'Price rise%' and member_id in (ann, pat)) = 2, 'both parents hear about a price rise');
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'money' and member_id in (gran, kid)) = 0, 'money alerts reach someone who isn''t a parent');

  -- ===== the daily reminders respect "just mine"
  perform pg_temp.sys();
  update public.families set timezone = 'Pacific/Kiritimati' where id = fa;
  update public.money_bills set next_due = (now() at time zone 'Pacific/Kiritimati')::date + 1 where id in (pbill);
  if (now() at time zone 'Pacific/Kiritimati')::time >= '08:00' then
    n := public.queue_money_alerts();
    perform pg_temp.chk((select count(*) from public.notifications where title like '%Gym%' and member_id = ann) = 1, 'a private bill reminds its owner');
    perform pg_temp.chk((select count(*) from public.notifications where title like '%Gym%' and member_id = pat) = 0, 'a private bill reminds the other parent');
    n := public.queue_money_alerts();
    perform pg_temp.chk((select count(*) from public.notifications where title like '%Gym%' and member_id = ann) = 1, 'bill reminders only once');
  end if;
  -- direct debits record themselves
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.money_bills (family_id, name, amount, next_due, auto_record) values (fa, 'Council tax', 150, (now() at time zone 'Pacific/Kiritimati')::date, true) returning id into x;
  perform pg_temp.sys();
  if (now() at time zone 'Pacific/Kiritimati')::time >= '08:00' then
    n := public.queue_money_alerts();
    perform pg_temp.chk((select count(*) from public.money_payments where bill_id = x and source = 'bill') = 1, 'a direct debit records itself');
    perform pg_temp.chk((select next_due from public.money_bills where id = x) > (now() at time zone 'Pacific/Kiritimati')::date, 'a direct debit moves on');
  end if;

  -- ===== Food's shop totals flow in
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.food_spend (family_id, amount, store) values (fa, 84.20, 'Tesco') returning id into x;
  perform pg_temp.chk((select amount from public.money_payments where food_spend_id = x) = 84.20, 'a food shop appears in Money');
  update public.food_spend set amount = 90 where id = x;
  perform pg_temp.chk((select amount from public.money_payments where food_spend_id = x) = 90, 'a changed food shop updates Money');
  begin
    update public.money_payments set amount = 1 where food_spend_id = x;
    perform pg_temp.chk(false, 'a food shop was changed in Money instead of Food');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.money_payments (family_id, amount, amount_gbp, source) values (fa, 1, 1, 'bill');
    perform pg_temp.chk(false, 'a payment pretended to come from a bill');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== imports never save the same line twice
  insert into public.money_payments (family_id, amount, amount_gbp, payee, source, import_key) values (fa, 12, 12, 'Netflix', 'import', 'k1');
  begin
    insert into public.money_payments (family_id, amount, amount_gbp, payee, source, import_key) values (fa, 12, 12, 'Netflix', 'import', 'k1');
    perform pg_temp.chk(false, 'an imported line was saved twice');
  exception when unique_violation then perform pg_temp.chk(true, ''); end;

  -- ===== receipts
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into storage.objects (bucket_id, name, owner) values ('money-files', fa || '/money/s/receipt.jpg', ua);
  insert into storage.objects (bucket_id, name, owner) values ('money-files', fa || '/money/p/' || ann || '/mine.jpg', ua);
  perform pg_temp.chk(true, '');
  perform pg_temp.act(up, 'pat@test.dev');
  perform pg_temp.chk(exists (select 1 from storage.objects where name = fa || '/money/s/receipt.jpg'), 'the other parent opens a shared receipt');
  perform pg_temp.chk(not exists (select 1 from storage.objects where name like '%/mine.jpg'), 'the other parent sees a private receipt');
  begin
    insert into storage.objects (bucket_id, name, owner) values ('money-files', fa || '/money/p/' || ann || '/x.jpg', up);
    perform pg_temp.chk(false, 'a parent saved a receipt into the other parent''s private folder');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    insert into storage.objects (bucket_id, name, owner) values ('money-files', fa || '/money/s/g.jpg', ug);
    perform pg_temp.chk(false, 'a grown-up who is not a parent saved a receipt');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== review fixes: privacy can't be taken over
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.money_accounts (family_id, name) values (fa, 'Shared card') returning id into x;
  perform pg_temp.act(up, 'pat@test.dev');
  insert into public.money_payments (family_id, account_id, amount, amount_gbp, payee, private_to) values (fa, x, 7, 7, 'PAT SECRET', pat);
  insert into public.money_payments (family_id, account_id, amount, amount_gbp, payee) values (fa, x, 8, 8, 'Pat shared') returning id into pay;
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    update public.money_accounts set private_to = ann where id = x;
    perform pg_temp.chk(false, 'making an account private took over the other parent''s things on it');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.chk(not exists (select 1 from public.money_payments where payee = 'PAT SECRET'), 'one parent reads the other''s private payment');
  begin
    update public.money_payments set account_id = mine where id = pay;
    perform pg_temp.chk(false, 'moving the other parent''s payment onto a private account hid it');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.money_bills set account_id = mine where id = bill;
    perform pg_temp.chk(false, 'moving a shared bill someone else added onto a private account hid it');
  exception when others then perform pg_temp.chk(true, ''); end;
  -- a private payment on a shared bill keeps its amount to itself
  d := (select next_due from public.money_bills where id = bill);
  insert into public.money_payments (family_id, account_id, bill_id, amount, amount_gbp, payee, on_date) values (fa, mine, bill, 63.21, 63.21, 'Electricity', d);
  perform pg_temp.chk((select amount from public.money_bills where id = bill) = 110, 'a private payment changed a shared bill''s amount');
  perform pg_temp.chk((select next_due from public.money_bills where id = bill) > d, 'a private payment still moves a shared bill on');
  perform pg_temp.sys();
  perform pg_temp.chk(not exists (select 1 from public.notifications where body like '%63.21%'), 'a private payment set off a price-rise alert');
  -- food shops stay shared
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.food_spend (family_id, amount, store) values (fa, 20, 'Aldi') returning id into x;
  begin
    update public.money_payments set private_to = ann where food_spend_id = x;
    perform pg_temp.chk(false, 'a food shop was made private');
  exception when others then perform pg_temp.chk(true, ''); end;
  -- a clash on an imported line never reveals a private one
  insert into public.money_payments (family_id, account_id, amount, amount_gbp, payee, source, import_key) values (fa, mine, 85, 85, 'Pandora', 'import', 'guess');
  perform pg_temp.act(up, 'pat@test.dev');
  begin
    insert into public.money_payments (family_id, amount, amount_gbp, payee, source, import_key) values (fa, 85, 85, 'Pandora', 'import', 'guess');
    perform pg_temp.chk(true, '');
  exception when unique_violation then perform pg_temp.chk(false, 'a duplicate check revealed a private payment'); end;
  -- receipts block a change between private and shared
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.money_pots (family_id, name) values (fa, 'Holiday') returning id into pot;
  insert into public.money_payments (family_id, pot_id, amount, amount_gbp, receipt_path) values (fa, pot, 5, 5, fa || '/money/s/hol.jpg');
  begin
    update public.money_pots set private_to = ann where id = pot;
    perform pg_temp.chk(false, 'a shared receipt stayed readable after its payment went private');
  exception when others then perform pg_temp.chk(true, ''); end;
  -- pay periods are for parents in the family
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    perform public.money_period_start(fa, current_date);
    perform pg_temp.chk(false, 'a child read the family''s payday');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ub, 'ben@test.dev');
  begin
    perform public.money_period_start(fa, current_date);
    perform pg_temp.chk(false, 'another family read our payday');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== other families and visitors
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.money_payments where family_id = fa), 'another family sees our payments');
  perform pg_temp.chk(not public.money_file_ok(fa || '/money/s/r.jpg'), 'another family opens our receipts');
  begin
    insert into public.money_payments (family_id, amount, amount_gbp) values (fa, 1, 1);
    perform pg_temp.chk(false, 'another family added a payment');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    perform public.money_setup();
    insert into public.money_payments (family_id, category_id, amount, amount_gbp) values (fb, cat, 1, 1);
    perform pg_temp.chk(false, 'a payment used another family''s category');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(null, null);
  begin
    select count(*) into n from public.money_payments;
    perform pg_temp.chk(n = 0, 'a signed-out visitor reads payments');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== pay periods
  perform pg_temp.sys();
  insert into public.money_settings (family_id, period, payday_day) values (fb, 'payday', 31) on conflict (family_id) do update set period = 'payday', payday_day = 31;
  perform pg_temp.chk(public.money_period_start(fb, '2026-03-15') = '2026-02-28', 'payday on the 31st falls back to the month''s last day');
  perform pg_temp.chk(public.money_period_start(fb, '2026-03-31') = '2026-03-31', 'the period starts on payday');

  perform pg_temp.sys();
  select count(*) filter (where passed), string_agg(case when not passed then E'\nFAIL: ' || msg end, '')
    into n, t from t_results;
  if (select count(*) from t_results where not passed) = 0 then
    raise exception 'REPORT: ALL % CHECKS PASSED', n;
  else
    raise exception 'REPORT: % passed, % FAILED%', n, (select count(*) from t_results where not passed), t;
  end if;
end $$;
