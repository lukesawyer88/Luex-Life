-- Luex Life Family Board access test. Creates throwaway families, tries to break every Board rule, then rolls
-- itself back (it always ends with an error carrying the report). Run after ANY change to Board access:
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
  uk uuid := gen_random_uuid(); ut uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  fa uuid; fb uuid; ann uuid; pat uuid; gran uuid; kid uuid; teen uuid; tom uuid; ben uuid;
  fam uuid; famb uuid; dkg uuid; dtg uuid; dag uuid; grp uuid; m1 uuid; m2 uuid; mk uuid; ma uuid; poll uuid;
  o1 uuid; o2 uuid; req uuid; loc uuid; li uuid; it uuid; nt uuid; gl uuid; st uuid; al uuid; mem uuid; mem2 uuid;
  tok text; n int; t text; ok boolean; j jsonb; ts timestamptz;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'ann@test.dev', 'authenticated', 'authenticated'), (up, 'pat@test.dev', 'authenticated', 'authenticated'),
    (ug, 'gran@test.dev', 'authenticated', 'authenticated'), (uk, 'kid@test.dev', 'authenticated', 'authenticated'),
    (ut, 'teen@test.dev', 'authenticated', 'authenticated'), (ub, 'ben@test.dev', 'authenticated', 'authenticated');

  -- Alpha: Ann + Pat parents, Gran adult, Kid (no birthday) and Teen (15) children with logins, Tom (no login). Beta: Ben.
  perform pg_temp.act(ub, 'ben@test.dev');
  fb := public.create_family('Beta', 'Ben'); ben := public.my_member_id(); famb := public.board_family_thread();
  perform pg_temp.act(ua, 'ann@test.dev');
  fa := public.create_family('Alpha', 'Ann'); ann := public.my_member_id();
  insert into public.family_members (family_id, display_name, role, birthday) values (fa, 'Tom', 'child', '2017-03-04') returning id into tom;
  tok := public.create_invite(fa, 'pat@test.dev', 'parent', 'Pat');
  perform pg_temp.act(up, 'pat@test.dev'); perform public.accept_invite(tok); pat := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'gran@test.dev', 'member', 'Gran');
  perform pg_temp.act(ug, 'gran@test.dev'); perform public.accept_invite(tok); gran := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'kid@test.dev', 'child', 'Kid');
  perform pg_temp.act(uk, 'kid@test.dev'); perform public.accept_invite(tok); kid := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'teen@test.dev', 'child', 'Teen');
  perform pg_temp.act(ut, 'teen@test.dev'); perform public.accept_invite(tok); teen := public.my_member_id();
  perform pg_temp.sys();
  update public.family_members set birthday = current_date - interval '15 years' where id = teen;
  update public.board_settings set parents_can_read = public.board_default_parents_read('child', (current_date - interval '15 years')::date) where member_id = teen;

  -- ===== settings
  select count(*) into n from public.board_settings where family_id = fa;
  perform pg_temp.chk(n = 6, 'everyone gets Board settings');
  perform pg_temp.chk((select parents_can_read from public.board_settings where member_id = tom), 'under-13 chats are open to parents by default');
  perform pg_temp.chk(not (select parents_can_read from public.board_settings where member_id = teen), 'teenager chats are closed to parents by default');
  perform pg_temp.chk(not (select parents_can_read from public.board_settings where member_id = gran), 'grown-ups'' chats are never open to parents');

  perform pg_temp.act(ut, 'teen@test.dev');
  select count(*) into n from public.board_settings; perform pg_temp.chk(n = 1, 'a child sees only their own settings');
  perform pg_temp.chk((select parents_can_read from public.board_settings where member_id = teen) is not null, 'a child can see whether parents read their chats');
  begin
    update public.board_settings set parents_can_read = false, chat = true where member_id = teen;
    update public.board_settings set photos = false where member_id = teen;
    perform pg_temp.chk(false, 'a child changed their own switches');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.board_settings set quiet_from = '23:00', quiet_to = '06:00' where member_id = teen;
    perform pg_temp.chk(false, 'a child changed their own quiet hours');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.board_settings set alerts = 'mentions' where member_id = teen;
  perform pg_temp.chk((select alerts from public.board_settings where member_id = teen) = 'mentions', 'a child can choose how much the Board notifies them');
  update public.board_settings set alerts = 'all' where member_id = teen;
  perform pg_temp.act(ug, 'gran@test.dev');
  update public.board_settings set quiet_from = '21:00', quiet_to = '07:00' where member_id = gran;
  perform pg_temp.chk((select quiet_from from public.board_settings where member_id = gran) = '21:00', 'a grown-up sets their own quiet hours');
  update public.board_settings set quiet_from = null, quiet_to = null where member_id = gran;
  update public.board_settings set chat = false where member_id = kid;
  get diagnostics n = row_count; perform pg_temp.chk(n = 0, 'a grown-up who is not a parent changed a child''s switches');
  perform pg_temp.act(ub, 'ben@test.dev');
  update public.board_settings set chat = false where member_id = kid;
  get diagnostics n = row_count; perform pg_temp.chk(n = 0, 'another family changed a child''s switches');

  -- ===== family chat
  perform pg_temp.act(ua, 'ann@test.dev');
  fam := public.board_family_thread();
  perform pg_temp.chk(fam = public.board_family_thread(), 'there is only one family chat');
  insert into public.board_messages (family_id, thread_id, body) values (fa, fam, 'Tea at 6') returning id into m1;
  perform pg_temp.chk((select author from public.board_messages where id = m1) = ann, 'a message records who sent it');
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk(exists (select 1 from public.board_messages where id = m1), 'family can read the family chat');
  perform pg_temp.chk((select count(*) from public.notifications where member_id <> gran) = 0, 'someone sees another person''s notifications');
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.board_messages where id = m1), 'another family reads our chat');
  perform pg_temp.chk(not exists (select 1 from public.board_threads where id = fam), 'another family sees our chat');
  begin
    insert into public.board_messages (family_id, thread_id, body) values (fa, fam, 'hello');
    perform pg_temp.chk(false, 'another family posted in our chat');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.board_messages (family_id, thread_id, body) values (fb, fam, 'hello');
    perform pg_temp.chk(false, 'a message was slipped into another family''s chat');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.board_messages (family_id, thread_id, body, author) values (fb, famb, 'x', ann);
    perform pg_temp.chk(false, 'someone sent a message as someone else');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where member_id = gran and kind = 'message') = 1, 'family hear about a new message');
  perform pg_temp.chk((select count(*) from public.notifications where member_id = tom) = 0, 'people without a login get no alerts');

  -- grouped alerts
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.board_messages (family_id, thread_id, body, client_id) values (fa, fam, 'Bring coats', 'dev-1') returning id into m2;
  perform pg_temp.sys();
  select count(*) into n from public.notifications where member_id = gran and kind = 'message';
  perform pg_temp.chk(n = 1 and (select count from public.notifications where member_id = gran and kind = 'message') = 2,
    'several messages make one grouped alert');
  -- a message sent twice after a lost signal is saved once
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    insert into public.board_messages (family_id, thread_id, body, client_id) values (fa, fam, 'Bring coats', 'dev-1');
    perform pg_temp.chk(false, 'a resent message was saved twice');
  exception when unique_violation then perform pg_temp.chk(true, ''); end;

  -- mute and mentions
  perform pg_temp.act(up, 'pat@test.dev');
  perform public.board_set_mute(fam, true);
  perform pg_temp.sys(); delete from public.notifications where member_id = pat;
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.board_messages (family_id, thread_id, body) values (fa, fam, 'Anyone seen my keys?');
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where member_id = pat) = 0, 'a muted chat still sent an alert');
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.board_messages (family_id, thread_id, body, mentions) values (fa, fam, '@Pat keys?', array[pat, ben]);
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where member_id = pat and kind = 'mention') = 1, 'being tagged gets through a mute');
  perform pg_temp.chk((select count(*) from public.notifications where member_id = ben) = 0, 'tagging someone outside the family reached them');

  -- quiet hours hold alerts back
  update public.board_settings set quiet_from = (now() at time zone 'Europe/London')::time - interval '1 hour',
    quiet_to = (now() at time zone 'Europe/London')::time + interval '1 hour' where member_id = gran;
  delete from public.notifications where member_id = gran;
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.board_messages (family_id, thread_id, body) values (fa, fam, 'Night all');
  perform pg_temp.sys();
  perform pg_temp.chk((select send_after from public.notifications where member_id = gran and kind = 'message') > now() + interval '50 minutes',
    'quiet hours hold alerts until they end');
  update public.board_settings set quiet_from = null, quiet_to = null where member_id = gran;

  -- edit and remove
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    update public.board_messages set body = 'hacked' where id = m1;
    perform pg_temp.chk(false, 'someone edited another person''s message');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.board_messages set deleted_at = now() where id = m1;
    perform pg_temp.chk(false, 'a grown-up removed someone else''s message');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.board_messages set body = 'Tea at 6.30' where id = m1;
  perform pg_temp.chk((select edited_at is not null from public.board_messages where id = m1), 'edits are marked as edited');
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.board_messages (family_id, thread_id, body) values (fa, fam, 'rude word') returning id into mk;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.board_messages set deleted_at = now() where id = mk;
  perform pg_temp.chk((select deleted_by from public.board_messages where id = mk) = ann, 'a parent can remove a child''s message');
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    update public.board_messages set deleted_at = null where id = mk;
    perform pg_temp.chk(false, 'a child brought back a message a parent removed');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.board_messages set deleted_at = null where id = mk;
  perform pg_temp.chk((select deleted_at is null from public.board_messages where id = mk), 'undo brings a message back');
  update public.board_messages set pinned_at = now() where id = m1;
  perform pg_temp.chk((select pinned_by from public.board_messages where id = m1) = ann, 'pinning records who pinned');
  begin
    update public.board_messages set kind = 'announcement' where id = m1;
    perform pg_temp.chk(false, 'a message''s type was changed');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- announcements
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    insert into public.board_messages (family_id, thread_id, kind, body) values (fa, fam, 'announcement', 'Hear ye');
    perform pg_temp.chk(false, 'someone who is not a parent made an announcement');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.board_messages (family_id, thread_id, kind, body) values (fa, fam, 'announcement', 'School closed Friday') returning id into ma;
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.board_acks (message_id, member_id, family_id) values (ma, ann, fa);
  perform pg_temp.chk((select member_id from public.board_acks where message_id = ma) = kid, '"Got it" is stamped with who tapped it');
  begin
    insert into public.board_acks (message_id, member_id, family_id) values (m1, kid, fa);
    perform pg_temp.chk(false, '"Got it" on an ordinary message');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- reactions
  perform pg_temp.act(ug, 'gran@test.dev');
  select activity_at into ts from public.board_messages where id = m1;
  insert into public.board_reactions (message_id, member_id, family_id, emoji) values (m1, gran, fa, '❤️');
  perform pg_temp.chk((select activity_at from public.board_messages where id = m1) >= ts, 'reactions nudge the message');
  perform pg_temp.act(ub, 'ben@test.dev');
  begin
    insert into public.board_reactions (message_id, member_id, family_id, emoji) values (m1, ben, fb, '😂');
    perform pg_temp.chk(false, 'another family reacted to our message');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.chk(not exists (select 1 from public.board_reactions where message_id = m1), 'another family sees our reactions');
  perform pg_temp.act(uk, 'kid@test.dev');
  delete from public.board_reactions where message_id = m1;
  get diagnostics n = row_count; perform pg_temp.chk(n = 0, 'someone removed another person''s reaction');

  -- ===== private chats
  perform pg_temp.act(uk, 'kid@test.dev');
  dkg := public.board_open_direct(gran);
  perform pg_temp.chk(dkg = public.board_open_direct(gran), 'one direct chat per pair');
  insert into public.board_messages (family_id, thread_id, body) values (fa, dkg, 'Hi Gran') returning id into m2;
  perform pg_temp.act(ut, 'teen@test.dev');
  dtg := public.board_open_direct(gran);
  insert into public.board_messages (family_id, thread_id, body) values (fa, dtg, 'Secret plan');
  perform pg_temp.chk(not exists (select 1 from public.board_messages where thread_id = dkg), 'a brother or sister reads a private chat');
  perform pg_temp.act(ug, 'gran@test.dev');
  dag := public.board_open_direct(ann);
  insert into public.board_messages (family_id, thread_id, body) values (fa, dag, 'Present ideas for Pat?');
  perform pg_temp.act(up, 'pat@test.dev');
  perform pg_temp.chk(exists (select 1 from public.board_messages where id = m2), 'parents can read an under-13''s chats');
  perform pg_temp.chk(not exists (select 1 from public.board_messages where thread_id = dtg), 'parents read a teenager''s chats without permission');
  perform pg_temp.chk(not exists (select 1 from public.board_messages where thread_id = dag), 'a parent reads two grown-ups'' private chat');
  begin
    insert into public.board_messages (family_id, thread_id, body) values (fa, dkg, 'Pat here');
    perform pg_temp.chk(false, 'a parent reading a child''s chat posted in it');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.board_messages set deleted_at = now() where id = m2;
  perform pg_temp.chk((select deleted_by from public.board_messages where id = m2) = pat, 'a parent removes a message in a child''s chat they can read');
  update public.board_settings set parents_can_read = true where member_id = teen;
  perform pg_temp.chk(exists (select 1 from public.board_messages where thread_id = dtg), 'parents read a teenager''s chats once switched on');
  update public.board_settings set parents_can_read = false where member_id = teen;
  perform pg_temp.chk(not (select exists (select 1 from public.board_unread() where thread_id = dkg)), 'chats a parent only reads show as theirs');
  perform pg_temp.act(ub, 'ben@test.dev');
  begin
    perform public.board_open_direct(ann);
    perform pg_temp.chk(false, 'someone opened a chat with another family');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    perform public.board_open_direct(tom);
    perform pg_temp.chk(false, 'a chat with someone with no login');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- groups
  perform pg_temp.act(ua, 'ann@test.dev');
  grp := public.board_create_group('Parents', '👪', array[pat]);
  perform pg_temp.chk((select count(*) from public.board_thread_people where thread_id = grp) = 2, 'group has the people chosen');
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.board_threads where id = grp), 'someone outside a group sees it');
  begin
    perform public.board_set_group_people(grp, array[ann, pat, gran]);
    perform pg_temp.chk(false, 'someone outside a group added themselves');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.board_threads set title = 'Mine' where id = dag;
    perform pg_temp.chk(false, 'a direct chat was renamed');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(up, 'pat@test.dev');
  perform public.board_leave_group(grp);
  perform pg_temp.chk(not exists (select 1 from public.board_threads where id = grp), 'leaving a group stops you seeing it');

  -- children's switches
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.board_settings set private_chats = false where member_id = kid;
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.board_threads where id = dkg), 'private chats switched off still show');
  begin
    perform public.board_open_direct(teen);
    perform pg_temp.chk(false, 'a child opened a private chat when switched off');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.board_settings set chat = false, private_chats = true where member_id = kid;
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.board_messages where thread_id = fam), 'a child with chat switched off reads chats');
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.board_settings set chat = true, photos = false, location = false where member_id = kid;
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    insert into public.board_messages (family_id, thread_id, kind, body) values (fa, fam, 'photo', '');
    perform pg_temp.chk(false, 'a child posted a photo when switched off');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    perform public.board_share_location(dkg, null, 51.5, -0.1, 10, null);
    perform pg_temp.chk(false, 'a child shared their location when switched off');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.board_settings set photos = true, location = true where member_id = kid;

  -- ===== polls
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    insert into public.board_messages (family_id, thread_id, kind, body) values (fa, fam, 'poll', 'Fake');
    perform pg_temp.chk(false, 'a poll was made without its answers');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  poll := public.board_create_poll(fam, 'Pizza or curry?', 'choice', false, '[{"label":"Pizza"},{"label":"Curry"}]'::jsonb, null);
  select id into o1 from public.board_poll_options where message_id = poll and label = 'Pizza';
  select id into o2 from public.board_poll_options where message_id = poll and label = 'Curry';
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.board_poll_votes (option_id, message_id, member_id, family_id) values (o1, poll, ann, fa);
  insert into public.board_poll_votes (option_id, message_id, member_id, family_id) values (o2, poll, ann, fa);
  perform pg_temp.chk((select count(*) from public.board_poll_votes where member_id = kid) = 1
    and (select option_id from public.board_poll_votes where member_id = kid) = o2, 'a new vote replaces the old one');
  perform pg_temp.chk((select member_id from public.board_poll_votes where option_id = o2) = kid, 'a vote is stamped with who voted');
  perform pg_temp.act(ub, 'ben@test.dev');
  begin
    insert into public.board_poll_votes (option_id, message_id, member_id, family_id) values (o1, poll, ben, fb);
    perform pg_temp.chk(false, 'another family voted in our poll');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    update public.board_polls set closed_at = now() where message_id = poll;
    perform pg_temp.chk(false, 'someone closed a poll they did not ask');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.board_polls set closed_at = now() where message_id = poll;
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    insert into public.board_poll_votes (option_id, message_id, member_id, family_id) values (o1, poll, kid, fa);
    perform pg_temp.chk(false, 'a vote in a closed poll');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== "Where are you?"
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    insert into public.board_messages (family_id, thread_id, kind, ask_member) values (fa, dkg, 'location_request', ann);
    perform pg_temp.chk(false, 'asked where someone is who is not in the chat');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.board_messages (family_id, thread_id, kind, ask_member) values (fa, dkg, 'location_request', gran) returning id into req;
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where member_id = gran and kind = 'location') = 1, 'the person asked gets a notification');
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    insert into public.board_messages (family_id, thread_id, kind) values (fa, dkg, 'location');
    perform pg_temp.chk(false, 'a place was shared without its own function');
  exception when others then perform pg_temp.chk(true, ''); end;
  loc := public.board_share_location(dkg, req, 51.5, -0.12, 20, 'g-1');
  perform pg_temp.chk((select kid = any(mentions) from public.board_messages where id = loc), 'the answer is sent to whoever asked');
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(exists (select 1 from public.board_locations where message_id = loc), 'the person who asked sees the place');
  perform pg_temp.act(ut, 'teen@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.board_locations where message_id = loc), 'someone outside the chat sees a shared place');
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.board_locations where message_id = loc), 'another family sees a shared place');
  perform pg_temp.sys();
  update public.board_locations set expires_at = now() - interval '1 minute' where message_id = loc;
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.board_locations where message_id = loc), 'a shared place is still visible after an hour');
  perform pg_temp.sys(); perform public.board_tidy_places();
  perform pg_temp.chk(not exists (select 1 from public.board_locations where message_id = loc), 'old places are wiped');

  -- ===== photos and files
  perform pg_temp.sys();
  insert into storage.objects (bucket_id, name, owner, metadata) values
    ('board-media', fa || '/board/t/' || fam || '/a.jpg', ua, '{"size": 2048}'),
    ('board-media', fa || '/board/a/b.jpg', ua, '{"size": 4096}');
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    insert into public.board_media (family_id, thread_id, path, kind, mime) values (fa, fam, fa || '/board/t/' || fam || '/missing.jpg', 'photo', 'image/jpeg');
    perform pg_temp.chk(false, 'a photo was recorded without the file');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.board_media (family_id, thread_id, path, kind, mime) values (fa, fam, fa || '/board/t/' || fam || '/a.jpg', 'photo', 'image/jpeg');
  perform pg_temp.chk((select bytes from public.board_media where path like '%/a.jpg') = 2048, 'the size comes from the stored file');
  insert into public.board_albums (family_id, title) values (fa, 'Summer') returning id into al;
  insert into public.board_media (family_id, album_id, path, kind, mime) values (fa, al, fa || '/board/a/b.jpg', 'photo', 'image/jpeg');
  begin
    insert into public.board_media (family_id, path, kind, mime, duration_s) values (fa, fa || '/board/a/b.jpg', 'video', 'video/mp4', 400);
    perform pg_temp.chk(false, 'a video longer than 3 minutes');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.board_media (family_id, thread_id, path, kind, mime) values (fa, dkg, fa || '/board/t/' || fam || '/a.jpg', 'photo', 'image/jpeg');
    perform pg_temp.chk(false, 'a photo filed under a chat it was not stored in');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.chk(public.board_file_ok(fa || '/board/a/new.jpg', true), 'a family member can upload to the album');
  perform pg_temp.chk(not public.board_file_ok(fa || '/board/t/' || dtg || '/x.jpg', false), 'a parent opens files from a teenager''s chat');
  perform pg_temp.chk(not public.board_file_ok(fa || '/events/x.jpg', false), 'a file outside the Board folder');
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not public.board_file_ok(fa || '/board/a/b.jpg', false), 'another family opens our album files');
  perform pg_temp.chk(not exists (select 1 from public.board_media where family_id = fa), 'another family sees our photos');
  begin
    insert into storage.objects (bucket_id, name, owner) values ('board-media', fa || '/board/a/evil.jpg', ub);
    perform pg_temp.chk(false, 'another family uploaded into our album');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ug, 'gran@test.dev');
  update public.board_media set caption = 'mine now' where path like '%/b.jpg';
  get diagnostics n = row_count; perform pg_temp.chk(n = 0, 'someone changed another person''s photo');
  -- the allowance
  perform pg_temp.sys();
  insert into storage.objects (bucket_id, name, owner, metadata) values ('board-media', fa || '/board/a/huge.mov', ua, '{"size": 53687091200}');
  perform pg_temp.act(ua, 'ann@test.dev');
  perform pg_temp.chk(not public.board_file_ok(fa || '/board/a/more.jpg', true), 'uploads carry on past the family allowance');
  perform pg_temp.chk((select used from public.board_storage()) >= 53687091200, 'the family can see how much space they have used');

  -- album links
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    perform public.board_create_album_share(al, 'Grandad', 7);
    perform pg_temp.chk(false, 'a child made an album link');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  tok := public.board_create_album_share(al, 'Grandad', 7);
  perform pg_temp.sys();
  j := public.shared_album(tok);
  perform pg_temp.chk(j ->> 'title' = 'Summer' and jsonb_array_length(j -> 'items') = 1, 'an album link shows the album');
  perform pg_temp.chk(public.shared_album('wrong') is null, 'a wrong link shows something');
  perform pg_temp.act(null, null);
  begin
    perform public.shared_album(tok);
    perform pg_temp.chk(false, 'a signed-out visitor called the album lookup directly');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.board_album_shares set revoked_at = now();
  perform pg_temp.sys();
  perform pg_temp.chk(public.shared_album(tok) is null, 'a stopped album link still works');

  -- ===== journal and memories
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.board_memories (family_id, kind, body, audience, prompt_id)
    values (fa, 'journal', 'I laughed at the dog', 'private', (select id from public.board_prompts where family_id is null limit 1)) returning id into mem;
  perform pg_temp.chk((select prompt_text is not null from public.board_memories where id = mem), 'a journal answer keeps its question');
  perform pg_temp.act(ua, 'ann@test.dev');
  perform pg_temp.chk(exists (select 1 from public.board_memories where id = mem), 'parents see a child''s journal');
  begin
    update public.board_memories set audience = 'family' where id = mem;
    perform pg_temp.chk(false, 'a parent made a child''s private journal public');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.board_memories where id = mem), 'a grandparent reads a child''s private journal');
  perform pg_temp.act(ut, 'teen@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.board_memories where id = mem), 'a brother or sister reads a private journal');
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.board_settings set journal_parents_see = false where member_id = teen;
  perform pg_temp.act(ut, 'teen@test.dev');
  insert into public.board_memories (family_id, kind, body, audience) values (fa, 'journal', 'Diary', 'private') returning id into mem2;
  perform pg_temp.act(ua, 'ann@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.board_memories where id = mem2), 'parents read a journal they agreed not to');
  perform pg_temp.chk(not public.board_file_ok(fa || '/board/m/' || mem2 || '/p.jpg', false), 'parents open photos in a closed journal');
  insert into public.board_memories (family_id, kind, title, milestone_for, people) values (fa, 'milestone', 'First steps', tom, array[gran]) returning id into mem;
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where member_id = gran and kind = 'memory') = 1, 'tagged people hear about a memory');
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    insert into public.board_memories (family_id, kind, title, milestone_for) values (fa, 'milestone', 'x', ben);
    perform pg_temp.chk(false, 'a milestone for someone in another family');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.board_memories where family_id = fa), 'another family sees our memories');

  -- ===== lists
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.board_lists (family_id, title) values (fa, 'Jobs') returning id into li;
  insert into public.board_list_items (list_id, family_id, text, assignee) values (li, fa, 'Paint shed', gran) returning id into it;
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(exists (select 1 from public.board_list_items where id = it), 'everyone sees every list item, even if it is given to someone');
  insert into public.board_list_items (list_id, family_id, text) values (li, fa, 'Feed fish');
  update public.board_list_items set done_at = now() where id = it;
  perform pg_temp.chk((select done_by from public.board_list_items where id = it) = kid, 'ticks record who ticked');
  update public.board_list_items set position = 5 where id = it;
  perform pg_temp.chk((select position from public.board_list_items where id = it) = 5, 'anyone can reorder');
  begin
    update public.board_list_items set text = 'Nothing' where id = it;
    perform pg_temp.chk(false, 'a child changed someone else''s list item');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.board_lists set title = 'Kid rules' where id = li;
    perform pg_temp.chk(false, 'a child renamed someone else''s list');
  exception when others then perform pg_temp.chk(true, ''); end;
  delete from public.board_list_items where id = it;
  get diagnostics n = row_count; perform pg_temp.chk(n = 0, 'a child deleted someone else''s item');
  perform pg_temp.act(ub, 'ben@test.dev');
  begin
    insert into public.board_list_items (list_id, family_id, text) values (li, fb, 'sneaky');
    perform pg_temp.chk(false, 'an item slipped into another family''s list');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== notes
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.board_notes (family_id, body) values (fa, 'Bins Tuesday') returning id into nt;
  perform pg_temp.act(uk, 'kid@test.dev');
  update public.board_notes set body = 'No school' where id = nt;
  get diagnostics n = row_count; perform pg_temp.chk(n = 0, 'a child changed a parent''s note');
  insert into public.board_notes (family_id, body) values (fa, 'Love you');
  perform pg_temp.chk((select author from public.board_notes where body = 'Love you') = kid, 'notes record who wrote them');

  -- ===== goals
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    insert into public.board_goals (family_id, title, stars) values (fa, 'Free stars', 100);
    perform pg_temp.chk(false, 'a child set up a goal');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.board_goals (family_id, title, target, unit, stars, people) values (fa, 'Read books', 10, 'books', 5, array[kid]) returning id into gl;
  insert into public.board_goal_steps (goal_id, family_id, text) values (gl, fa, 'Join library') returning id into st;
  perform pg_temp.act(uk, 'kid@test.dev');
  update public.board_goals set progress = 3 where id = gl;
  perform pg_temp.chk((select progress from public.board_goals where id = gl) = 3, 'a child adds progress');
  update public.board_goal_steps set done_at = now() where id = st;
  perform pg_temp.chk((select done_by from public.board_goal_steps where id = st) = kid, 'a child ticks a step');
  begin
    update public.board_goals set done_at = now() where id = gl;
    perform pg_temp.chk(false, 'a child marked a goal done (and took the stars)');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.board_goals set stars = 100 where id = gl;
    perform pg_temp.chk(false, 'a child changed a goal''s stars');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.board_goals set done_at = now() where id = gl;
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where member_id = kid and kind = 'goal') = 1, 'a finished goal is celebrated');
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    update public.board_goals set progress = 9 where id = gl;
    perform pg_temp.chk(false, 'a child changed a finished goal');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== journal questions
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    insert into public.board_prompts (family_id, text) values (fa, 'Kid question');
    perform pg_temp.chk(false, 'a child added a journal question');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.board_prompts (family_id, text) values (fa, 'What did Rex do today?');
  update public.board_settings set journal_prompts = true,
    journal_time = (now() at time zone 'Europe/London')::time - interval '1 minute' where member_id = kid;
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.board_prompts where text = 'What did Rex do today?'), 'another family sees our journal questions');
  perform pg_temp.sys();
  if (now() at time zone 'Europe/London')::time > '00:02' and (now() at time zone 'Europe/London')::time < '21:00' then
    n := public.queue_journal_prompts();
    perform pg_temp.chk((select count(*) from public.notifications where member_id = kid and kind = 'prompt') = 1, 'a child gets today''s question');
    n := public.queue_journal_prompts();
    perform pg_temp.chk((select count(*) from public.notifications where member_id = kid and kind = 'prompt') = 1, 'only one question a day');
    perform pg_temp.act(uk, 'kid@test.dev');
    perform pg_temp.chk((select count(*) from public.board_todays_prompt()) = 1, 'a child sees today''s question');
  end if;

  -- ===== unread, search
  perform pg_temp.act(ug, 'gran@test.dev');
  select unread into n from public.board_unread() where thread_id = fam;
  perform pg_temp.chk(n > 0, 'unread messages are counted');
  perform public.board_mark_read(fam);
  select unread into n from public.board_unread() where thread_id = fam;
  perform pg_temp.chk(n = 0, 'reading a chat clears its count');
  perform pg_temp.chk(exists (select 1 from public.board_thread_state where thread_id = fam and member_id = gran), '"seen by" is recorded');
  perform pg_temp.chk(exists (select 1 from public.board_search('Tea at')), 'search finds messages');
  perform pg_temp.chk(exists (select 1 from public.board_search('Paint')), 'search finds list items');
  perform pg_temp.act(ut, 'teen@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.board_search('Present ideas')), 'search finds messages in chats you cannot see');
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.board_search('Tea')), 'search finds another family''s messages');
  perform pg_temp.act(null, null);
  begin
    perform public.board_unread();
    perform pg_temp.chk(false, 'a signed-out visitor called a Board function');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    select count(*) into n from public.board_messages;
    perform pg_temp.chk(n = 0, 'a signed-out visitor reads messages');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- tidy-up
  perform pg_temp.sys();
  update public.board_messages set deleted_at = now() - interval '2 days' where id = m1;
  perform public.board_tidy_removed();
  perform pg_temp.chk((select body from public.board_messages where id = m1) = '', 'removed messages lose their words after a day');

  perform pg_temp.sys();
  select count(*) filter (where passed), string_agg(case when not passed then E'\nFAIL: ' || msg end, '')
    into n, t from t_results;
  if (select count(*) from t_results where not passed) = 0 then
    raise exception 'REPORT: ALL % CHECKS PASSED', n;
  else
    raise exception 'REPORT: % passed, % FAILED%', n, (select count(*) from t_results where not passed), t;
  end if;
end $$;
