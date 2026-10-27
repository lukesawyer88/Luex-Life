-- Luex Life calendar access test. Creates a throwaway family, tries to break every calendar rule, then rolls
-- itself back (it always ends with an error carrying the report). Run after ANY change to calendar access:
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
grant execute on function pg_temp.act(uuid, text), pg_temp.chk(boolean, text) to public;

do $$
declare
  ua uuid := gen_random_uuid(); up uuid := gen_random_uuid(); ug uuid := gen_random_uuid();
  uk uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  fa uuid; fb uuid; ann uuid; pat uuid; gran uuid; kid uuid; tom uuid; ben uuid;
  e_all uuid; e_kid uuid; e_priv uuid; e_series uuid; e_imp uuid; feed uuid; e_pser uuid; e_pov uuid; feed2 uuid; ch3 uuid; tok2 text;
  ch uuid; ch2 uuid; rt uuid; st uuid; rt_tom uuid; st_tom uuid; wl uuid; wi uuid; wl_ann uuid; wi_ann uuid;
  tok text; n int; t text; j jsonb; ok boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'ann@test.dev', 'authenticated', 'authenticated'), (up, 'pat@test.dev', 'authenticated', 'authenticated'),
    (ug, 'gran@test.dev', 'authenticated', 'authenticated'), (uk, 'kid@test.dev', 'authenticated', 'authenticated'),
    (ub, 'ben@test.dev', 'authenticated', 'authenticated');

  -- ===== families: Alpha (Ann + Pat parents, Gran adult member, Kid child, Tom child with no login); Beta (Ben)
  perform pg_temp.act(ub, 'ben@test.dev');
  fb := public.create_family('Beta', 'Ben');
  ben := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev');
  fa := public.create_family('Alpha', 'Ann');
  ann := public.my_member_id();
  insert into public.family_members (family_id, display_name, role, birthday) values (fa, 'Tom', 'child', '2017-03-04') returning id into tom;
  tok := public.create_invite(fa, 'pat@test.dev', 'parent', 'Pat');
  perform pg_temp.act(up, 'pat@test.dev'); perform public.accept_invite(tok); pat := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'gran@test.dev', 'member', 'Gran');
  perform pg_temp.act(ug, 'gran@test.dev'); perform public.accept_invite(tok); gran := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'kid@test.dev', 'child', 'Kid');
  perform pg_temp.act(uk, 'kid@test.dev'); perform public.accept_invite(tok); kid := public.my_member_id();

  -- Pat turns change alerts off
  perform pg_temp.act(up, 'pat@test.dev');
  insert into public.notification_prefs (member_id, family_id, changes) values (pat, fa, 'off');

  -- ===== events: the basics
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.cal_events (family_id, title, type, starts_at, ends_at, people) values
    (fa, 'Football', 'activity', now() + interval '1 day', now() + interval '1 day 1 hour', array[tom]) returning id into e_all;
  select created_by_member = ann and version = 1 into ok from public.cal_events where id = e_all;
  perform pg_temp.chk(ok, 'new event records who added it');
  insert into public.cal_events (family_id, title, starts_at, ends_at, rrule) values
    (fa, 'Swimming', now(), now() + interval '1 hour', 'FREQ=WEEKLY;BYDAY=MO') returning id into e_series;
  -- the surprise: kept to Ann and Pat, even though it is for Kid
  insert into public.cal_events (family_id, title, type, starts_at, ends_at, people, visibility, viewers) values
    (fa, 'Kid surprise party', 'social', now() + interval '3 days', now() + interval '3 days 2 hours', array[kid], 'selected', array[pat])
    returning id into e_priv;
  begin
    insert into public.cal_events (family_id, title, starts_at, ends_at, people) values (fa, 'Bad', now(), now(), array[ben]);
    perform pg_temp.chk(false, 'event can include someone from another family');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.cal_events (family_id, title, starts_at, ends_at, link) values (fa, 'Bad link', now(), now(), 'javascript:alert(1)');
    perform pg_temp.chk(false, 'event link can be a script');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== kid (child)
  perform pg_temp.act(uk, 'kid@test.dev');
  select count(*) into n from public.cal_events where id = e_priv;
  perform pg_temp.chk(n = 0, 'child can see a parent''s private event about them');
  select count(*) into n from public.cal_events where family_id = fa;
  perform pg_temp.chk(n = 2, 'child sees the family''s shared events (saw ' || n || ')');
  insert into public.cal_events (family_id, title, starts_at, ends_at) values (fa, 'PE kit', now(), now()) returning id into e_kid;
  perform pg_temp.chk((select created_by_member from public.cal_events where id = e_kid) = kid, 'child event records the child');
  begin
    insert into public.cal_events (family_id, title, starts_at, ends_at, visibility, viewers) values (fa, 'Secret', now(), now(), 'selected', array[kid]);
    perform pg_temp.chk(false, 'child can hide an event');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.cal_events set title = 'Hacked' where id = e_all; get diagnostics n = row_count;
  perform pg_temp.chk(n = 0, 'child changed a parent''s event');
  update public.cal_events set deleted_at = now() where id = e_all; get diagnostics n = row_count;
  perform pg_temp.chk(n = 0, 'child deleted a parent''s event');
  update public.cal_events set title = 'PE kit and trainers' where id = e_kid; get diagnostics n = row_count;
  perform pg_temp.chk(n = 1, 'child cannot change their own event');
  perform pg_temp.chk((select version from public.cal_events where id = e_kid) = 2, 'version goes up on each change');
  begin
    update public.cal_events set visibility = 'selected', viewers = array[kid] where id = e_kid;
    perform pg_temp.chk(false, 'child made their event private');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.cal_events (family_id, title, starts_at, ends_at, recurrence_of, recurrence_date)
      values (fa, 'Skip', now(), now(), e_series, now());
    perform pg_temp.chk(false, 'child changed one date of a parent''s repeating event');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.cal_comments (family_id, event_id, body) values (fa, e_priv, 'peek');
    perform pg_temp.chk(false, 'child commented on a private event');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.cal_comments (family_id, event_id, body) values (fa, e_all, 'Can I go?');
  select count(*) into n from public.cal_event_log where event_id = e_priv;
  perform pg_temp.chk(n = 0, 'child reads the history of a private event');
  begin
    insert into storage.objects (bucket_id, name, owner) values ('family-files', fa || '/events/' || e_priv || '/x.jpg', uk);
    perform pg_temp.chk(false, 'child uploaded a file to a private event');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into storage.objects (bucket_id, name, owner) values ('family-files', fa || '/events/' || e_all || '/letter.jpg', uk);
  begin
    insert into storage.objects (bucket_id, name, owner) values ('family-files', fa || '/routines/x.jpg', uk);
    perform pg_temp.chk(false, 'child uploaded a routine picture');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.cal_terms (family_id, name, starts_on, ends_on) values (fa, 'Half term', current_date, current_date + 5);
    perform pg_temp.chk(false, 'child added a school holiday');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.cal_day_notes (family_id, day, body) values (fa, current_date, 'No bedtime');
    perform pg_temp.chk(false, 'child wrote a handover note');
  exception when others then perform pg_temp.chk(true, ''); end;
  select count(*) into n from public.cal_feeds; perform pg_temp.chk(n = 0, 'child reads calendar import links');
  begin
    perform public.create_share('Sitter', 'babysitter', '{}', true, 5);
    perform pg_temp.chk(false, 'child made a share link');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.notification_prefs (member_id, family_id, changes) values (ann, fa, 'off');
    perform pg_temp.chk(false, 'child changed a parent''s notification settings');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== Gran (adult member): adds notes and places, cannot change parents' events
  perform pg_temp.act(ug, 'gran@test.dev');
  update public.cal_events set title = 'Hacked' where id = e_all; get diagnostics n = row_count;
  perform pg_temp.chk(n = 0, 'adult member changed a parent''s event');
  select count(*) into n from public.cal_events where id = e_priv; perform pg_temp.chk(n = 0, 'adult member sees a private event');
  insert into public.cal_day_notes (family_id, day, body) values (fa, current_date, 'Tom has a cold');
  insert into public.cal_places (family_id, name, travel_minutes) values (fa, 'School', 15);

  -- ===== Pat (chosen viewer) sees the private event; Ann changes Kid's event (parents can)
  perform pg_temp.act(up, 'pat@test.dev');
  select count(*) into n from public.cal_events where id = e_priv; perform pg_temp.chk(n = 1, 'chosen viewer cannot see the private event');
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.cal_events set title = 'PE kit (checked)' where id = e_kid; get diagnostics n = row_count;
  perform pg_temp.chk(n = 1, 'parent cannot change a child''s event');
  insert into public.cal_events (family_id, title, starts_at, ends_at, recurrence_of, recurrence_date)
    values (fa, 'Swimming (late)', now() + interval '7 days 1 hour', now() + interval '7 days 2 hours', e_series, now() + interval '7 days');
  begin
    update public.cal_events set created_by_member = gran where id = e_all;
    perform pg_temp.chk(false, 'who added an event can be rewritten');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== alerts: Ann hears about Kid's event (grouped); Pat (alerts off) does not; nobody hears about their own; private stays private
  select count(*) into n from public.notifications where kind = 'changes';
  perform pg_temp.chk(n = 1, 'Ann should have one grouped change alert (has ' || n || ')');
  perform pg_temp.act(up, 'pat@test.dev');
  select count(*) into n from public.notifications where kind = 'changes'; perform pg_temp.chk(n = 0, 'alerts sent to someone who turned them off');
  perform pg_temp.act(uk, 'kid@test.dev');
  select count(*) into n from public.notifications where body ilike '%surprise%' or title ilike '%surprise%';
  perform pg_temp.chk(n = 0, 'child alerted about a private event');
  execute 'reset role';
  select count(*) into n from public.notifications where member_id = kid and body ilike '%surprise%';
  perform pg_temp.chk(n = 0, 'an alert about a private event was stored for the child');
  perform pg_temp.act(uk, 'kid@test.dev');
  select count(*) into n from public.notifications where member_id <> kid; perform pg_temp.chk(n = 0, 'child reads other people''s notifications');

  -- ===== imported events are read-only in the app
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true); -- the import service has no signed-in person
  insert into public.cal_feeds (family_id, name, url, created_by_member) values (fa, 'Work', 'https://example.com/a.ics', ann) returning id into feed;
  insert into public.cal_events (family_id, title, starts_at, ends_at, source, feed_id, external_key)
    values (fa, 'Imported', now(), now(), 'import', feed, 'x1') returning id into e_imp;
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    update public.cal_events set title = 'Changed' where id = e_imp;
    perform pg_temp.chk(false, 'imported event changed in the app');
  exception when others then perform pg_temp.chk(true, ''); end;
  select count(*) into n from public.cal_feeds; perform pg_temp.chk(n = 1, 'parent cannot see the import links');

  -- ===== outsider
  perform pg_temp.act(ub, 'ben@test.dev');
  select count(*) into n from public.cal_events where family_id = fa; perform pg_temp.chk(n = 0, 'outsider reads another family''s events');
  select count(*) into n from public.cal_comments where family_id = fa; perform pg_temp.chk(n = 0, 'outsider reads comments');
  select count(*) into n from public.cal_day_notes where family_id = fa; perform pg_temp.chk(n = 0, 'outsider reads handover notes');
  select count(*) into n from storage.objects where bucket_id = 'family-files'; perform pg_temp.chk(n = 0, 'outsider sees family files');
  begin
    insert into public.cal_events (family_id, title, starts_at, ends_at) values (fa, 'Intruder', now(), now());
    perform pg_temp.chk(false, 'outsider added an event to another family');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.cal_events set title = 'x' where family_id = fa; get diagnostics n = row_count;
  perform pg_temp.chk(n = 0, 'outsider changed another family''s events');

  -- ===== chores
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.chores (family_id, title, people, needs_confirm, stars) values (fa, 'Feed the fish', array[kid, tom], true, 3) returning id into ch;
  insert into public.chores (family_id, title, people, mode) values (fa, 'Bins out', array[kid, tom], 'anyone') returning id into ch2;
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    insert into public.chores (family_id, title) values (fa, 'No homework');
    perform pg_temp.chk(false, 'child created a chore');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.chore_done (family_id, chore_id, due_on, for_member) values (fa, ch, current_date, tom);
    perform pg_temp.chk(false, 'child ticked a chore for someone else');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.chore_done (family_id, chore_id, due_on, for_member) values (fa, ch, current_date, kid);
  select stars = 3 and confirmed_at is null into ok from public.chore_done where chore_id = ch and for_member = kid;
  perform pg_temp.chk(ok, 'child tick should wait for a parent and carry the stars');
  update public.chore_done set confirmed_at = now() where chore_id = ch; get diagnostics n = row_count;
  perform pg_temp.chk(n = 0, 'child confirmed their own chore');
  insert into public.chore_done (family_id, chore_id, due_on, for_member) values (fa, ch2, current_date, kid);
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    insert into public.chore_done (family_id, chore_id, due_on, for_member) values (fa, ch2, current_date, tom);
    perform pg_temp.chk(false, 'an "anyone" chore was done twice');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.chore_done set confirmed_at = now() where chore_id = ch and for_member = kid; get diagnostics n = row_count;
  perform pg_temp.chk(n = 1 and (select confirmed_by from public.chore_done where chore_id = ch and for_member = kid) = ann, 'parent cannot confirm');
  perform pg_temp.act(uk, 'kid@test.dev');
  delete from public.chore_done where chore_id = ch and for_member = kid; get diagnostics n = row_count;
  perform pg_temp.chk(n = 0, 'child unticked a chore a parent had confirmed');

  -- ===== routines
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.routines (family_id, member_id, name, stars) values (fa, kid, 'Morning', 2) returning id into rt;
  insert into public.routine_steps (family_id, routine_id, title, position) values (fa, rt, 'Teeth', 1) returning id into st;
  insert into public.routines (family_id, member_id, name) values (fa, tom, 'Bedtime') returning id into rt_tom;
  insert into public.routine_steps (family_id, routine_id, title) values (fa, rt_tom, 'Bath') returning id into st_tom;
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    insert into public.routines (family_id, member_id, name) values (fa, kid, 'No bed');
    perform pg_temp.chk(false, 'child created a routine');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.routine_runs (family_id, routine_id, run_on) values (fa, rt, current_date);
  insert into public.routine_ticks (family_id, routine_id, step_id, done_on) values (fa, rt, st, current_date);
  update public.routine_runs set finished_at = now() where routine_id = rt;
  perform pg_temp.chk((select stars from public.routine_runs where routine_id = rt) = 2, 'finishing a routine did not give its stars');
  update public.routine_runs set finished_at = now() + interval '1 day' where routine_id = rt;
  perform pg_temp.chk((select stars from public.routine_runs where routine_id = rt) = 2, 'stars changed after finishing again');
  begin
    insert into public.routine_ticks (family_id, routine_id, step_id, done_on) values (fa, rt_tom, st_tom, current_date);
    perform pg_temp.chk(false, 'child ticked someone else''s routine');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== wish lists: the surprise rule
  insert into public.wish_lists (family_id, owner_member, occasion, year) values (fa, kid, 'birthday', 2027) returning id into wl;
  insert into public.wish_items (family_id, list_id, title, price) values (fa, wl, 'Lego set', 40) returning id into wi;
  insert into public.wish_items (family_id, list_id, title) values (fa, wl, 'Book');
  begin
    insert into public.wish_claims (item_id) values (wi);
    perform pg_temp.chk(false, 'child claimed from their own list');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ug, 'gran@test.dev');
  insert into public.wish_claims (item_id) values (wi);
  update public.wish_items set title = 'Hacked' where list_id = wl; get diagnostics n = row_count;
  perform pg_temp.chk(n = 0, 'adult member changed a child''s wish list');
  perform pg_temp.act(uk, 'kid@test.dev');
  select count(*) into n from public.wish_claims; perform pg_temp.chk(n = 0, 'list owner can see who is buying what');
  delete from public.wish_claims where item_id = wi; get diagnostics n = row_count;
  perform pg_temp.chk(n = 0, 'list owner removed a claim');
  update public.wish_claims set bought = true where item_id = wi; get diagnostics n = row_count;
  perform pg_temp.chk(n = 0, 'list owner changed a claim');
  perform pg_temp.act(ua, 'ann@test.dev');
  select count(*) into n from public.wish_claims where list_id = wl; perform pg_temp.chk(n = 1, 'parent cannot see claims on a child''s list');
  update public.wish_items set price = 35 where id = wi; get diagnostics n = row_count;
  perform pg_temp.chk(n = 1, 'parent cannot help with a child''s list');
  update public.wish_claims set bought = true where item_id = wi; get diagnostics n = row_count;
  perform pg_temp.chk(n = 0, 'someone changed another person''s claim');
  -- Ann's own list: Ann must not see claims either
  insert into public.wish_lists (family_id, owner_member, occasion, year) values (fa, ann, 'christmas', 2026) returning id into wl_ann;
  insert into public.wish_items (family_id, list_id, title) values (fa, wl_ann, 'Perfume') returning id into wi_ann;
  perform pg_temp.act(up, 'pat@test.dev');
  insert into public.wish_claims (item_id) values (wi_ann);
  update public.wish_items set title = 'x' where id = wi_ann; get diagnostics n = row_count;
  perform pg_temp.chk(n = 0, 'one parent edited the other parent''s list');
  -- Kid added two things and Ann changed a price: Pat gets ONE alert counting 3 changes
  select count(*) into n from public.notifications where kind = 'wishlist' and title like 'Kid%';
  perform pg_temp.chk(n = 1, 'wish list alerts not grouped into one (' || n || ' alerts)');
  select max(count) into n from public.notifications where kind = 'wishlist' and title like 'Kid%';
  perform pg_temp.chk(n = 3, 'wish list alert count wrong (' || coalesce(n, 0) || ')');
  perform pg_temp.act(ua, 'ann@test.dev');
  select count(*) into n from public.wish_claims where list_id = wl_ann; perform pg_temp.chk(n = 0, 'parent sees claims on their own list');
  perform pg_temp.act(uk, 'kid@test.dev');
  select count(*) into n from public.notifications where kind = 'wishlist'; perform pg_temp.chk(n = 0, 'child got their own wish list alert');


  -- ===== review fixes: a changed date of a private repeating event stays private
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.cal_events (family_id, title, starts_at, ends_at, rrule, visibility, viewers)
    values (fa, 'Secret therapy', now(), now() + interval '1 hour', 'FREQ=WEEKLY', 'selected', '{}') returning id into e_pser;
  insert into public.cal_events (family_id, title, starts_at, ends_at, recurrence_of, recurrence_date)
    values (fa, 'Secret therapy (moved)', now() + interval '7 days 2 hours', now() + interval '7 days 3 hours', e_pser, now() + interval '7 days')
    returning id into e_pov;
  perform pg_temp.chk((select visibility from public.cal_events where id = e_pov) = 'selected', 'a changed date of a private event became public');
  perform pg_temp.act(uk, 'kid@test.dev');
  select count(*) into n from public.cal_events where title like 'Secret therapy%'; perform pg_temp.chk(n = 0, 'child sees a changed date of a private event');
  select count(*) into n from public.notifications where body ilike '%therapy%'; perform pg_temp.chk(n = 0, 'child alerted about a private event''s changed date');
  perform pg_temp.act(up, 'pat@test.dev');
  begin
    insert into public.cal_events (family_id, title, starts_at, ends_at, recurrence_of, recurrence_date)
      values (fa, 'Probe', now(), now(), e_pser, now() + interval '14 days');
    perform pg_temp.chk(false, 'a parent who cannot see a private series added a date to it');
  exception when others then perform pg_temp.chk(true, ''); end;
  -- making an event private removes waiting alerts for people who can no longer see it; the series' audience reaches its changed dates
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.cal_events set visibility = 'selected', viewers = '{}' where id = e_series;
  perform pg_temp.chk((select visibility from public.cal_events where recurrence_of = e_series limit 1) = 'selected', 'changed dates did not follow their series when it was made private');
  execute 'reset role';
  select count(*) into n from public.notifications where member_id in (kid, gran) and link like '%' || e_series || '%';
  perform pg_temp.chk(n = 0, 'alerts about an event stayed with people after it was made private');
  -- a parent restricts a child's event: the child cannot undo it
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.cal_events set visibility = 'selected', viewers = array[ann] where id = e_kid;
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    update public.cal_events set visibility = 'all' where id = e_kid;
    perform pg_temp.chk(false, 'child un-hid an event a parent made private');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.cal_events (family_id, title, starts_at, ends_at, visibility, viewers) values (fa, 'x', now(), now(), 'all', '{}');
    perform pg_temp.chk(true, '');
  exception when others then perform pg_temp.chk(false, 'child cannot add an ordinary event'); end;
  -- private viewers must have a login
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    insert into public.cal_events (family_id, title, starts_at, ends_at, visibility, viewers) values (fa, 'x', now(), now(), 'selected', array[tom]);
    perform pg_temp.chk(false, 'a profile without a login was chosen to see a private event');
  exception when others then perform pg_temp.chk(true, ''); end;
  -- one parent's private calendar import stays private from the other parent
  insert into public.cal_feeds (family_id, name, url, visibility, viewers) values (fa, 'Ann private', 'https://example.com/ann.ics', 'selected', '{}') returning id into feed2;
  perform pg_temp.act(up, 'pat@test.dev');
  select count(*) into n from public.cal_feeds where id = feed2; perform pg_temp.chk(n = 0, 'a parent reads the other parent''s private import link');
  update public.cal_feeds set visibility = 'all' where id = feed2; get diagnostics n = row_count;
  perform pg_temp.chk(n = 0, 'a parent opened up the other parent''s private import');
  -- outsiders cannot test who is in a family
  perform pg_temp.act(ub, 'ben@test.dev');
  begin
    perform public.members_in_family(fa, array[kid]);
    perform pg_temp.chk(false, 'outsider can test who is in another family');
  exception when others then perform pg_temp.chk(true, ''); end;
  -- "anyone" chores are only for the people listed
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.chores (family_id, title, people, mode, stars) values (fa, 'Wash the car', array[tom], 'anyone', 50) returning id into ch3;
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    insert into public.chore_done (family_id, chore_id, due_on, for_member) values (fa, ch3, current_date, kid);
    perform pg_temp.chk(false, 'child took stars for a chore that was not theirs');
  exception when others then perform pg_temp.chk(true, ''); end;
  -- routines: not tomorrow, not finished without ticking every step
  begin
    insert into public.routine_runs (family_id, routine_id, run_on) values (fa, rt, current_date + 1);
    perform pg_temp.chk(false, 'child started tomorrow''s routine');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.routine_steps (family_id, routine_id, title, position) values (fa, rt, 'Shoes', 2);
  insert into public.routine_runs (family_id, routine_id, run_on) values (fa, rt, current_date - 1);
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    update public.routine_runs set finished_at = now() where routine_id = rt and run_on = current_date - 1;
    perform pg_temp.chk(false, 'routine finished without ticking every step');
  exception when others then perform pg_temp.chk(true, ''); end;


  -- ===== second review: changed-date creators lose access with the series; no back-dated chore stars
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.cal_events set viewers = array[pat] where id = e_pser;
  perform pg_temp.act(up, 'pat@test.dev');
  insert into public.cal_events (family_id, title, starts_at, ends_at, recurrence_of, recurrence_date)
    values (fa, 'Pat moved it', now() + interval '21 days', now() + interval '21 days 1 hour', e_pser, now() + interval '21 days')
    returning id into e_pov;
  insert into public.cal_comments (family_id, event_id, body) values (fa, e_pov, 'note');
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.cal_events set viewers = '{}' where id = e_pser;
  perform pg_temp.act(up, 'pat@test.dev');
  perform pg_temp.chk(not public.can_see_event(e_pov), 'the person who moved a date keeps access after being removed from the series');
  select count(*) into n from public.cal_comments where event_id = e_pov; perform pg_temp.chk(n = 0, 'removed viewer still reads comments on a changed date');
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.chores (family_id, title, people, stars, rrule) values (fa, 'Saturday hoover', array[kid], 100, 'FREQ=WEEKLY;BYDAY=SA') returning id into ch3;
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    insert into public.chore_done (family_id, chore_id, due_on, for_member) values (fa, ch3, current_date - 5, kid);
    perform pg_temp.chk(false, 'child back-dated a chore tick');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== share links
  perform pg_temp.act(ua, 'ann@test.dev');
  tok := public.create_share('Sitter Sat', 'babysitter', '{}', true, 6);
  begin
    perform token_hash from public.cal_shares;
    perform pg_temp.chk(false, 'share token hash is readable');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(null, null);
  j := public.shared_calendar(tok, now() - interval '1 day', now() + interval '10 days');
  perform pg_temp.chk(j is not null and j->>'family' = 'Alpha', 'share link does not open');
  perform pg_temp.chk(position('surprise' in lower(j::text)) = 0, 'share link shows a private event');
  perform pg_temp.chk(position('Football' in j::text) > 0, 'share link misses a shared event');
  perform pg_temp.chk(position('Tom has a cold' in j::text) > 0, 'babysitter link misses the handover note');
  perform pg_temp.chk(position('kid@test.dev' in j::text) = 0 and position('avatar' in j::text) = 0, 'share link leaks emails or pictures');
  perform pg_temp.chk(public.shared_calendar('nope', now(), now() + interval '1 day') is null, 'a made-up share token opened something');
  begin
    select count(*) into n from public.cal_events;
    perform pg_temp.chk(n = 0, 'signed-out visitor reads events');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.cal_shares set revoked_at = now();
  perform pg_temp.act(null, null);
  perform pg_temp.chk(public.shared_calendar(tok, now(), now() + interval '1 day') is null, 'a stopped share link still works');

  -- ===== push devices
  perform pg_temp.act(uk, 'kid@test.dev');
  perform public.save_push_subscription('https://push.example/abc', 'k', 'a', 'test');
  perform pg_temp.act(ua, 'ann@test.dev');
  perform public.save_push_subscription('https://push.example/abc', 'k', 'a', 'test');
  select count(*) into n from public.push_subscriptions; perform pg_temp.chk(n = 1, 'device did not move to the new person');
  perform pg_temp.act(uk, 'kid@test.dev');
  select count(*) into n from public.push_subscriptions; perform pg_temp.chk(n = 0, 'someone sees another person''s devices');
  perform pg_temp.act(ub, 'ben@test.dev');
  begin
    perform public.save_push_subscription('https://push.example/abc', 'evil', 'evil', 'test');
    perform pg_temp.chk(false, 'someone took over another person''s device');
  exception when others then perform pg_temp.chk(true, ''); end;

  execute 'reset role';
  select count(*) filter (where passed), string_agg(case when not passed then E'\nFAIL: ' || msg end, '')
    into n, t from t_results;
  if (select count(*) from t_results where not passed) = 0 then
    raise exception 'REPORT: ALL % CHECKS PASSED', n;
  else
    raise exception 'REPORT: % passed, % FAILED%', n, (select count(*) from t_results where not passed), t;
  end if;
end $$;
