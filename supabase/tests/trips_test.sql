-- Luex Life Trips and Holidays access test. Creates throwaway families, tries to break every Trips rule, then rolls itself back
-- (it always ends with an error carrying the report). Run after ANY change to its access:
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
  e1 uuid; e2 uuid; ep uuid; eb uuid; t1 uuid; t2 uuid; tp uuid; i1 uuid; i2 uuid; ik uuid; idea uuid; ek uuid; et uuid; tt uuid; gone uuid; tok text; n int; t text; tz text; today date;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'ann@test.dev', 'authenticated', 'authenticated'), (up, 'pat@test.dev', 'authenticated', 'authenticated'),
    (ug, 'gran@test.dev', 'authenticated', 'authenticated'), (uk, 'kid@test.dev', 'authenticated', 'authenticated'),
    (ub, 'ben@test.dev', 'authenticated', 'authenticated');
  perform pg_temp.act(ub, 'ben@test.dev'); fb := public.create_family('Beta', 'Ben'); ben := public.my_member_id();
  insert into public.cal_events (family_id, title, type, all_day, starts_at, ends_at) values (fb, 'Ben''s trip', 'trip', true, now(), now() + interval '2 days') returning id into eb;
  perform pg_temp.act(ua, 'ann@test.dev'); fa := public.create_family('Alpha', 'Ann'); ann := public.my_member_id();
  tok := public.create_invite(fa, 'pat@test.dev', 'parent', 'Pat');
  perform pg_temp.act(up, 'pat@test.dev'); perform public.accept_invite(tok); pat := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'gran@test.dev', 'member', 'Gran');
  perform pg_temp.act(ug, 'gran@test.dev'); perform public.accept_invite(tok); gran := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'kid@test.dev', 'child', 'Kid');
  perform pg_temp.act(uk, 'kid@test.dev'); perform public.accept_invite(tok); kid := public.my_member_id();
  -- an evening time zone so the "two days to go" message runs now
  select z into tz from unnest(array['Europe/London', 'Asia/Tokyo', 'America/New_York', 'Pacific/Kiritimati', 'Asia/Kolkata', 'America/Los_Angeles',
    'Australia/Sydney', 'Europe/Moscow', 'America/Sao_Paulo', 'Asia/Dubai', 'Pacific/Honolulu', 'Asia/Bangkok', 'Atlantic/Azores', 'America/Anchorage',
    'Pacific/Auckland', 'Asia/Kathmandu', 'America/Chicago', 'Africa/Nairobi', 'Pacific/Chatham', 'Asia/Karachi', 'America/Halifax', 'Pacific/Tongatapu']) z
    where extract(hour from now() at time zone z) between 18 and 22 limit 1;
  perform pg_temp.sys(); update public.families set timezone = tz where id = fa;
  today := (now() at time zone tz)::date;

  -- ===== a trip sits on a Calendar trip event (parents and grown-ups plan)
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.cal_events (family_id, title, type, all_day, starts_at, ends_at, people, location)
    values (fa, 'Spain', 'trip', true, (today + 2)::timestamp at time zone tz, (today + 9)::timestamp at time zone tz, array[ann, pat, kid], 'Malaga') returning id into e1;
  insert into public.trips (family_id, event_id, emoji) values (fa, e1, '🏖️') returning id into t1;
  perform pg_temp.chk((select created_by from public.trips where id = t1) = ann, 'trips record who added them');
  insert into public.cal_events (family_id, title, type, starts_at, ends_at) values (fa, 'Dentist', 'appointment', now(), now() + interval '1 hour') returning id into e2;
  begin
    insert into public.trips (family_id, event_id) values (fa, e2);
    perform pg_temp.chk(false, 'a trip was put on an event that isn''t a trip');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.trips (family_id, event_id) values (fa, eb);
    perform pg_temp.chk(false, 'a trip was put on another family''s event');
  exception when others then perform pg_temp.chk(true, ''); end;
  -- a private trip (only Ann sees the event)
  insert into public.cal_events (family_id, title, type, all_day, starts_at, ends_at, visibility) values (fa, 'Surprise for Pat', 'trip', true, now() + interval '30 days', now() + interval '32 days', 'selected') returning id into ep;
  insert into public.trips (family_id, event_id) values (fa, ep) returning id into tp;
  insert into public.trip_items (family_id, trip_id, kind, title) values (fa, tp, 'todo', 'Book the spa');

  -- items: packing for each person and shared, before-we-go jobs, plans
  insert into public.trip_items (family_id, trip_id, kind, member_id, title) values (fa, t1, 'pack', kid, 'Swimsuit') returning id into ik;
  insert into public.trip_items (family_id, trip_id, kind, title) values (fa, t1, 'pack', 'Sun cream') returning id into i1;
  insert into public.trip_items (family_id, trip_id, kind, title) values (fa, t1, 'todo', 'Check passports') returning id into i2;
  insert into public.trip_items (family_id, trip_id, kind, title, plan_kind, starts_at, ref, place) values (fa, t1, 'plan', 'Flight out', 'travel', now() + interval '2 days', 'ABC123', 'Gatwick North');
  perform pg_temp.chk((select count(*) from public.trip_items where trip_id = t1) = 4, 'a parent adds packing, jobs and plans');
  begin
    insert into public.trip_items (family_id, trip_id, kind, title, ref) values (fa, t1, 'pack', 'Odd', 'X1');
    perform pg_temp.chk(false, 'a packing item was given a booking reference');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.trip_items (family_id, trip_id, kind, member_id, title) values (fa, t1, 'pack', ben, 'Ben''s');
    perform pg_temp.chk(false, 'packing was given to someone in another family');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== a child packs their own things
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(exists (select 1 from public.trips where id = t1), 'a child sees the family trip');
  perform pg_temp.chk(not exists (select 1 from public.trips where id = tp), 'a child sees a private trip');
  perform pg_temp.chk(not exists (select 1 from public.trip_items where trip_id = tp), 'a child sees a private trip''s plans');
  update public.trip_items set done_at = '2000-01-01' where id = ik;
  perform pg_temp.chk((select done_at > now() - interval '1 minute' and done_by = kid from public.trip_items where id = ik), 'a child ticks their own packing (at the real time)');
  insert into public.trip_items (family_id, trip_id, kind, member_id, title) values (fa, t1, 'pack', kid, 'Teddy');
  perform pg_temp.chk(exists (select 1 from public.trip_items where title = 'Teddy' and created_by = kid), 'a child adds to their own packing');
  begin
    insert into public.trip_items (family_id, trip_id, kind, member_id, title) values (fa, t1, 'pack', pat, 'Pat''s');
    perform pg_temp.chk(false, 'a child added to someone else''s packing');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.trip_items (family_id, trip_id, kind, title, plan_kind) values (fa, t1, 'plan', 'Sneaky flight', 'travel');
    perform pg_temp.chk(false, 'a child added a plan');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.trip_items set done_at = now() where id = i2;
    perform pg_temp.chk(false, 'a child ticked a before-we-go job');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.trip_items set member_id = pat where id = ik;
    perform pg_temp.chk(false, 'a child gave their packing to someone else');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.trips (family_id, event_id) values (fa, e1);
    perform pg_temp.chk(false, 'a child made a trip');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== a grandparent
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.trips where id = tp), 'someone else sees a private trip');
  begin
    insert into public.trip_items (family_id, trip_id, kind, title) values (fa, tp, 'todo', 'Peek');
    perform pg_temp.chk(false, 'someone added to a trip they can''t see');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.trip_items set done_at = now() where id = i2;
  perform pg_temp.chk((select done_by from public.trip_items where id = i2) = gran, 'a grown-up ticks a before-we-go job');
  begin
    update public.trip_items set kind = 'plan' where id = i1;
    perform pg_temp.chk(false, 'an item changed kind');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== ideas for days out (anyone adds; others' only grown-ups change)
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.trip_ideas (family_id, title, place) values (fa, 'Zoo', 'Chester') returning id into idea;
  perform pg_temp.chk((select created_by from public.trip_ideas where id = idea) = kid, 'a child adds an idea for a day out');
  begin
    insert into public.trip_ideas (family_id, title, link) values (fa, 'Bad link', 'javascript:alert(1)');
    perform pg_temp.chk(false, 'an idea was saved with a link that isn''t a web address');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ug, 'gran@test.dev');
  insert into public.trip_ideas (family_id, title) values (fa, 'Beach') returning id into i1;
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    update public.trip_ideas set title = 'Mine now' where id = i1;
    perform pg_temp.chk(false, 'a child changed someone else''s idea');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(up, 'pat@test.dev');
  update public.trip_ideas set done_at = '2000-01-01' where id = idea;
  perform pg_temp.chk((select done_at > now() - interval '1 minute' from public.trip_ideas where id = idea), 'a parent ticks off an idea (at the real time)');

  -- ===== the event underneath (review fixes)
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.cal_events (family_id, title, type, all_day, starts_at, ends_at) values (fa, 'My trip', 'trip', true, now() + interval '9 days', now() + interval '10 days') returning id into ek;
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    insert into public.trips (family_id, event_id) values (fa, ek);
    perform pg_temp.chk(false, 'a trip was put on a child''s own event (they could change or remove it)');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.cal_events (family_id, title, type, all_day, starts_at, ends_at) values (fa, 'Day out', 'trip', true, (today + 1)::timestamp at time zone tz, (today + 1)::timestamp at time zone tz) returning id into et;
  insert into public.trips (family_id, event_id) values (fa, et) returning id into tt;
  insert into public.trip_items (family_id, trip_id, kind, title) values (fa, tt, 'todo', 'Make sandwiches') returning id into gone;
  update public.trip_items set deleted_at = now() where id = gone;
  begin
    update public.trip_items set deleted_at = null where id = gone;
    perform pg_temp.chk(false, 'a removed item came back');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.cal_events (family_id, title, type, all_day, starts_at, ends_at) values (fa, 'Cancelled', 'trip', true, now() + interval '40 days', now() + interval '41 days') returning id into ek;
  insert into public.trips (family_id, event_id) values (fa, ek) returning id into tp;
  update public.cal_events set deleted_at = now() where id = ek;
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.trips where id = tp), 'a trip whose Calendar event was removed still shows');
  begin
    insert into public.trip_items (family_id, trip_id, kind, member_id, title) values (fa, tp, 'pack', kid, 'Ghost');
    perform pg_temp.chk(false, 'someone packed for a removed trip');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== "two days to go"
  perform pg_temp.sys();
  if tz is null then
    perform pg_temp.chk(false, 'an evening time zone was found for the reminder check');
  else
    perform public.queue_trip_reminders(); perform public.queue_trip_reminders();
    t := (select body from public.notifications where kind = 'trip' and member_id = ann and title like 'Off to Spain%');
    perform pg_temp.chk((select count(*) from public.notifications where kind = 'trip' and member_id = ann and title like 'Off to Spain%') = 1, 'whoever''s going hears two days before, once');
    perform pg_temp.chk(t like '1 thing still%', 'the message says what''s still to pack or do: ' || coalesce(t, ''));
    perform pg_temp.chk((select body from public.notifications where kind = 'trip' and member_id = kid and title like 'Off to Spain%') like '2 things%', 'a child hears what''s left for them (their packing and the jobs)');
    perform pg_temp.chk(not exists (select 1 from public.notifications where kind = 'trip' and member_id = gran and title like 'Off to Spain%'), 'someone not going hears about the trip');
    perform pg_temp.chk(exists (select 1 from public.notifications where kind = 'trip' and title like 'Off to Day out%'), 'a trip added the day before still gets its reminder');
  end if;

  -- ===== other families and visitors
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.trips where family_id = fa), 'another family sees our trips');
  perform pg_temp.chk(not exists (select 1 from public.trip_items where family_id = fa), 'another family sees our packing');
  perform pg_temp.chk(not exists (select 1 from public.trip_ideas where family_id = fa), 'another family sees our ideas');
  begin
    insert into public.trip_items (family_id, trip_id, kind, title) values (fa, t1, 'todo', 'Sneaky');
    perform pg_temp.chk(false, 'another family added to our trip');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    perform public.queue_trip_reminders();
    perform pg_temp.chk(false, 'a signed-in person ran the reminders');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(null, null);
  begin
    select count(*) into n from public.trips;
    perform pg_temp.chk(n = 0, 'a signed-out visitor reads trips');
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
