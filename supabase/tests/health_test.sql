-- Luex Life Family Health access test. Creates throwaway families, tries to break every Family Health rule, then rolls itself
-- back (it always ends with an error carrying the report). Run after ANY change to its access:
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

-- (the medicine reminder check uses a time 5 minutes ago in London, so it can fail in the first 5 minutes after midnight)

do $$
declare
  ua uuid := gen_random_uuid(); up uuid := gen_random_uuid(); ug uuid := gen_random_uuid();
  uk uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  fa uuid; fb uuid; ann uuid; pat uuid; gran uuid; kid uuid; ben uuid;
  m1 uuid; m2 uuid; c1 uuid; c2 uuid; tok text; n int; t text; hm text; today date;
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
  perform pg_temp.sys(); update public.families set timezone = 'Europe/London' where id = fa;
  today := (now() at time zone 'Europe/London')::date;
  hm := to_char((now() at time zone 'Europe/London') - interval '5 minutes', 'HH24:MI');

  -- ===== medicine (parents only)
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.health_meds (family_id, person_id, name, amount, times, start_on, end_on, remind)
    values (fa, kid, 'Calpol', '5ml', array[hm, '23:59'], today, today + 3, array[ann, pat]) returning id into m1;
  perform pg_temp.chk((select created_by from public.health_meds where id = m1) = ann, 'a parent adds a medicine reminder');
  insert into public.health_meds (family_id, person_id, name, times, start_on) values (fa, ann, 'Hay fever tablet', array['07:30'], today) returning id into m2;
  perform pg_temp.chk((select remind from public.health_meds where id = m2) = array[ann], 'with nobody picked, it reminds whoever added it');
  begin
    insert into public.health_meds (family_id, person_id, name, times, start_on, remind) values (fa, kid, 'Calpol', array['08:00'], today, array[gran]);
    perform pg_temp.chk(false, 'a reminder was sent to someone who isn''t a parent');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.health_meds (family_id, person_id, name, times, start_on) values (fa, kid, 'Calpol', array['25:00'], today);
    perform pg_temp.chk(false, 'a made-up time was saved');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.health_meds (family_id, person_id, name, times, start_on) values (fa, ben, 'Calpol', array['08:00'], today);
    perform pg_temp.chk(false, 'a reminder was set for someone in another household');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== grown-ups who aren't parents, and children, see nothing
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.health_meds), 'a grandparent sees medicine');
  begin
    insert into public.health_meds (family_id, person_id, name, times, start_on) values (fa, gran, 'Mine', array['08:00'], today);
    perform pg_temp.chk(false, 'someone who isn''t a parent added medicine');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.health_meds) and not exists (select 1 from public.health_checks), 'a child sees Health');

  -- ===== the reminder, and ticking it given
  perform pg_temp.sys();
  perform public.queue_health_reminders(); perform public.queue_health_reminders();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'health' and member_id in (ann, pat) and title = 'Medicine time for Kid') = 2, 'both parents picked are reminded once');
  perform pg_temp.chk(not exists (select 1 from public.notifications where kind = 'health' and (title || body) ~* 'calpol|5ml'), 'the medicine''s name shows on a locked phone');
  perform pg_temp.act(up, 'pat@test.dev');
  insert into public.health_doses (family_id, med_id, on_date, at_time, given_at) values (fa, m1, today, hm, '2000-01-01')
    on conflict (med_id, on_date, at_time) do update set given_at = excluded.given_at;
  perform pg_temp.chk((select given_by = pat and given_at > now() - interval '1 minute' and reminded_at is not null from public.health_doses where med_id = m1 and at_time = hm), 'a parent ticks it given (at the real time, and the reminder is kept)');
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.health_doses set given_at = now() - interval '3 hours' where med_id = m1 and at_time = hm;
  perform pg_temp.chk((select given_by from public.health_doses where med_id = m1 and at_time = hm) = pat, 'a second tick changed who gave it');
  insert into public.health_doses (family_id, med_id, on_date, at_time, given_at) values (fa, m1, today, '23:59', now());
  perform pg_temp.chk(exists (select 1 from public.health_doses where med_id = m1 and at_time = '23:59' and given_by = ann), 'a dose can be ticked before its reminder');
  perform pg_temp.sys();
  delete from public.notifications where kind = 'health';
  perform public.queue_health_reminders();
  perform pg_temp.chk(not exists (select 1 from public.notifications where kind = 'health' and title = 'Medicine time for Kid'), 'a dose already given was reminded about');
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    insert into public.health_doses (family_id, med_id, on_date, at_time, given_at) values (fa, m1, today, '12:34', now());
    perform pg_temp.chk(false, 'a dose at a time not on the list was saved');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.health_doses (family_id, med_id, on_date, at_time, given_at) values (fa, m1, today + 5, '23:59', now());
    perform pg_temp.chk(false, 'a dose after the last day was saved');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.health_meds (family_id, person_id, name, times, start_on) values (fa, kid, 'Calpol', array['08:00', null], today);
    perform pg_temp.chk(false, 'a blank time was saved');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.health_meds (family_id, person_id, name, times, start_on) values (fa, kid, 'Calpol', array['08:00', '08:00'], today);
    perform pg_temp.chk(false, 'the same time was saved twice');
  exception when others then perform pg_temp.chk(true, ''); end;
  -- a parent on the reminder leaves: it can still be changed and stopped, and they drop off it
  perform pg_temp.sys(); update public.family_members set role = 'member' where id = pat;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.health_meds set notes = 'With food' where id = m1;
  perform pg_temp.chk((select remind = array[ann] and notes = 'With food' from public.health_meds where id = m1), 'a reminder whose other parent left can still be changed');
  perform pg_temp.sys(); update public.family_members set role = 'parent' where id = pat;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.health_meds set deleted_at = now() where id = m2;
  begin
    update public.health_meds set deleted_at = null where id = m2;
    perform pg_temp.chk(false, 'a removed reminder came back');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== check-ups and jabs
  insert into public.health_checks (family_id, person_id, title, due_on, every_months) values (fa, kid, 'Dentist', today, 6) returning id into c1;
  insert into public.health_checks (family_id, person_id, title, due_on) values (fa, kid, 'Pre-school booster', today + 30) returning id into c2;
  perform pg_temp.sys();
  update public.families set timezone = (select z from unnest(array['Europe/London', 'Asia/Tokyo', 'America/New_York', 'Pacific/Kiritimati', 'Asia/Kolkata',
    'America/Los_Angeles', 'Australia/Sydney', 'Europe/Moscow', 'America/Sao_Paulo', 'Asia/Dubai', 'Pacific/Honolulu', 'Asia/Bangkok']) z
    where extract(hour from now() at time zone z) between 9 and 20 and (now() at time zone z)::date = today limit 1) where id = fa;
  if (select timezone from public.families where id = fa) is null then
    perform pg_temp.chk(false, 'a daytime time zone was found for the check-up reminder');
  else
    perform public.queue_health_reminders(); perform public.queue_health_reminders();
    perform pg_temp.chk((select count(*) from public.notifications where kind = 'health' and title = 'A check-up is due for Kid') = 2, 'every parent hears a check-up is due, once (without saying which on the lock screen)');
    perform pg_temp.chk((select count(*) from public.notifications where kind = 'health' and title like 'A check-up%') = 2, 'something not yet due was reminded about');
  end if;
  update public.families set timezone = 'Europe/London' where id = fa;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.health_checks set last_done_on = today where id = c1;
  perform pg_temp.chk((select due_on = (today + interval '6 months')::date and done_at is null and reminded_on is null from public.health_checks where id = c1), 'a repeating check-up moves on six months when done');
  update public.health_checks set last_done_on = today where id = c2;
  perform pg_temp.chk((select done_at is not null from public.health_checks where id = c2), 'a one-off is finished when done');
  begin
    update public.health_checks set last_done_on = today + 10 where id = c1;
    perform pg_temp.chk(false, 'a check-up was marked done in the future');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.health_checks set done_at = now() where id = c1;
    perform pg_temp.chk(false, 'a repeating check-up was finished without moving on');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.health_checks set person_id = pat where id = c1;
    perform pg_temp.chk(false, 'a check-up moved to someone else');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== other families and visitors
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.health_meds where family_id = fa), 'another family sees our medicine');
  perform pg_temp.chk(not exists (select 1 from public.health_doses where family_id = fa), 'another family sees our doses');
  perform pg_temp.chk(not exists (select 1 from public.health_checks where family_id = fa), 'another family sees our check-ups');
  begin
    insert into public.health_doses (family_id, med_id, on_date, at_time, given_at) values (fb, m1, today, '23:59', now());
    perform pg_temp.chk(false, 'another family ticked our dose');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    perform public.queue_health_reminders();
    perform pg_temp.chk(false, 'a signed-in person ran the reminders');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(null, null);
  begin
    select count(*) into n from public.health_meds;
    perform pg_temp.chk(n = 0, 'a signed-out visitor reads medicine');
  exception when others then perform pg_temp.chk(true, ''); end;

  perform pg_temp.sys();
  select count(*) filter (where passed), string_agg(case when not passed then E'\nFAIL: ' || msg end, '')
    into n, t from t_results;
  if (select count(*) from t_results where not passed) = 0 then
    raise exception 'REPORT: ALL % CHECKS PASSED', n;
  else
    raise exception 'REPORT: % passed, % FAILED%', n, (select count(*) from t_results where not passed), t;
  end if;
end $$;
