-- Luex Life Contacts and Emergency access test. Creates throwaway families, tries to break every Contacts and Emergency
-- rule, then rolls itself back (it always ends with an error carrying the report). Run after ANY change to its access:
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
  fa uuid; fb uuid; ann uuid; pat uuid; gran uuid; kid uuid; ben uuid; tom uuid;
  c1 uuid; c2 uuid; kc uuid; tc uuid; gc uuid; ac uuid; pc uuid; tok text; tok2 text; n int; t text; j jsonb;
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
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.family_members (family_id, display_name, role) values (fa, 'Tom', 'child') returning id into tom;

  -- ===== contacts and who to call (grown-ups keep them; everyone sees them)
  insert into public.em_contacts (family_id, name, grp, phone, call_order) values (fa, 'Ann', 'family', '07700 900001', 1) returning id into c1;
  perform pg_temp.chk((select created_by from public.em_contacts where id = c1) = ann, 'contacts record who added them');
  perform pg_temp.act(ug, 'gran@test.dev');
  insert into public.em_contacts (family_id, name, grp, phone, call_order) values (fa, 'Dr Patel', 'medical', '01234 111222', 2) returning id into c2;
  perform pg_temp.chk(c2 is not null, 'a grown-up adds a contact');
  update public.em_contacts set notes = 'Mum' where id = c1;
  perform pg_temp.chk((select notes from public.em_contacts where id = c1) = 'Mum', 'a grown-up changes a contact');
  begin
    update public.em_contacts set created_by = gran where id = c1;
    perform pg_temp.chk(false, 'who added a contact was changed');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk((select count(*) from public.em_contacts where family_id = fa) = 2, 'a child sees who to call');
  begin
    insert into public.em_contacts (family_id, name) values (fa, 'Friend');
    perform pg_temp.chk(false, 'a child added a contact');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.em_contacts set phone = '000' where id = c1;
  perform pg_temp.chk((select phone from public.em_contacts where id = c1) = '07700 900001', 'a child changed a contact');

  -- ===== cards: each grown-up their own; parents the children's, pets' and profiles without a login
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.em_cards (family_id, member_id, allergies, blood_group) values (fa, kid, 'Peanuts', 'O+') returning id into kc;
  insert into public.em_conditions (card_id, family_id, conditions) values (kc, fa, 'Asthma');
  insert into public.em_cards (family_id, member_id, medicines) values (fa, tom, 'Inhaler') returning id into tc;
  insert into public.em_cards (family_id, pet_name, doctor, microchip) values (fa, 'Rex', 'Town Vets', '981000123') returning id into pc;
  insert into public.em_cards (family_id, member_id, allergies) values (fa, ann, 'Penicillin') returning id into ac;
  insert into public.em_conditions (card_id, family_id, conditions, shared) values (ac, fa, 'Diabetes', false);
  perform pg_temp.chk((select count(*) from public.em_cards where family_id = fa) = 4, 'a parent makes cards for the children, a pet and themselves');
  begin
    insert into public.em_cards (family_id, member_id, allergies) values (fa, gran, 'Ann says so');
    perform pg_temp.chk(false, 'a parent made another grown-up''s card');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.em_cards (family_id, member_id) values (fa, ben);
    perform pg_temp.chk(false, 'a card was made for someone in another family');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.em_cards set member_id = pat where id = kc;
    perform pg_temp.chk(false, 'a card was moved to someone else');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.em_cards set deleted_at = now() where id = kc;
    perform pg_temp.chk(false, 'a person''s card was removed');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(up, 'pat@test.dev');
  update public.em_cards set allergies = 'Peanuts, eggs' where id = kc;
  perform pg_temp.chk((select allergies from public.em_cards where id = kc) = 'Peanuts, eggs', 'the other parent changes a child''s card');
  perform pg_temp.chk((select conditions from public.em_conditions where card_id = kc) = 'Asthma', 'a child''s conditions are seen');
  perform pg_temp.chk(not exists (select 1 from public.em_conditions where card_id = ac), 'the other parent sees a grown-up''s hidden conditions');
  perform pg_temp.chk((select allergies from public.em_cards where id = ac) = 'Penicillin', 'allergies are seen by the household');
  update public.em_cards set allergies = 'None' where id = ac;
  update public.em_conditions set shared = true where card_id = ac;
  perform pg_temp.act(ua, 'ann@test.dev');
  perform pg_temp.chk((select allergies from public.em_cards where id = ac) = 'Penicillin'
    and not (select shared from public.em_conditions where card_id = ac), 'the other parent changed a grown-up''s own card');
  perform pg_temp.act(ug, 'gran@test.dev');
  insert into public.em_cards (family_id, member_id, medicines) values (fa, gran, 'Statins') returning id into gc;
  perform pg_temp.chk(gc is not null, 'a grown-up makes their own card');
  update public.em_cards set allergies = 'Gran says so' where id = kc;
  perform pg_temp.chk((select allergies from public.em_cards where id = kc) = 'Peanuts, eggs', 'a grown-up who isn''t a parent changed a child''s card');
  begin
    insert into public.em_cards (family_id, pet_name) values (fa, 'Tiddles');
    perform pg_temp.chk(false, 'a grown-up who isn''t a parent added a pet');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.chk(not exists (select 1 from public.em_conditions where card_id = ac), 'a grown-up sees another''s hidden conditions');
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk((select count(*) from public.em_cards where family_id = fa) = 5, 'a child sees the emergency cards');
  update public.em_cards set allergies = 'None' where id = kc;
  perform pg_temp.chk((select allergies from public.em_cards where id = kc) = 'Peanuts, eggs', 'a child changed their own card');
  perform pg_temp.chk(not exists (select 1 from public.em_conditions where card_id = ac), 'a child sees a grown-up''s hidden conditions');
  -- a pet goes
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.em_cards set deleted_at = '2000-01-01' where id = pc;
  perform pg_temp.chk((select deleted_at from public.em_cards where id = pc) > now() - interval '1 minute', 'a pet''s card is removed at the real time');
  update public.em_cards set deleted_at = null where id = pc;

  -- ===== home essentials (grown-ups)
  insert into public.em_home (family_id, address, stopcock, wifi_name, wifi_password, bedtimes) values (fa, '1 High Street', 'Under the sink', 'Home', 'secret123', 'Tom 7pm');
  perform pg_temp.act(ug, 'gran@test.dev');
  update public.em_home set spare_key = 'With Gran' where family_id = fa;
  perform pg_temp.chk((select spare_key from public.em_home where family_id = fa) = 'With Gran', 'a grown-up updates the home essentials');
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk((select address from public.em_home where family_id = fa) = '1 High Street', 'a child sees the home address');
  update public.em_home set address = 'Moon' where family_id = fa;
  perform pg_temp.chk((select address from public.em_home where family_id = fa) = '1 High Street', 'a child changed the home essentials');

  -- ===== babysitter links
  begin
    tok := public.em_create_share('Sitter', 1);
    perform pg_temp.chk(false, 'a child made a babysitter link');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    tok := public.em_create_share('Sitter', 1);
    perform pg_temp.chk(false, 'a grown-up who isn''t a parent made a babysitter link');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    tok := public.em_create_share('Too long', 40);
    perform pg_temp.chk(false, 'a link lasting more than a month was made');
  exception when others then perform pg_temp.chk(true, ''); end;
  tok := public.em_create_share('Saturday sitter', 2);
  perform pg_temp.chk((select count(*) from public.em_shares where family_id = fa) = 1, 'a parent sees their links');
  perform pg_temp.act(null, null);
  j := public.em_shared(tok);
  perform pg_temp.chk(j ->> 'family' = 'Alpha' and j -> 'home' ->> 'address' = '1 High Street', 'a babysitter opens the link without signing in');
  perform pg_temp.chk(j -> 'home' ->> 'wifi_password' is null, 'the Wi-Fi is in the link without being ticked');
  perform pg_temp.chk(jsonb_array_length(j -> 'call') = 2 and j -> 'call' -> 0 ->> 'name' = 'Ann', 'the link has who to call, in order');
  perform pg_temp.chk((select count(*) from jsonb_array_elements(j -> 'cards') e) = 3, 'the link has the children''s and pet''s cards only');
  perform pg_temp.chk(not (j::text like '%Penicillin%' or j::text like '%Statins%' or j::text like '%Diabetes%'), 'a grown-up''s card is in the link');
  perform pg_temp.chk(j::text like '%Asthma%' and j::text like '%Peanuts%', 'a child''s allergies and conditions are in the link');
  perform pg_temp.chk(public.em_shared('nonsense') is null, 'a made-up link opens');
  begin
    select count(*) into n from public.em_shares;
    perform pg_temp.chk(n = 0, 'a visitor lists the links');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.em_home set wifi_in_link = true where family_id = fa;
  update public.em_conditions set shared = false where card_id = kc;
  perform pg_temp.act(null, null);
  j := public.em_shared(tok);
  perform pg_temp.chk(j -> 'home' ->> 'wifi_password' = 'secret123', 'the Wi-Fi is in the link once ticked');
  perform pg_temp.chk(j::text not like '%Asthma%', 'hidden conditions are in the link');
  perform pg_temp.chk(j::text not like '%Mum%', 'contact notes are in the link');
  perform pg_temp.chk(j::text not like '%birthday%', 'a full birthday is in the link');
  perform pg_temp.act(up, 'pat@test.dev');
  update public.em_shares set revoked_at = now() where family_id = fa;
  perform pg_temp.act(null, null);
  perform pg_temp.chk(public.em_shared(tok) is null, 'a stopped link still opens');
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    update public.em_shares set revoked_at = null where family_id = fa;
    perform pg_temp.chk(false, 'a stopped link was started again');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(null, null);
  perform pg_temp.chk(public.em_shared(tok) is null, 'a stopped link opens again');
  -- someone who has left drops out of the link
  perform pg_temp.act(ua, 'ann@test.dev');
  tok2 := public.em_create_share('Archive check', 1);
  perform pg_temp.sys(); update public.family_members set archived_at = now() where id = tom;
  perform pg_temp.act(null, null);
  perform pg_temp.chk(public.em_shared(tok2)::text not like '%Inhaler%', 'a child who has left is in the link');
  perform pg_temp.sys(); update public.family_members set archived_at = null where id = tom;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.em_shares set revoked_at = now() where id = (select id from public.em_shares where name = 'Archive check');
  perform pg_temp.act(ua, 'ann@test.dev');
  tok2 := public.em_create_share('Next week', 7);
  perform pg_temp.sys(); update public.family_members set role = 'member' where id = ann;
  perform pg_temp.act(null, null);
  perform pg_temp.chk(public.em_shared(tok2) is null, 'a link still opens after its maker stops being a parent');
  perform pg_temp.sys(); update public.family_members set role = 'parent' where id = ann;
  perform pg_temp.sys(); update public.em_shares set expires_at = now() - interval '1 minute' where family_id = fa;
  perform pg_temp.act(null, null);
  perform pg_temp.chk(public.em_shared(tok2) is null, 'a link opens after it runs out');

  -- ===== the twice-a-year check
  perform pg_temp.sys();
  perform public.em_checkup();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'emergency' and member_id in (ann, pat, gran)) = 3, 'grown-ups are asked to check their details');
  perform pg_temp.chk(not exists (select 1 from public.notifications where kind = 'emergency' and member_id in (kid, tom)), 'children are asked to check details');

  -- ===== other families and visitors
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.em_contacts where family_id = fa), 'another family sees our contacts');
  perform pg_temp.chk(not exists (select 1 from public.em_cards where family_id = fa), 'another family sees our cards');
  perform pg_temp.chk(not exists (select 1 from public.em_home where family_id = fa), 'another family sees our home');
  perform pg_temp.chk(not exists (select 1 from public.em_conditions where family_id = fa), 'another family sees our conditions');
  begin
    insert into public.em_contacts (family_id, name) values (fa, 'Sneaky');
    perform pg_temp.chk(false, 'another family added a contact');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.em_conditions (card_id, family_id, conditions) values (gc, fb, 'x');
    perform pg_temp.chk(false, 'another family added conditions to our card');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    perform public.em_checkup();
    perform pg_temp.chk(false, 'a signed-in person ran the check');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(null, null);
  begin
    select count(*) into n from public.em_cards;
    perform pg_temp.chk(n = 0, 'a signed-out visitor reads cards');
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
