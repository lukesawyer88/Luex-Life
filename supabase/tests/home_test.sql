-- Luex Life Home Care access test. Creates throwaway families, tries to break every Home Care rule, then rolls itself back
-- (it always ends with an error carrying the report). Run after ANY change to its access:
--   all passed  -> error text starts "REPORT: ALL n CHECKS PASSED"
-- The reminder checks need a time zone where it is 7-10pm; the list covers every hour.
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
  b1 uuid; b2 uuid; j1 uuid; r1 uuid; r2 uuid; m1 uuid; ct uuid; bc uuid; tok text; n int; t text; tz text; today date; d date; ph text;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'ann@test.dev', 'authenticated', 'authenticated'), (up, 'pat@test.dev', 'authenticated', 'authenticated'),
    (ug, 'gran@test.dev', 'authenticated', 'authenticated'), (uk, 'kid@test.dev', 'authenticated', 'authenticated'),
    (ub, 'ben@test.dev', 'authenticated', 'authenticated');
  perform pg_temp.act(ub, 'ben@test.dev'); fb := public.create_family('Beta', 'Ben'); ben := public.my_member_id();
  insert into public.em_contacts (family_id, name) values (fb, 'Ben''s plumber') returning id into bc;
  perform pg_temp.act(ua, 'ann@test.dev'); fa := public.create_family('Alpha', 'Ann'); ann := public.my_member_id();
  tok := public.create_invite(fa, 'pat@test.dev', 'parent', 'Pat');
  perform pg_temp.act(up, 'pat@test.dev'); perform public.accept_invite(tok); pat := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'gran@test.dev', 'member', 'Gran');
  perform pg_temp.act(ug, 'gran@test.dev'); perform public.accept_invite(tok); gran := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'kid@test.dev', 'child', 'Kid');
  perform pg_temp.act(uk, 'kid@test.dev'); perform public.accept_invite(tok); kid := public.my_member_id();
  -- an evening time zone so tonight's bin reminder runs now
  select z into tz from unnest(array['Europe/London', 'Asia/Tokyo', 'America/New_York', 'Pacific/Kiritimati', 'Asia/Kolkata', 'America/Los_Angeles',
    'Australia/Sydney', 'Europe/Moscow', 'America/Sao_Paulo', 'Asia/Dubai', 'Pacific/Honolulu', 'Asia/Bangkok', 'Atlantic/Azores', 'America/Anchorage',
    'Pacific/Auckland', 'Asia/Kathmandu', 'America/Chicago', 'Africa/Nairobi', 'Pacific/Chatham', 'Asia/Karachi', 'America/Halifax', 'Pacific/Tongatapu']) z
    where extract(hour from now() at time zone z) between 19 and 22 limit 1;
  perform pg_temp.sys(); update public.families set timezone = tz where id = fa;
  today := (now() at time zone tz)::date;
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.em_contacts (family_id, name) values (fa, 'Gas Safe Gary') returning id into ct;

  -- ===== bins (grown-ups set up; a rota of grown-ups; children only when a parent adds them)
  insert into public.hc_bins (family_id, name, colour, every_weeks, first_on, people) values (fa, 'Black bin', 'black', 2, today + 1, array[ann, pat]) returning id into b1;
  perform pg_temp.chk((select created_by from public.hc_bins where id = b1) = ann, 'bins record who added them');
  insert into public.hc_bins (family_id, name, colour, every_weeks, first_on, people) values (fa, 'Blue bin', 'blue', 1, today - 6, array[ann]) returning id into b2;
  perform pg_temp.sys();
  perform pg_temp.chk((select public.hc_bin_person(b, today + 1) from public.hc_bins b where id = b1) = ann
    and (select public.hc_bin_person(b, today + 15) from public.hc_bins b where id = b1) = pat
    and (select public.hc_bin_person(b, today + 29) from public.hc_bins b where id = b1) = ann, 'the rota takes turns collection by collection');
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    insert into public.hc_bins (family_id, name, first_on, people) values (fa, 'Ben''s', today, array[ben]);
    perform pg_temp.chk(false, 'someone from another family was put on the rota');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.hc_bins (family_id, name, first_on, people) values (fa, 'Garden bin', today, array[kid]);
  perform pg_temp.chk(true, 'a parent puts a child on the rota');
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    insert into public.hc_bins (family_id, name, first_on, people) values (fa, 'Gran''s', today, array[kid]);
    perform pg_temp.chk(false, 'a grown-up who isn''t a parent put a child on the rota');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.hc_bin_changes (bin_id, family_id, on_date, who) values (b1, fa, today + 15, gran);
  perform pg_temp.sys();
  perform pg_temp.chk((select public.hc_bin_person(b, today + 15) from public.hc_bins b where id = b1) = gran, 'a grown-up swaps one collection');
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    insert into public.hc_bin_changes (bin_id, family_id, on_date, skip) values (b1, fa, today + 2, true);
    perform pg_temp.chk(false, 'a change was made on a day that isn''t a collection');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.hc_bin_changes (bin_id, family_id, on_date, move_to) values (b1, fa, today + 29, today + 60);
    perform pg_temp.chk(false, 'a collection was moved more than two weeks');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk((select count(*) from public.hc_bins where family_id = fa) = 3, 'a child sees bin day');
  begin
    insert into public.hc_bins (family_id, name, first_on) values (fa, 'Mine', today);
    perform pg_temp.chk(false, 'a child added a bin');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.hc_bin_changes (bin_id, family_id, on_date, skip) values (b1, fa, today + 29, true);
    perform pg_temp.chk(false, 'a child changed a collection');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== yearly jobs
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.hc_jobs (family_id, title, emoji, every_months, next_due, contact_id, who) values (fa, 'Boiler service', '🔥', 12, today + 7, ct, pat) returning id into j1;
  insert into public.hc_jobs (family_id, title, every_months, next_due) values (fa, 'Test smoke alarms', 1, today);
  begin
    insert into public.hc_jobs (family_id, title, next_due, contact_id) values (fa, 'Sneaky', today, bc);
    perform pg_temp.chk(false, 'a job used another family''s contact');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.hc_jobs (family_id, title, next_due, who) values (fa, 'Kid job', today, kid);
    perform pg_temp.chk(true, '');
  exception when others then perform pg_temp.chk(false, 'a parent couldn''t give a job to a child'); end;
  perform pg_temp.act(up, 'pat@test.dev');
  d := public.hc_job_tick(j1, today - 3, 'Gary came');
  perform pg_temp.chk(d = (today - 3 + interval '12 months')::date and (select last_done_on from public.hc_jobs where id = j1) = today - 3, 'ticking a job sets the next date');
  perform pg_temp.chk((select count(*) from public.hc_job_done where job_id = j1) = 1, 'ticking a job keeps a record');
  begin
    perform public.hc_job_tick(j1, today + 30, '');
    perform pg_temp.chk(false, 'a job was ticked for the future');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.hc_jobs set last_done_on = '2000-01-01' where id = j1;
    perform pg_temp.chk(false, 'the last-done date was written directly');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.hc_jobs set next_due = today + 7 where id = j1;
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    perform public.hc_job_tick(j1, today, '');
    perform pg_temp.chk(false, 'a child ticked a job');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.chk(exists (select 1 from public.hc_jobs where id = j1), 'a child sees the jobs');

  -- ===== things to fix (anyone adds; children change their own until fixed)
  ph := fa || '/home/' || gen_random_uuid() || '.jpg';
  begin
    insert into public.hc_repairs (family_id, title, photo_path) values (fa, 'Tap', ph);
    perform pg_temp.chk(false, 'a made-up photo was attached');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.chk(public.hc_file_ok(ph, true), 'a child uploads a photo of what''s broken');
  perform pg_temp.chk(not public.hc_file_ok(fa || '/home/../x.jpg', true), 'an odd photo name is allowed');
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ('home-files', ph, uk, uk::text, '{"size": 100}');
  insert into public.hc_repairs (family_id, title, place, photo_path) values (fa, 'Tap is dripping', 'Bathroom', ph) returning id into r1;
  perform pg_temp.chk((select created_by from public.hc_repairs where id = r1) = kid, 'a child adds something to fix');
  update public.hc_repairs set place = 'Upstairs bathroom' where id = r1;
  perform pg_temp.chk((select place from public.hc_repairs where id = r1) = 'Upstairs bathroom', 'a child changes their own');
  begin
    update public.hc_repairs set who = kid where id = r1;
    perform pg_temp.chk(false, 'a child said who sorts it');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.hc_repairs set done_at = now() where id = r1;
    perform pg_temp.chk(false, 'a child ticked it fixed');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'home' and title = 'Something to fix' and member_id in (ann, pat, gran)) = 3
    and not exists (select 1 from public.notifications where kind = 'home' and title = 'Something to fix' and member_id = kid), 'the grown-ups hear about something to fix');
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.hc_repairs (family_id, title) values (fa, 'Fence panel') returning id into r2;
  update public.hc_repairs set who = gran, contact_id = ct where id = r1;
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'home' and title = 'Can you sort this?' and member_id = gran) = 1, 'the person asked to sort it is told');
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    update public.hc_repairs set title = 'Fence' where id = r2;
    perform pg_temp.chk((select title from public.hc_repairs where id = r2) = 'Fence panel', 'a child changed someone else''s');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ug, 'gran@test.dev');
  update public.hc_repairs set done_at = '2000-01-01' where id = r1;
  perform pg_temp.chk((select done_at > now() - interval '1 minute' and done_by = gran from public.hc_repairs where id = r1), 'a grown-up ticks it fixed (at the real time)');
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    update public.hc_repairs set title = 'Tap' where id = r1;
    perform pg_temp.chk(false, 'a child changed it after it was fixed');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== meters (grown-ups)
  perform pg_temp.act(ug, 'gran@test.dev');
  insert into public.hc_meters (family_id, name, unit) values (fa, 'Electric', 'kWh') returning id into m1;
  insert into public.hc_readings (meter_id, family_id, value, read_on) values (m1, fa, 12345.6, today);
  perform pg_temp.chk((select created_by from public.hc_readings where meter_id = m1) = gran, 'a grown-up adds a meter reading');
  begin
    insert into public.hc_readings (meter_id, family_id, value, read_on) values (m1, fa, 1, today + 10);
    perform pg_temp.chk(false, 'a reading was dated in the future');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    insert into public.hc_readings (meter_id, family_id, value, read_on) values (m1, fa, 1, today);
    perform pg_temp.chk(false, 'a child added a reading');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== reminders
  perform pg_temp.sys();
  if tz is null then
    perform pg_temp.chk(false, 'an evening time zone was found for the reminder check');
  else
    perform public.queue_home_reminders(); perform public.queue_home_reminders();
    t := (select body from public.notifications where kind = 'home' and title = 'Bins out tonight' and member_id = ann);
    perform pg_temp.chk(t like '%Black bin%' and t like '%Blue bin%' and t like '%go tomorrow%', 'whoever''s turn it is hears about all tomorrow''s bins at once: ' || coalesce(t, ''));
    perform pg_temp.chk((select count(*) from public.notifications where kind = 'home' and title = 'Bins out tonight' and member_id = ann) = 1, 'the bin reminder comes once');
    perform pg_temp.chk(not exists (select 1 from public.notifications where kind = 'home' and title = 'Bins out tonight' and member_id in (pat, gran, kid)), 'someone whose turn it isn''t hears about the bins');
    perform pg_temp.chk((select count(*) from public.notifications where kind = 'home' and title = 'Due next week: Boiler service' and member_id = pat) = 1
      and not exists (select 1 from public.notifications where kind = 'home' and title like '%Boiler%' and member_id <> pat), 'the person who looks after a job hears a week before');
    perform pg_temp.chk((select count(*) from public.notifications where kind = 'home' and title = 'Due today: Test smoke alarms' and member_id in (ann, pat, gran)) = 3, 'a job nobody looks after tells every grown-up on the day');
    -- a moved collection: Blue bin skipped tomorrow, Black bin moved a day later
    delete from public.hc_sends where ref_id in (select id from public.hc_bins where family_id = fa) or ref_id in (select id from public.hc_jobs where family_id = fa);
    delete from public.notifications where kind = 'home' and title = 'Bins out tonight' and family_id = fa;
    insert into public.hc_bin_changes (bin_id, family_id, on_date, skip) values (b2, fa, today + 1, true);
    insert into public.hc_bin_changes (bin_id, family_id, on_date, move_to) values (b1, fa, today + 1, today + 2);
    perform public.queue_home_reminders();
    perform pg_temp.chk(not exists (select 1 from public.notifications where kind = 'home' and title = 'Bins out tonight' and family_id = fa), 'a skipped or moved collection is reminded on the old day');
  end if;

  -- ===== review fixes
  perform pg_temp.act(ug, 'gran@test.dev');
  update public.hc_bins set people = array[kid, gran] where name = 'Garden bin' and family_id = fa;
  perform pg_temp.chk((select people from public.hc_bins where name = 'Garden bin' and family_id = fa) = array[kid, gran], 'a grown-up can add themselves to a rota a parent put a child on');
  perform pg_temp.act(ua, 'ann@test.dev');
  d := public.hc_job_tick((select id from public.hc_jobs where title = 'Test smoke alarms' and family_id = fa), today - 100, '');
  perform pg_temp.chk(d >= current_date, 'a job ticked as done long ago still gets a date still to come: ' || d);
  perform pg_temp.sys();
  if tz is not null then
    -- a collection moved after its first reminder is reminded again on its new day
    delete from public.hc_bin_changes where family_id = fa; delete from public.hc_sends where ref_id in (select id from public.hc_bins where family_id = fa) or ref_id in (select id from public.hc_jobs where family_id = fa); delete from public.notifications where kind = 'home' and title = 'Bins out tonight' and family_id = fa;
    perform public.queue_home_reminders();
    n := (select count(*) from public.notifications where kind = 'home' and title = 'Bins out tonight' and member_id = ann);
    insert into public.hc_bin_changes (bin_id, family_id, on_date, move_to) values (b2, fa, today - 6, today + 1);
    delete from public.notifications where kind = 'home' and title = 'Bins out tonight' and family_id = fa;
    update public.hc_sends set for_date = today where ref_id = b2;
    perform public.queue_home_reminders();
    perform pg_temp.chk(n = 1 and exists (select 1 from public.notifications where kind = 'home' and title = 'Bins out tonight' and member_id = ann), 'a moved collection is reminded again on its new day');
    -- someone on the rota without a login: the grown-ups hear instead
    insert into public.family_members (family_id, display_name, role) values (fa, 'Lodger', 'member') returning id into j1;
    update public.hc_bins set people = array[j1] where id = b1;
    delete from public.hc_bin_changes where family_id = fa; delete from public.hc_sends where ref_id in (select id from public.hc_bins where family_id = fa) or ref_id in (select id from public.hc_jobs where family_id = fa); delete from public.notifications where kind = 'home' and title = 'Bins out tonight' and family_id = fa;
    perform public.queue_home_reminders();
    perform pg_temp.chk((select count(*) from public.notifications where kind = 'home' and title = 'Bins out tonight' and member_id in (ann, pat, gran)) = 3, 'a rota person without a login means every grown-up is reminded');
  end if;
  perform pg_temp.act(ub, 'ben@test.dev');
  begin
    perform public.hc_bin_person(b, current_date) from public.hc_bins b where b.id = b1;
    perform pg_temp.chk(false, 'a signed-in person used the rota function directly');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.sys();
  insert into storage.objects (bucket_id, name, created_at) values ('home-files', fa || '/home/' || gen_random_uuid() || '.jpg', now() - interval '2 days');
  update storage.objects set created_at = now() - interval '2 days' where name = ph;
  perform pg_temp.chk((select count(*) from public.hc_unused_files(1000) u where u like fa || '/%') = 1, 'only photos nothing uses are tidied');

  -- ===== other families and visitors
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.hc_bins where family_id = fa), 'another family sees our bins');
  perform pg_temp.chk(not exists (select 1 from public.hc_repairs where family_id = fa), 'another family sees our repairs');
  perform pg_temp.chk(not public.hc_file_ok(ph, false), 'another family opens our photos');
  begin
    insert into public.hc_repairs (family_id, title) values (fa, 'Sneaky');
    perform pg_temp.chk(false, 'another family added a repair');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    perform public.hc_job_tick(j1, current_date, '');
    perform pg_temp.chk(false, 'another family ticked our job');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    perform public.queue_home_reminders();
    perform pg_temp.chk(false, 'a signed-in person ran the reminders');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(null, null);
  begin
    select count(*) into n from public.hc_jobs;
    perform pg_temp.chk(n = 0, 'a signed-out visitor reads jobs');
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
