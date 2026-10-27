-- Luex Life access test. Creates throwaway people, tries to break every rule, then rolls itself back
-- (it always ends with an error that carries the report). Run it after ANY change to access:
--   all passed  -> error text starts "REPORT: ALL n CHECKS PASSED"
--   anything else -> lists each "FAIL:" line
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); k uuid := gen_random_uuid();
  fa uuid; fb uuid; tom uuid; mia uuid; amem uuid; kmem uuid;
  tok text; tok2 text; tok3 text; tok4 text; n int; passes int := 0; fails int := 0; rep text := '';
  ok boolean; t text;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'a@test.dev', 'authenticated', 'authenticated'),
    (b, 'b@test.dev', 'authenticated', 'authenticated'),
    (c, 'c@test.dev', 'authenticated', 'authenticated'),
    (k, 'kid@test.dev', 'authenticated', 'authenticated');

  -- ===== A and B each start a family
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.dev', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  fa := public.create_family('Alpha', 'Ann');
  select id into amem from public.family_members where user_id = a;
  select count(*) into n from public.families; ok := n = 1;
  if ok then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: A sees exactly their own family (saw ' || n || ')'; end if;
  begin perform public.create_family('Second', 'Ann'); fails := fails + 1; rep := rep || E'\nFAIL: a person can start a second family';
  exception when others then passes := passes + 1; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'email', 'b@test.dev', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  fb := public.create_family('Beta', 'Ben');

  -- ===== B (outsider) cannot see or touch Alpha
  select count(*) into n from public.family_members where family_id = fa; ok := n = 0;
  if ok then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: outsider can read another family''s people'; end if;
  select count(*) into n from public.families where id = fa; ok := n = 0;
  if ok then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: outsider can read another family'; end if;
  begin insert into public.family_members (family_id, display_name, role) values (fa, 'Intruder', 'parent');
    fails := fails + 1; rep := rep || E'\nFAIL: outsider added a person to another family';
  exception when others then passes := passes + 1; end;
  update public.family_members set display_name = 'Hacked' where id = amem; get diagnostics n = row_count;
  if n = 0 then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: outsider renamed another family''s person'; end if;
  update public.families set name = 'Hacked' where id = fa; get diagnostics n = row_count;
  if n = 0 then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: outsider renamed another family'; end if;
  select count(*) into n from public.family_invites where family_id = fa;
  if n = 0 then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: outsider reads invites'; end if;
  select count(*) into n from public.audit_log where family_id = fa;
  if n = 0 then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: outsider reads the audit log'; end if;
  begin perform public.create_invite(fa, 'x@test.dev', 'parent', 'X'); fails := fails + 1; rep := rep || E'\nFAIL: outsider invited someone to another family';
  exception when others then passes := passes + 1; end;
  begin insert into public.family_modules (family_id, module_key, enabled) values (fa, 'food', false);
    fails := fails + 1; rep := rep || E'\nFAIL: outsider switched a module in another family';
  exception when others then passes := passes + 1; end;

  -- ===== A (parent) does the normal things
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.dev', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.family_members (family_id, display_name, role, created_by) values (fa, 'Tom', 'child', b) returning id into tom;
  select count(*) into n from public.family_members where id = tom and created_by = a; ok := n = 1;
  if ok then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: created_by can be spoofed'; end if;
  begin insert into public.family_members (family_id, user_id, display_name, role) values (fa, b, 'Fake login', 'parent');
    fails := fails + 1; rep := rep || E'\nFAIL: a parent added a person with someone else''s login';
  exception when others then passes := passes + 1; end;
  insert into public.family_modules (family_id, module_key, enabled) values (fa, 'food', false);
  passes := passes + 1;
  begin perform 1 from (select token_hash from public.family_invites) s; fails := fails + 1; rep := rep || E'\nFAIL: invite token is readable';
  exception when others then passes := passes + 1; end;
  begin update public.family_members set user_id = b where id = tom; fails := fails + 1; rep := rep || E'\nFAIL: a parent can set a login on a profile directly';
  exception when others then passes := passes + 1; end;
  begin update public.family_members set role = 'member' where id = amem; fails := fails + 1; rep := rep || E'\nFAIL: the last parent could be demoted';
  exception when others then passes := passes + 1; end;
  begin perform public.create_invite(fa, 'not an email', 'child', 'Kid'); fails := fails + 1; rep := rep || E'\nFAIL: bad email accepted';
  exception when others then passes := passes + 1; end;

  tok := public.create_invite(fa, 'Kid@Test.dev', 'child', 'Kid');
  tok2 := public.create_invite(fa, 'c@test.dev', 'member', 'Cee');
  -- a new invite for the same address replaces the old one
  tok3 := public.create_invite(fa, 'c@test.dev', 'member', 'Cee');
  select count(*) into n from public.family_invites where email = 'c@test.dev' and revoked_at is null; ok := n = 1;
  if ok then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: old invite for the same address stays live'; end if;

  -- ===== joining
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'email', 'c@test.dev', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.preview_invite(tok3); ok := n = 1;
  if ok then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: invite preview does not work'; end if;
  select count(*) into n from public.preview_invite('nonsense'); ok := n = 0;
  if ok then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: invite preview answers for a wrong token'; end if;
  begin perform public.accept_invite(tok2); fails := fails + 1; rep := rep || E'\nFAIL: a replaced invite still works';
  exception when others then passes := passes + 1; end;
  begin perform public.accept_invite(tok); fails := fails + 1; rep := rep || E'\nFAIL: invite worked for the wrong email address';
  exception when others then passes := passes + 1; end;
  perform public.accept_invite(tok3);
  select count(*) into n from public.family_members where family_id = fa and user_id = c and role = 'member'; ok := n = 1;
  if ok then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: accepting an invite did not join the family'; end if;
  begin perform public.accept_invite(tok3); fails := fails + 1; rep := rep || E'\nFAIL: an invite could be used twice';
  exception when others then passes := passes + 1; end;

  -- ===== K (child) joins and is limited
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'email', 'kid@test.dev', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.accept_invite(tok);
  select id into kmem from public.family_members where user_id = k;
  begin update public.family_members set role = 'parent' where id = kmem; fails := fails + 1; rep := rep || E'\nFAIL: a child made themselves a parent';
  exception when others then passes := passes + 1; end;
  begin update public.family_members set archived_at = now() where id = kmem; fails := fails + 1; rep := rep || E'\nFAIL: a child removed themselves';
  exception when others then passes := passes + 1; end;
  update public.family_members set colour = '#112233' where id = kmem; get diagnostics n = row_count;
  if n = 1 then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: a child cannot change their own colour'; end if;
  begin update public.family_members set display_name = 'Renamed' where id = tom; get diagnostics n = row_count;
    if n = 0 then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: a child renamed someone else'; end if;
  exception when others then passes := passes + 1; end;
  begin perform public.create_invite(fa, 'y@test.dev', 'parent', 'Y'); fails := fails + 1; rep := rep || E'\nFAIL: a child sent an invite';
  exception when others then passes := passes + 1; end;
  begin insert into public.family_members (family_id, display_name, role) values (fa, 'Ghost', 'child'); fails := fails + 1; rep := rep || E'\nFAIL: a child added a person';
  exception when others then passes := passes + 1; end;
  begin insert into public.family_modules (family_id, module_key, enabled) values (fa, 'money', false); fails := fails + 1; rep := rep || E'\nFAIL: a child switched a module';
  exception when others then passes := passes + 1; end;
  select count(*) into n from public.family_invites; if n = 0 then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: a child reads invites'; end if;
  select count(*) into n from public.audit_log; if n = 0 then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: a child reads the audit log'; end if;
  select count(*) into n from public.family_members where family_id = fa; if n >= 4 then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: a child cannot see the family'; end if;

  -- ===== profile picture paths
  ok := public.avatar_path_ok(fa || '/' || kmem || '-1.jpg', true);
  if ok then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: child cannot set their own picture'; end if;
  ok := public.avatar_path_ok(fa || '/' || tom || '-1.jpg', true);
  if not ok then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: child can set someone else''s picture'; end if;
  ok := public.avatar_path_ok(fa || '/' || tom || '-1.jpg', false);
  if ok then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: child cannot see family pictures'; end if;
  ok := public.avatar_path_ok('not-a-path', false) or public.avatar_path_ok(fa || '/x/y.jpg', true) or public.avatar_path_ok('zzz/' || tom || '.jpg', true);
  if not ok then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: a bad picture path was accepted'; end if;

  -- ===== B cannot see Alpha pictures
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'email', 'b@test.dev', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  ok := public.avatar_path_ok(fa || '/' || tom || '-1.jpg', false) or public.avatar_path_ok(fa || '/' || tom || '-1.jpg', true);
  if not ok then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: outsider can reach another family''s pictures'; end if;

  -- ===== take over a profile through an invite, and the demotion rule
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.dev', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.family_members (family_id, display_name, role) values (fa, 'Mia', 'child') returning id into mia;
  tok4 := public.create_invite(fa, 'late@test.dev', 'member', 'Late');
  tok2 := public.create_invite(fa, 'mia@test.dev', 'child', 'Mia', mia);
  update public.family_members set role = 'parent' where id = kmem;  -- a second parent who can log in
  update public.family_members set role = 'member' where id = amem;  -- now the first one may step down
  passes := passes + 1;
  -- expired invite
  execute 'reset role';
  update public.family_invites set expires_at = now() - interval '1 minute' where email = 'late@test.dev';
  insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'late@test.dev', 'authenticated', 'authenticated');
  select id into t from auth.users where email = 'late@test.dev';
  perform set_config('request.jwt.claims', json_build_object('sub', t, 'email', 'late@test.dev', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.accept_invite(tok4); fails := fails + 1; rep := rep || E'\nFAIL: an expired invite worked';
  exception when others then passes := passes + 1; end;

  -- a profile with no login is taken over by the person who accepts the invite made for it
  execute 'reset role';
  insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'mia@test.dev', 'authenticated', 'authenticated');
  select id into t from auth.users where email = 'mia@test.dev';
  perform set_config('request.jwt.claims', json_build_object('sub', t, 'email', 'mia@test.dev', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.accept_invite(tok2);
  select count(*) into n from public.family_members where id = mia and user_id = t::uuid and role = 'child'; ok := n = 1;
  if ok then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: invite did not hand over the existing profile'; end if;

  -- ===== signed out
  execute 'reset role';
  execute 'set local role anon';
  begin perform 1 from public.families limit 1; fails := fails + 1; rep := rep || E'\nFAIL: signed-out visitor reads families';
  exception when others then passes := passes + 1; end;
  begin perform 1 from public.family_members limit 1; fails := fails + 1; rep := rep || E'\nFAIL: signed-out visitor reads people';
  exception when others then passes := passes + 1; end;
  begin perform 1 from public.family_invites limit 1; fails := fails + 1; rep := rep || E'\nFAIL: signed-out visitor reads invites';
  exception when others then passes := passes + 1; end;
  begin perform 1 from public.audit_log limit 1; fails := fails + 1; rep := rep || E'\nFAIL: signed-out visitor reads the audit log';
  exception when others then passes := passes + 1; end;
  begin perform public.create_family('X', 'Y'); fails := fails + 1; rep := rep || E'\nFAIL: signed-out visitor can create a family';
  exception when others then passes := passes + 1; end;
  begin perform public.accept_invite(tok); fails := fails + 1; rep := rep || E'\nFAIL: signed-out visitor can accept an invite';
  exception when others then passes := passes + 1; end;
  begin perform public.is_family_parent(fa); fails := fails + 1; rep := rep || E'\nFAIL: signed-out visitor can call the helper functions';
  exception when others then passes := passes + 1; end;

  execute 'reset role';
  select count(*) into n from public.audit_log where family_id = fa and action = 'member_added'; ok := n >= 3;
  if ok then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: the audit log is not recording'; end if;

  if fails = 0 then raise exception 'REPORT: ALL % CHECKS PASSED', passes;
  else raise exception 'REPORT: % passed, % FAILED%', passes, fails, rep; end if;
end $$;
