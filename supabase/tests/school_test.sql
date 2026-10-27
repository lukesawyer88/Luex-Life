-- Luex Life Rewards and Pocket School access test. Creates throwaway families, tries to break every Board rule, then rolls
-- itself back (it always ends with an error carrying the report). Run after ANY change to School access:
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

create function pg_temp.st(m uuid) returns integer language sql security definer as $$ select coalesce(sum(delta), 0)::integer from public.star_entries where member_id = m $$;
create function pg_temp.pb(m uuid, p text) returns numeric language sql security definer as $$ select coalesce(sum(amount), 0) from public.pocket_entries where member_id = m and pot = p and status = 'ok' $$;
grant execute on function pg_temp.st(uuid), pg_temp.pb(uuid, text) to public;

do $$
declare
  ua uuid := gen_random_uuid(); up uuid := gen_random_uuid(); ug uuid := gen_random_uuid();
  uk uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  fa uuid; fb uuid; ann uuid; pat uuid; gran uuid; kid uuid; ben uuid; tom uuid;
  sch uuid; ev uuid; t1 uuid; hw uuid; x uuid; tok text; n int; t text; d date; tz text; line text;
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
  -- a morning-ish time zone so the summary runs now
  select z into tz from unnest(array['Europe/London', 'Asia/Tokyo', 'America/New_York', 'Pacific/Kiritimati', 'Asia/Kolkata', 'America/Los_Angeles',
    'Australia/Sydney', 'Europe/Moscow', 'America/Sao_Paulo', 'Asia/Dubai', 'Pacific/Honolulu', 'Asia/Bangkok', 'Atlantic/Azores', 'America/Anchorage']) z
    where (now() at time zone z)::time between '07:05' and '09:20' limit 1;
  perform pg_temp.sys(); update public.families set timezone = coalesce(tz, 'Europe/London') where id = fa;
  d := (now() at time zone coalesce(tz, 'Europe/London'))::date;

  -- ===== setting up (parents only)
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.school_places (family_id, name, phone) values (fa, 'Oak Primary', '01234 567890') returning id into sch;
  insert into public.school_children (member_id, family_id, place_id, class_name, teacher) values (kid, fa, sch, 'Year 3', 'Mrs Lee');
  insert into public.school_days (member_id, family_id, weekday, bring, lunch) values (kid, fa, extract(isodow from d)::smallint, array['PE kit', 'Reading book'], 'packed');
  insert into public.school_runs (member_id, family_id, weekday, drop_by, pick_by, pick_time)
    values (kid, fa, least(extract(isodow from d)::smallint, 5::smallint), ann, gran, '15:15');
  perform pg_temp.chk((select created_by from public.school_places where id = sch) = ann, 'places record who added them');
  begin
    insert into public.school_days (member_id, family_id, weekday, bring) values (pat, fa, 1, array['x']);
    perform pg_temp.chk(false, 'a grown-up was given a school week');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    insert into public.school_places (family_id, name) values (fa, 'Gran''s club');
    perform pg_temp.chk(false, 'a grown-up who isn''t a parent set up a school');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.chk(exists (select 1 from public.school_runs where member_id = kid), 'Gran sees the school runs');
  -- swapping a pickup tells the person now doing it
  insert into public.school_run_changes (family_id, member_id, on_date, pick_by, pick_time, note) values (fa, kid, d + 1, pat, '15:30', 'Gran''s away');
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'school' and member_id = pat and body like '%picking up Kid%') = 1, 'a swapped pickup tells the new person');
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(exists (select 1 from public.school_days where member_id = kid), 'a child sees their week');
  begin
    insert into public.school_run_changes (family_id, member_id, on_date, pick_by) values (fa, kid, d + 2, kid);
    perform pg_temp.chk(false, 'a child changed a pickup');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.school_days set bring = array['Nothing'] where member_id = kid;
    get diagnostics n = row_count; perform pg_temp.chk(n = 0, 'a child changed what to bring');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== clubs are Calendar events
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.cal_events (family_id, title, type, starts_at, ends_at, rrule, people)
    values (fa, 'Swimming', 'activity', (d::timestamp + time '16:00') at time zone coalesce(tz, 'Europe/London'),
      (d::timestamp + time '17:00') at time zone coalesce(tz, 'Europe/London'),
      'FREQ=WEEKLY;BYDAY=' || (array['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow from d)::int], array[kid]) returning id into ev;
  insert into public.school_activities (family_id, member_id, event_id, kit, cost, cost_every) values (fa, kid, ev, array['Towel'], 6, 'session');
  perform pg_temp.act(ub, 'ben@test.dev');
  begin
    insert into public.school_activities (family_id, member_id, event_id) values (fb, ben, ev);
    perform pg_temp.chk(false, 'another family linked our event');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- review fixes
  perform pg_temp.act(up, 'pat@test.dev');
  insert into public.cal_events (family_id, title, type, starts_at, ends_at, people, visibility, viewers)
    values (fa, 'Private thing', 'other', now(), now() + interval '1 hour', array[kid], 'selected', array[pat]) returning id into x;
  begin
    insert into public.school_activities (family_id, member_id, event_id) values (fa, kid, x);
    perform pg_temp.chk(false, 'a private event was made a club');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.school_run_changes (family_id, member_id, on_date, pick_by) values (fa, kid, d + 5, kid);
    perform pg_temp.chk(false, 'a child was put on the school run');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ug, 'gran@test.dev');
  update public.school_run_changes set note = 'edit 1' where member_id = kid and on_date = d + 1;
  update public.school_run_changes set note = 'edit 2' where member_id = kid and on_date = d + 1;
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'school' and member_id = pat and body like '%picking up Kid%') = 1, 'editing a note sent more pickup messages');

  -- ===== things to do
  perform pg_temp.act(ug, 'gran@test.dev');
  insert into public.school_tasks (family_id, member_id, title, kind, due_on, amount) values (fa, kid, 'Trip money', 'money', d, 5) returning id into t1;
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.school_tasks (family_id, member_id, title, kind, due_on) values (fa, kid, 'Spellings', 'homework', d + 3) returning id into hw;
  begin
    insert into public.school_tasks (family_id, member_id, title, kind) values (fa, kid, 'Buy me a toy', 'other');
    perform pg_temp.chk(false, 'a child added something that isn''t homework');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.school_tasks set done_at = now() where id = hw;
  perform pg_temp.chk((select done_by from public.school_tasks where id = hw) = kid, 'a child ticks their homework');
  begin
    update public.school_tasks set done_at = now() where id = t1;
    perform pg_temp.chk(false, 'a child ticked off the trip money');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(up, 'pat@test.dev');
  begin
    update public.school_tasks set title = 'Changed' where id = hw;
    perform pg_temp.chk((select title from public.school_tasks where id = hw) = 'Changed', 'a parent changes anything');
  exception when others then perform pg_temp.chk(false, 'a parent couldn''t change a task'); end;
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    update public.school_tasks set title = 'Mine now' where id = hw;
    perform pg_temp.chk(false, 'someone changed a task they didn''t add');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.school_tasks (family_id, title, photo_path) values (fa, 'Letter', fa || '/school/made-up.jpg');
    perform pg_temp.chk(false, 'a made-up photo was attached');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into storage.objects (bucket_id, name, owner, owner_id) values ('school-files', fa || '/school/letter.jpg', ug, ug::text);
  insert into public.school_tasks (family_id, title, kind, photo_path) values (fa, 'Non-uniform day', 'dressup', fa || '/school/letter.jpg');
  perform pg_temp.chk(public.school_file_ok(fa || '/school/letter.jpg', false), 'the household opens a letter photo');

  -- ===== the morning summary
  perform pg_temp.sys();
  perform pg_temp.chk(tz is not null, 'a morning time zone was found for the summary check');
  if tz is not null then
    n := public.queue_school_morning(); n := public.queue_school_morning();
    perform pg_temp.chk((select count(*) from public.notifications where kind = 'school' and title = 'Today' and member_id = ann) = 1, 'a parent gets one morning summary');
    line := (select body from public.notifications where kind = 'school' and title = 'Today' and member_id = ann);
    perform pg_temp.chk(line like '%PE kit%' and line like '%Swimming 16:00 (Towel)%' and line like '%Trip money due%', 'the summary says what to bring, clubs and what''s due: ' || coalesce(line, ''));
    perform pg_temp.chk((select body from public.notifications where kind = 'school' and title = 'Today' and member_id = kid) not like 'Kid:%', 'a child''s summary is about them');
    perform pg_temp.chk(coalesce((select body from public.notifications where kind = 'school' and title = 'Today' and member_id = gran), '') not like '%PE kit%', 'a grown-up who isn''t a parent only hears about their runs');
  end if;

  -- ===== other families and visitors
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.school_tasks where family_id = fa), 'another family sees our things to do');
  perform pg_temp.chk(not exists (select 1 from public.school_places where family_id = fa), 'another family sees our schools');
  perform pg_temp.chk(not public.school_file_ok(fa || '/school/letter.jpg', false), 'another family opens our letters');
  begin
    insert into public.school_tasks (family_id, title) values (fa, 'Sneaky');
    perform pg_temp.chk(false, 'another family added a task');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(null, null);
  begin
    select count(*) into n from public.school_tasks;
    perform pg_temp.chk(n = 0, 'a signed-out visitor reads school things');
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
