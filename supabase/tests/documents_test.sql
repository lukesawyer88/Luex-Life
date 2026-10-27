-- Luex Life Documents and Papers access test. Creates throwaway families, tries to break every Documents rule, then rolls
-- itself back (it always ends with an error carrying the report). Run after ANY change to Documents access:
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
  fid uuid; d1 uuid; d2 uuid; d3 uuid; x uuid; tok text; n int; t text; tz text; today date;
  sp text; gp text; ap text;
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
  -- a time zone past 8am so reminders run now
  select z into tz from unnest(array['Europe/London', 'Asia/Tokyo', 'America/New_York', 'Pacific/Kiritimati', 'Asia/Kolkata', 'America/Los_Angeles',
    'Australia/Sydney', 'Europe/Moscow', 'America/Sao_Paulo', 'Asia/Dubai', 'Pacific/Honolulu']) z
    where (now() at time zone z)::time between '08:05' and '23:30' limit 1;
  perform pg_temp.sys(); update public.families set timezone = tz where id = fa;
  today := (now() at time zone tz)::date;
  sp := fa || '/docs/s/' || gen_random_uuid() || '.jpg'; gp := fa || '/docs/p/' || gran || '/' || gen_random_uuid() || '.pdf'; ap := fa || '/docs/p/' || ann || '/' || gen_random_uuid() || '.jpg';

  -- ===== the starter folders
  perform pg_temp.act(ua, 'ann@test.dev');
  perform public.doc_setup(); perform public.doc_setup();
  perform pg_temp.chk((select count(*) from public.doc_folders where family_id = fa) = 10, 'the starter folders are made once');
  select id into fid from public.doc_folders where family_id = fa and name = 'ID and passports';
  update public.doc_folders set name = 'Passports' where id = fid;
  perform pg_temp.chk((select name from public.doc_folders where id = fid) = 'Passports', 'a parent renames a folder');
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk((select count(*) from public.doc_folders where family_id = fa) = 10, 'a grown-up sees the folders');
  update public.doc_folders set name = 'Gran''s' where id = fid;
  perform pg_temp.chk((select name from public.doc_folders where id = fid) = 'Passports', 'a grown-up who isn''t a parent renamed a folder');
  begin
    insert into public.doc_folders (family_id, name) values (fa, 'Mine');
    perform pg_temp.chk(false, 'a grown-up who isn''t a parent added a folder');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.doc_folders), 'a child sees the folders');
  begin
    perform public.doc_setup();
    perform pg_temp.chk(false, 'a child set up folders');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== household papers (parents)
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    insert into public.documents (family_id, folder_id, title, pages) values (fa, fid, 'Passport', array[sp]);
    perform pg_temp.chk(false, 'a page that was never uploaded was saved');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ('doc-files', sp, ua, ua::text, '{"size": 1000}');
  insert into public.documents (family_id, folder_id, title, person_id, pages, expires_on, remind_days, where_kept, ref)
    values (fa, fid, 'Passport', kid, array[sp], today + 100, 180, 'Kitchen drawer', '123456789') returning id into d1;
  perform pg_temp.chk((select created_by from public.documents where id = d1) = ann, 'a document records who added it');
  perform pg_temp.sys(); perform pg_temp.chk(public.food_bytes_used(fa) >= 1000, 'document files count towards the family''s space');
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    insert into public.documents (family_id, title, pages) values (fa, 'Wrong place', array[fa || '/docs/p/' || ann || '/x.jpg']);
    perform pg_temp.chk(false, 'a household paper used a private page');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.documents (family_id, title, pages) values (fa, 'Escape', array[fa || '/docs/s/../../' || gen_random_uuid() || '.jpg']);
    perform pg_temp.chk(false, 'a page path with .. was saved');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.documents (family_id, title, person_id) values (fa, 'Ben''s', ben);
    perform pg_temp.chk(false, 'a paper was about someone in another family');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(up, 'pat@test.dev');
  perform pg_temp.chk(exists (select 1 from public.documents where id = d1), 'the other parent sees household papers');
  perform pg_temp.chk(public.doc_file_ok(sp, false), 'the other parent opens household pages');
  update public.documents set where_kept = 'Safe' where id = d1;
  perform pg_temp.chk((select where_kept from public.documents where id = d1) = 'Safe', 'the other parent edits a household paper');
  begin
    update public.documents set private_to = pat where id = d1;
    perform pg_temp.chk(false, 'privacy changed after adding');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.documents set created_by = pat where id = d1;
    perform pg_temp.chk(false, 'who added it was changed');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== grown-ups who aren't parents: their own papers only
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.documents where id = d1), 'a grown-up who isn''t a parent sees household papers');
  perform pg_temp.chk(not public.doc_file_ok(sp, false), 'a grown-up who isn''t a parent opens household pages');
  perform pg_temp.chk(not public.doc_file_ok(fa || '/docs/s/gran.jpg', true), 'a grown-up who isn''t a parent uploads a household page');
  perform pg_temp.chk(public.doc_file_ok(gp, true), 'a grown-up uploads their own page');
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ('doc-files', gp, ug, ug::text, '{"size": 10}');
  insert into public.documents (family_id, folder_id, title, pages) values (fa, fid, 'Payslip', array[gp]) returning id into d2;
  perform pg_temp.chk((select private_to from public.documents where id = d2) = gran, 'a grown-up''s paper is kept just theirs');
  begin
    insert into public.documents (family_id, title, person_id) values (fa, 'Kid''s thing', kid);
    perform pg_temp.chk(false, 'a private paper was about someone else');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.documents (family_id, title, private_to) values (fa, 'Pretend Pat''s', pat);
    perform pg_temp.chk(false, 'a paper was made private to someone else');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.chk(not public.doc_file_ok(ap, false), 'a grown-up opens another''s private pages');

  -- ===== parents' "just mine"
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ('doc-files', ap, ua, ua::text, '{"size": 10}');
  insert into public.documents (family_id, title, pages, private_to, expires_on, remind_days) values (fa, 'Diary', array[ap], ann, today + 5, 30) returning id into d3;
  perform pg_temp.chk(not exists (select 1 from public.documents where id = d2), 'a parent sees another grown-up''s private paper');
  perform pg_temp.chk(not public.doc_file_ok(gp, false), 'a parent opens another grown-up''s private pages');
  update public.documents set title = 'Hacked' where id = d2;
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk((select title from public.documents where id = d2) = 'Payslip', 'a parent changed another grown-up''s private paper');
  perform pg_temp.act(up, 'pat@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.documents where id = d3), 'the other parent sees a parent''s private paper');
  begin
    insert into public.documents (family_id, title, pages) values (fa, 'Steal', array[ap]);
    perform pg_temp.chk(false, 'a household paper used someone''s private page');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== children see nothing
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.documents), 'a child sees papers (even their own passport)');
  perform pg_temp.chk(not public.doc_file_ok(sp, false), 'a child opens household pages');
  perform pg_temp.chk(not public.doc_file_ok(fa || '/docs/p/' || kid || '/x.jpg', true), 'a child uploads a page');
  begin
    insert into public.documents (family_id, title) values (fa, 'Mine');
    perform pg_temp.chk(false, 'a child added a paper');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== a page belongs to one paper
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    insert into public.documents (family_id, title, pages) values (fa, 'Copy', array[sp]);
    perform pg_temp.chk(false, 'two papers shared a page');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.documents (family_id, title, pages) values (fa, 'Twice', array[fa || '/docs/s/x.jpg', fa || '/docs/s/x.jpg']);
    perform pg_temp.chk(false, 'a page was used twice');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.chk(not public.doc_file_ok(fa || '/docs/s/..', true), 'a dotted file name is allowed');

  -- ===== someone who leaves: their papers can still be changed
  perform pg_temp.sys(); update public.family_members set archived_at = now() where id = kid;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.documents set where_kept = 'Safe' where id = d1;
  perform pg_temp.sys();
  perform pg_temp.chk((select where_kept from public.documents where id = d1) = 'Safe', 'a paper about someone who left can still be changed');
  update public.family_members set archived_at = null where id = kid;

  -- ===== expiry reminders
  perform pg_temp.sys();
  perform public.queue_doc_reminders(); perform public.queue_doc_reminders();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'docs' and member_id = ann and title like 'Runs out soon: Passport (Kid)%') = 1, 'parents are told once before a passport runs out');
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'docs' and member_id = pat and title like 'Runs out soon: Passport%') = 1, 'both parents are told');
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'docs' and member_id = ann and title like '%Diary%') = 1, 'a private paper''s owner is told');
  perform pg_temp.chk(not exists (select 1 from public.notifications where kind = 'docs' and member_id = pat and title like '%Diary%'), 'someone else is told about a private paper');
  perform pg_temp.chk(not exists (select 1 from public.notifications where kind = 'docs' and member_id in (kid, gran) and title like '%Passport%'), 'a child or grown-up who isn''t a parent is told about household papers');
  update public.documents set expires_on = today + 400 where id = d1;
  perform public.queue_doc_reminders();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'docs' and member_id = ann and title like '%Passport%') = 1, 'a paper far from running out is reminded');
  update public.documents set expires_on = today + 3 where id = d1;
  perform public.queue_doc_reminders();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'docs' and member_id = ann and title like '%Passport%') = 2, 'a renewed paper is reminded again for its new date');
  update public.documents set expires_on = today + 60 where id = d1;
  perform public.queue_doc_reminders();
  update public.documents set expires_on = today + 60 where id = d1;
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'docs' and member_id = ann and title like '%Passport%') = 3, 'the first reminder comes when it''s in range');
  update public.documents set expires_on = today + 6 where id = d1;
  update public.doc_sends set for_date = today + 6 where document_id = d1 and for_date = today + 60;
  perform public.queue_doc_reminders(); perform public.queue_doc_reminders();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'docs' and member_id = ann and title like '%Passport%') = 4, 'a last reminder comes a week before, once');
  update public.documents set deleted_at = now(), expires_on = today + 2 where id = d1;
  perform public.queue_doc_reminders();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'docs' and member_id = ann and title like '%Passport%') = 4, 'a removed paper is reminded');
  perform pg_temp.act(ua, 'ann@test.dev');
  perform public.doc_remove(d3);
  begin
    perform public.doc_remove(d3);
    perform pg_temp.chk(false, 'a paper was removed twice');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.sys();
  perform pg_temp.chk((select deleted_at from public.documents where id = d3) is not null, 'the owner removes their paper');
  perform pg_temp.act(up, 'pat@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.documents where id = d1), 'a removed paper can still be read');
  begin
    perform public.doc_remove(d2);
    perform pg_temp.chk(false, 'a parent removed another grown-up''s private paper');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.sys(); update public.documents set deleted_at = now() - interval '2 days' where id = d1;
  perform public.doc_tidy_removed();
  perform pg_temp.chk(not exists (select 1 from public.documents where id = d1), 'a removed paper is deleted for good the next night');

  -- ===== other families and visitors
  -- ===== tidying files nobody can reach
  perform pg_temp.sys();
  insert into storage.objects (bucket_id, name, created_at) values ('doc-files', fa || '/docs/s/' || gen_random_uuid() || '.jpg', now() - interval '2 days');
  insert into storage.objects (bucket_id, name, created_at) values ('doc-files', fa || '/docs/s/' || gen_random_uuid() || '.jpg', now());
  update storage.objects set created_at = now() - interval '2 days' where name in (gp, ap, sp);
  perform pg_temp.chk((select count(*) from public.doc_unused_files(1000) u where u like fa || '/%') = 2,
    'only day-old pages that belong to no paper are tidied: ' || (select count(*) from public.doc_unused_files(1000) u where u like fa || '/%'));
  perform pg_temp.chk(not exists (select 1 from public.doc_unused_files(1000) u where u = gp), 'a page still on a paper is tidied');
  update public.family_members set archived_at = now() - interval '10 days' where id = gran;
  perform public.doc_tidy_departed();
  perform pg_temp.chk(exists (select 1 from public.documents where id = d2), 'a grown-up''s own papers go within 30 days of leaving');
  update public.family_members set archived_at = now() - interval '31 days' where id = gran;
  perform public.doc_tidy_departed();
  perform pg_temp.chk(not exists (select 1 from public.documents where id = d2), 'a grown-up''s own papers stay long after they left');
  perform pg_temp.chk(exists (select 1 from public.doc_unused_files(1000) u where u = gp), 'their pages are then tidied');
  update public.family_members set archived_at = null where id = gran;
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    perform public.doc_unused_files(10);
    perform pg_temp.chk(false, 'a signed-in person listed unused files');
  exception when others then perform pg_temp.chk(true, ''); end;

  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.documents where family_id = fa), 'another family sees our papers');
  perform pg_temp.chk(not exists (select 1 from public.doc_folders where family_id = fa), 'another family sees our folders');
  perform pg_temp.chk(not public.doc_file_ok(sp, false), 'another family opens our pages');
  begin
    insert into public.documents (family_id, title) values (fa, 'Sneaky');
    perform pg_temp.chk(false, 'another family added a paper');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    perform public.queue_doc_reminders();
    perform pg_temp.chk(false, 'a signed-in person ran the reminders');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(null, null);
  begin
    select count(*) into n from public.documents;
    perform pg_temp.chk(n = 0, 'a signed-out visitor reads papers');
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
