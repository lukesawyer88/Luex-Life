-- Luex Life Bookings and Hosting access test. Creates throwaway families, tries to break every Hosting rule, then rolls itself
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

do $$
declare
  ua uuid := gen_random_uuid(); up uuid := gen_random_uuid(); ug uuid := gen_random_uuid();
  uk uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  fa uuid; fb uuid; ann uuid; pat uuid; gran uuid; kid uuid; ben uuid;
  e1 uuid; e2 uuid; ep uuid; eb uuid; h1 uuid; hp uuid; g1 uuid; i1 uuid; ek uuid; hk uuid; gone uuid; ik uuid; e3 uuid; e4 uuid; tok text; n int; t text; tz text; today date;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'ann@test.dev', 'authenticated', 'authenticated'), (up, 'pat@test.dev', 'authenticated', 'authenticated'),
    (ug, 'gran@test.dev', 'authenticated', 'authenticated'), (uk, 'kid@test.dev', 'authenticated', 'authenticated'),
    (ub, 'ben@test.dev', 'authenticated', 'authenticated');
  perform pg_temp.act(ub, 'ben@test.dev'); fb := public.create_family('Beta', 'Ben'); ben := public.my_member_id();
  insert into public.cal_events (family_id, title, type, starts_at, ends_at) values (fb, 'Ben''s party', 'social', now(), now() + interval '2 hours') returning id into eb;
  perform pg_temp.act(ua, 'ann@test.dev'); fa := public.create_family('Alpha', 'Ann'); ann := public.my_member_id();
  tok := public.create_invite(fa, 'pat@test.dev', 'parent', 'Pat');
  perform pg_temp.act(up, 'pat@test.dev'); perform public.accept_invite(tok); pat := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'gran@test.dev', 'member', 'Gran');
  perform pg_temp.act(ug, 'gran@test.dev'); perform public.accept_invite(tok); gran := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'kid@test.dev', 'child', 'Kid');
  perform pg_temp.act(uk, 'kid@test.dev'); perform public.accept_invite(tok); kid := public.my_member_id();
  select z into tz from unnest(array['Europe/London', 'Asia/Tokyo', 'America/New_York', 'Pacific/Kiritimati', 'Asia/Kolkata', 'America/Los_Angeles',
    'Australia/Sydney', 'Europe/Moscow', 'America/Sao_Paulo', 'Asia/Dubai', 'Pacific/Honolulu', 'Asia/Bangkok', 'Atlantic/Azores', 'America/Anchorage',
    'Pacific/Auckland', 'Asia/Kathmandu', 'America/Chicago', 'Africa/Nairobi', 'Pacific/Chatham', 'Asia/Karachi', 'America/Halifax', 'Pacific/Tongatapu']) z
    where extract(hour from now() at time zone z) between 18 and 22 limit 1;
  perform pg_temp.sys(); update public.families set timezone = tz where id = fa;
  today := (now() at time zone tz)::date;

  -- ===== hosting sits on a Calendar "party or visit" event
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.cal_events (family_id, title, type, starts_at, ends_at, people)
    values (fa, 'Mia''s party', 'social', (today + 1)::timestamp at time zone tz + interval '14 hours', (today + 1)::timestamp at time zone tz + interval '17 hours', array[ann, pat]) returning id into e1;
  insert into public.host_events (family_id, event_id) values (fa, e1) returning id into h1;
  perform pg_temp.chk((select created_by from public.host_events where id = h1) = ann, 'hosting records who added it');
  insert into public.cal_events (family_id, title, type, starts_at, ends_at) values (fa, 'Dentist', 'appointment', now(), now() + interval '1 hour') returning id into e2;
  begin
    insert into public.host_events (family_id, event_id) values (fa, e2);
    perform pg_temp.chk(false, 'hosting was put on an event that isn''t a party or visit');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.host_events (family_id, event_id) values (fa, eb);
    perform pg_temp.chk(false, 'hosting was put on another family''s event');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.cal_events (family_id, title, type, starts_at, ends_at, visibility) values (fa, 'Surprise for Pat', 'social', now() + interval '20 days', now() + interval '20 days 2 hours', 'selected') returning id into ep;
  insert into public.host_events (family_id, event_id) values (fa, ep) returning id into hp;
  insert into public.host_guests (family_id, host_id, name) values (fa, hp, 'Pat''s best friend');

  insert into public.host_guests (family_id, host_id, name, people, status, dietary) values (fa, h1, 'The Joneses', 4, 'yes', 'One vegetarian') returning id into g1;
  insert into public.host_guests (family_id, host_id, name, people, status) values (fa, h1, 'Aunt Sue', 1, 'maybe');
  insert into public.host_items (family_id, host_id, kind, title) values (fa, h1, 'get', 'Balloons') returning id into i1;
  insert into public.host_items (family_id, host_id, kind, title, who) values (fa, h1, 'do', 'Tidy the playroom', kid) returning id into ik;
  perform pg_temp.chk((select count(*) from public.host_guests where host_id = h1) = 2 and (select count(*) from public.host_items where host_id = h1) = 2, 'a parent adds guests, things to get and jobs');
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'hosting' and member_id = kid and body = 'Tidy the playroom') = 1, 'someone given a job is told');
  perform pg_temp.chk(not exists (select 1 from public.notifications where kind = 'hosting' and member_id = ann), 'giving yourself a job tells you');

  -- ===== a child: sees it, ticks their own job, nothing else
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(exists (select 1 from public.host_guests where host_id = h1), 'a child sees who''s coming');
  perform pg_temp.chk(not exists (select 1 from public.host_events where id = hp) and not exists (select 1 from public.host_guests where host_id = hp), 'a child sees a private plan');
  update public.host_items set done_at = '2000-01-01' where id = ik;
  perform pg_temp.chk((select done_at > now() - interval '1 minute' and done_by = kid from public.host_items where id = ik), 'a child ticks their own job (at the real time)');
  begin
    update public.host_items set done_at = now() where id = i1;
    perform pg_temp.chk(false, 'a child ticked something not given to them');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.host_items (family_id, host_id, kind, title) values (fa, h1, 'get', 'Sweets');
    perform pg_temp.chk(false, 'a child added to the list');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.host_guests (family_id, host_id, name) values (fa, h1, 'My mate');
    perform pg_temp.chk(false, 'a child added a guest');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.host_items set who = null where id = ik;
    perform pg_temp.chk(false, 'a child handed their job back');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== a grandparent: can't see the private plan
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.host_guests where host_id = hp), 'someone else sees a private plan''s guests');
  begin
    insert into public.host_guests (family_id, host_id, name) values (fa, hp, 'Peek');
    perform pg_temp.chk(false, 'someone added a guest to a plan they can''t see');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.host_guests set status = 'yes' where name = 'Aunt Sue';
  perform pg_temp.chk((select status from public.host_guests where name = 'Aunt Sue') = 'yes', 'a grown-up updates who''s coming');
  begin
    update public.host_items set kind = 'do' where id = i1;
    perform pg_temp.chk(false, 'an item changed kind');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== the event underneath (review fixes)
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.cal_events (family_id, title, type, starts_at, ends_at) values (fa, 'My sleepover', 'social', now() + interval '5 days', now() + interval '5 days 3 hours') returning id into ek;
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    insert into public.host_events (family_id, event_id) values (fa, ek);
    perform pg_temp.chk(false, 'a plan was put on a child''s own event');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.host_guests (family_id, host_id, name) values (fa, h1, 'Gone guest') returning id into gone;
  update public.host_guests set deleted_at = now() where id = gone;
  begin
    update public.host_guests set deleted_at = null where id = gone;
    perform pg_temp.chk(false, 'a removed guest came back');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.cal_events (family_id, title, type, starts_at, ends_at) values (fa, 'Called off', 'social', now() + interval '9 days', now() + interval '9 days 2 hours') returning id into ek;
  insert into public.host_events (family_id, event_id) values (fa, ek) returning id into hk;
  update public.cal_events set deleted_at = now() where id = ek;
  perform pg_temp.chk(not exists (select 1 from public.host_events where id = hk), 'a plan whose Calendar event was removed still shows');
  begin
    insert into public.host_guests (family_id, host_id, name) values (fa, hk, 'Ghost');
    perform pg_temp.chk(false, 'a guest was added to a removed plan');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== second review fixes
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    insert into public.host_items (family_id, host_id, kind, title, who) values (fa, hp, 'do', 'Hide the cake', gran);
    perform pg_temp.chk(false, 'a job was given to someone who can''t see the plan');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.host_items (family_id, host_id, kind, title, who) values (fa, h1, 'get', 'Crisps', kid);
    perform pg_temp.chk(false, 'something to get was given to someone (only jobs are)');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.cal_events (family_id, title, type, starts_at, ends_at, rrule) values (fa, 'Book club', 'social', now() + interval '3 days', now() + interval '3 days 2 hours', 'FREQ=WEEKLY') returning id into ek;
  begin
    insert into public.host_events (family_id, event_id) values (fa, ek);
    perform pg_temp.chk(false, 'a plan was put on a repeating event');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== "tomorrow"
  insert into public.cal_events (family_id, title, type, starts_at, ends_at, people) values (fa, 'Big dinner', 'social', (today + 3)::timestamp at time zone tz + interval '19 hours', (today + 3)::timestamp at time zone tz + interval '22 hours', array[ann]) returning id into e3;
  insert into public.host_events (family_id, event_id, remind_days) values (fa, e3, 3);
  insert into public.cal_events (family_id, title, type, starts_at, ends_at, people) values (fa, 'Small lunch', 'social', (today + 3)::timestamp at time zone tz + interval '12 hours', (today + 3)::timestamp at time zone tz + interval '14 hours', array[ann]) returning id into e4;
  insert into public.host_events (family_id, event_id) values (fa, e4);
  perform pg_temp.sys();
  if tz is null then
    perform pg_temp.chk(false, 'an evening time zone was found for the reminder check');
  else
    perform public.queue_host_reminders(); perform public.queue_host_reminders();
    perform pg_temp.chk((select count(*) from public.notifications where kind = 'hosting' and member_id = ann and title = 'Big dinner is on ' || to_char(today + 3, 'FMDay')) = 1, 'a plan set to remind 3 days before does, naming the day');
    perform pg_temp.chk(not exists (select 1 from public.notifications where kind = 'hosting' and title like 'Small lunch%'), 'a plan reminded earlier than it asked');
    t := (select body from public.notifications where kind = 'hosting' and member_id = ann and title like 'Mia''s party%');
    perform pg_temp.chk((select count(*) from public.notifications where kind = 'hosting' and member_id in (ann, pat) and title like 'Mia''s party%') = 2, 'the hosts hear the night before, once');
    perform pg_temp.chk(t = '5 people coming, 1 thing still to get or do', 'the message says how many are coming and what''s left: ' || coalesce(t, ''));
    perform pg_temp.chk(not exists (select 1 from public.notifications where kind = 'hosting' and member_id in (gran, kid) and title like 'Mia''s party%'), 'someone not hosting hears about it');
  end if;

  -- ===== other families and visitors
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.host_events where family_id = fa), 'another family sees our plans');
  perform pg_temp.chk(not exists (select 1 from public.host_guests where family_id = fa), 'another family sees our guests');
  begin
    insert into public.host_guests (family_id, host_id, name) values (fa, h1, 'Sneaky');
    perform pg_temp.chk(false, 'another family added a guest');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    perform public.queue_host_reminders();
    perform pg_temp.chk(false, 'a signed-in person ran the reminders');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(null, null);
  begin
    select count(*) into n from public.host_guests;
    perform pg_temp.chk(n = 0, 'a signed-out visitor reads guests');
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
