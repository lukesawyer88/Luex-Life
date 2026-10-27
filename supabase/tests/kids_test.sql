-- Luex Life Kids' Space access test. Creates throwaway families, tries to break every Kids' Space rule, then rolls itself
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
  uk uuid := gen_random_uuid(); uk2 uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  fa uuid; fb uuid; ann uuid; pat uuid; gran uuid; kid uuid; sib uuid; baby uuid; ben uuid; bkid uuid;
  r1 uuid; a1 uuid; a2 uuid; m1 uuid; m2 uuid; tok text; n int; t text;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'ann@test.dev', 'authenticated', 'authenticated'), (up, 'pat@test.dev', 'authenticated', 'authenticated'),
    (ug, 'gran@test.dev', 'authenticated', 'authenticated'), (uk, 'kid@test.dev', 'authenticated', 'authenticated'),
    (uk2, 'sib@test.dev', 'authenticated', 'authenticated'), (ub, 'ben@test.dev', 'authenticated', 'authenticated');
  perform pg_temp.act(ub, 'ben@test.dev'); fb := public.create_family('Beta', 'Ben'); ben := public.my_member_id();
  perform pg_temp.sys();
  insert into public.family_members (family_id, display_name, role) values (fb, 'Bobby', 'child') returning id into bkid;
  perform pg_temp.act(ua, 'ann@test.dev'); fa := public.create_family('Alpha', 'Ann'); ann := public.my_member_id();
  tok := public.create_invite(fa, 'pat@test.dev', 'parent', 'Pat');
  perform pg_temp.act(up, 'pat@test.dev'); perform public.accept_invite(tok); pat := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'gran@test.dev', 'member', 'Gran');
  perform pg_temp.act(ug, 'gran@test.dev'); perform public.accept_invite(tok); gran := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'kid@test.dev', 'child', 'Kid');
  perform pg_temp.act(uk, 'kid@test.dev'); perform public.accept_invite(tok); kid := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'sib@test.dev', 'child', 'Sib');
  perform pg_temp.act(uk2, 'sib@test.dev'); perform public.accept_invite(tok); sib := public.my_member_id();
  perform pg_temp.sys();
  insert into public.family_members (family_id, display_name, role, birthday) values (fa, 'Baby', 'child', current_date - 300) returning id into baby;

  -- ===== screen time rules (parents write; the child and grown-ups read)
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.kid_rules (family_id, child_id, emoji, title) values (fa, kid, '📱', '1 hour on school days') returning id into r1;
  insert into public.kid_rules (family_id, child_id, title) values (fa, sib, 'Screens off by 7pm');
  perform pg_temp.chk((select created_by from public.kid_rules where id = r1) = ann, 'a parent sets a rule');
  begin
    insert into public.kid_rules (family_id, child_id, title) values (fa, gran, 'No telly');
    perform pg_temp.chk(false, 'a rule was set for a grown-up');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.kid_rules (family_id, child_id, title) values (fa, bkid, 'Sneaky');
    perform pg_temp.chk(false, 'a rule was set for another household''s child');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk((select count(*) from public.kid_rules where family_id = fa) = 2, 'a grandparent sees the rules');
  begin
    insert into public.kid_rules (family_id, child_id, title) values (fa, kid, 'Gran says all day');
    perform pg_temp.chk(false, 'someone who isn''t a parent set a rule');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk((select count(*) from public.kid_rules) = 1, 'a child sees only their own rules');
  update public.kid_rules set title = 'All day' where id = r1;
  perform pg_temp.chk((select title from public.kid_rules where id = r1) = '1 hour on school days', 'a child changed a rule');

  -- ===== "can I have more time?"
  insert into public.kid_asks (family_id, child_id, minutes, reason) values (fa, kid, 30, 'Finishing my level') returning id into a1;
  perform pg_temp.chk((select status from public.kid_asks where id = a1) = 'asked', 'a child asks for more time');
  begin
    insert into public.kid_asks (family_id, child_id, minutes) values (fa, kid, 15);
    perform pg_temp.chk(false, 'a child asked twice at once');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.kid_asks (family_id, child_id, minutes) values (fa, sib, 60);
    perform pg_temp.chk(false, 'a child asked for someone else');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.kid_asks set status = 'yes' where id = a1;
  perform pg_temp.chk((select status from public.kid_asks where id = a1) = 'asked', 'a child said yes to themselves');
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'kids' and member_id in (ann, pat) and title = 'Kid asks for 30 more minutes' and body = 'Finishing my level') = 2, 'both parents are asked');
  perform pg_temp.chk(not exists (select 1 from public.notifications where kind = 'kids' and member_id = gran), 'a grandparent is asked');
  perform pg_temp.act(uk2, 'sib@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.kid_asks where id = a1), 'a brother or sister sees the ask');
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.kid_asks where id = a1), 'a grandparent sees the ask');
  update public.kid_asks set status = 'yes' where id = a1;
  perform pg_temp.act(up, 'pat@test.dev');
  perform pg_temp.chk((select status from public.kid_asks where id = a1) = 'asked', 'a grandparent answered the ask');
  update public.kid_asks set status = 'yes' where id = a1;
  perform pg_temp.chk((select status = 'yes' and answered_by = pat from public.kid_asks where id = a1), 'a parent says yes');
  begin
    update public.kid_asks set status = 'no' where id = a1;
    perform pg_temp.chk(false, 'an answer was changed afterwards');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'kids' and member_id = kid and title = 'Yes, 30 more minutes') = 1, 'the child hears yes');
  -- an ask can't be answered once it has run out
  perform pg_temp.act(uk2, 'sib@test.dev');
  insert into public.kid_asks (family_id, child_id, minutes) values (fa, sib, 15) returning id into a2;
  perform pg_temp.sys(); update public.kid_asks set created_at = now() - interval '5 hours' where id = a2;
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    update public.kid_asks set status = 'yes' where id = a2;
    perform pg_temp.chk(false, 'an ask was answered hours after it ran out');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.kid_asks where family_id = fa), 'another family sees our asks');
  begin
    perform public.kid_in_family(fa, kid);
    perform pg_temp.chk(false, 'another family could check who our children are');
  exception when others then perform pg_temp.chk(true, ''); end;
  -- an unanswered ask lapses after 3 hours
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.kid_asks (family_id, child_id, minutes) values (fa, kid, 15) returning id into a2;
  perform pg_temp.sys(); update public.kid_asks set created_at = now() - interval '4 hours' where id = a2;
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.kid_asks (family_id, child_id, minutes) values (fa, kid, 60);
  perform pg_temp.chk((select status from public.kid_asks where id = a2) = 'lapsed', 'an old unanswered ask lapses when a new one is made');
  begin
    insert into public.kid_asks (family_id, child_id, minutes) values (fa, kid, 45);
    perform pg_temp.chk(false, 'an ask for a made-up amount of time was saved');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    insert into public.kid_asks (family_id, child_id, minutes) values (fa, ann, 30);
    perform pg_temp.chk(false, 'a grown-up made a screen time ask');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== growing up
  perform pg_temp.act(ug, 'gran@test.dev');
  insert into public.kid_milestones (family_id, child_id, on_date, emoji, title) values (fa, baby, current_date - 10, '👣', 'First steps') returning id into m1;
  perform pg_temp.chk((select created_by from public.kid_milestones where id = m1) = gran, 'a grandparent adds a milestone for the baby');
  begin
    insert into public.kid_milestones (family_id, child_id, on_date, title) values (fa, baby, current_date + 30, 'Future');
    perform pg_temp.chk(false, 'a milestone was saved in the future');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.kid_milestones (family_id, child_id, on_date, title, height_cm) values (fa, baby, current_date, 'Measured', 900);
    perform pg_temp.chk(false, 'a made-up height was saved');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.kid_milestones (family_id, child_id, on_date, emoji, title) values (fa, kid, current_date, '🚲', 'Rode my bike') returning id into m2;
  perform pg_temp.chk(exists (select 1 from public.kid_milestones where id = m1), 'a child sees the family''s milestones');
  begin
    insert into public.kid_milestones (family_id, child_id, on_date, title) values (fa, sib, current_date, 'Sib smells');
    perform pg_temp.chk(false, 'a child added a milestone for someone else');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.kid_milestones set title = 'Fell over' where id = m1;
    perform pg_temp.chk(false, 'a child changed someone else''s milestone');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.kid_milestones set deleted_at = now() where id = m2;
  begin
    update public.kid_milestones set deleted_at = null where id = m2;
    perform pg_temp.chk(false, 'a removed milestone came back');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(up, 'pat@test.dev');
  begin
    insert into public.kid_milestones (family_id, child_id, on_date, title) values (fa, baby, current_date - 400, 'Before born');
    perform pg_temp.chk(false, 'a milestone before the child was born was saved');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.kid_milestones (family_id, child_id, on_date, title) values (fa, gran, current_date, 'Grown-up milestone');
    perform pg_temp.chk(false, 'a milestone was saved for a grown-up');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.kid_milestones set title = 'First proper steps' where id = m1;
  perform pg_temp.chk((select title from public.kid_milestones where id = m1) = 'First proper steps', 'a parent changes any milestone');

  -- ===== all about me
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.kid_about (family_id, child_id, answers) values (fa, kid, '{"colour": "Purple", "animal": "Otters"}');
  perform pg_temp.chk((select updated_by from public.kid_about where child_id = kid) = kid, 'a child fills in all about me');
  begin
    insert into public.kid_about (family_id, child_id, answers) values (fa, sib, '{"colour": "Poo brown"}');
    perform pg_temp.chk(false, 'a child wrote someone else''s all about me');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.kid_about set answers = '{"address": "1 High Street"}' where child_id = kid;
    perform pg_temp.chk(false, 'an answer to a question that isn''t on the list was saved');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk((select answers->>'animal' from public.kid_about where child_id = kid) = 'Otters', 'a grandparent reads all about me');
  update public.kid_about set answers = '{"colour": "Beige"}' where child_id = kid;
  perform pg_temp.chk((select answers->>'colour' from public.kid_about where child_id = kid) = 'Purple', 'a grandparent changed a child''s answers');
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.kid_about (family_id, child_id, answers) values (fa, baby, '{"food": "Banana"}');
  perform pg_temp.chk(exists (select 1 from public.kid_about where child_id = baby), 'a parent fills it in for the baby');

  -- ===== other families and visitors
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.kid_rules where family_id = fa), 'another family sees our rules');
  perform pg_temp.chk(not exists (select 1 from public.kid_milestones where family_id = fa), 'another family sees our milestones');
  perform pg_temp.chk(not exists (select 1 from public.kid_about where family_id = fa), 'another family sees all about me');
  begin
    insert into public.kid_milestones (family_id, child_id, on_date, title) values (fa, kid, current_date, 'Sneaky');
    perform pg_temp.chk(false, 'another family added a milestone');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.kid_milestones (family_id, child_id, on_date, title) values (fb, kid, current_date, 'Sneaky');
    perform pg_temp.chk(false, 'another family added a milestone for our child under their own household');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(null, null);
  begin
    select count(*) into n from public.kid_about;
    perform pg_temp.chk(n = 0, 'a signed-out visitor reads all about me');
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
