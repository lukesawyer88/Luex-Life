-- Checks the exact calls the app makes (module switch upsert, family rename, picture uploads) against the real
-- rules, including storage. Always ends with an error carrying the report, which rolls everything back:
--   all passed -> "REPORT: ALL n CHECKS PASSED"
-- Run it after ANY change to grants, policies or storage rules, together with access_test.sql.
-- (Statements are the same as the ones in the app; see src/pages/settings.tsx and src/pages/family.tsx.)
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); fa uuid; amem uuid; n int; rep text := ''; passes int := 0; fails int := 0; p text;
begin
  insert into auth.users (id, email, aud, role) values (a,'a@test.dev','authenticated','authenticated'),(b,'b@test.dev','authenticated','authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.dev', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  fa := public.create_family('Alpha', 'Ann', '#2f6bd8');
  select id into amem from public.family_members where user_id = a;

  insert into public.family_modules (family_id, module_key, enabled) values (fa, 'food', false)
    on conflict (family_id, module_key) do update set enabled = excluded.enabled;
  insert into public.family_modules (family_id, module_key, enabled) values (fa, 'food', true)
    on conflict (family_id, module_key) do update set enabled = excluded.enabled;
  select count(*) into n from public.family_modules where family_id = fa and enabled; if n = 1 then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: module upsert'; end if;
  begin update public.family_modules set updated_at = '2000-01-01' where family_id = fa; fails := fails + 1; rep := rep || E'\nFAIL: client can set updated_at';
  exception when others then passes := passes + 1; end;

  perform * from public.family_members where family_id = fa; passes := passes + 1;
  update public.families set name = 'Alpha 2' where id = fa; get diagnostics n = row_count; if n = 1 then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: rename family'; end if;

  p := fa || '/' || amem || '-123.jpg';
  begin insert into storage.objects (bucket_id, name, owner_id) values ('avatars', p, a::text); passes := passes + 1;
  exception when others then fails := fails + 1; rep := rep || E'\nFAIL: own picture upload: ' || sqlerrm; end;
  select count(*) into n from storage.objects where bucket_id = 'avatars' and name = p; if n = 1 then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: cannot read own picture'; end if;
  begin insert into storage.objects (bucket_id, name, owner_id) values ('avatars', fa || '/' || gen_random_uuid() || '-1.jpg', a::text); passes := passes + 1;
  exception when others then fails := fails + 1; rep := rep || E'\nFAIL: parent cannot add a picture for a family profile: ' || sqlerrm; end;
  begin insert into storage.objects (bucket_id, name, owner_id) values ('avatars', 'loose-file.jpg', a::text); fails := fails + 1; rep := rep || E'\nFAIL: file outside a family folder accepted';
  exception when others then passes := passes + 1; end;
  begin insert into storage.objects (bucket_id, name, owner_id) values ('somewhere-else', p, a::text); fails := fails + 1; rep := rep || E'\nFAIL: other bucket accepted';
  exception when others then passes := passes + 1; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'email', 'b@test.dev', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from storage.objects where bucket_id = 'avatars'; if n = 0 then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: outsider can see pictures'; end if;
  begin insert into storage.objects (bucket_id, name, owner_id) values ('avatars', fa || '/' || amem || '-999.jpg', b::text); fails := fails + 1; rep := rep || E'\nFAIL: outsider can upload into another family';
  exception when others then passes := passes + 1; end;
  begin delete from storage.objects where bucket_id = 'avatars' and name = p; get diagnostics n = row_count; if n = 0 then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: outsider deleted a picture'; end if;
  exception when others then passes := passes + 1; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform 1 from storage.objects where bucket_id = 'avatars' limit 1; get diagnostics n = row_count; if n = 0 then passes := passes + 1; else fails := fails + 1; rep := rep || E'\nFAIL: signed-out visitor sees pictures'; end if;
  exception when others then passes := passes + 1; end;
  execute 'reset role';
  if fails = 0 then raise exception 'REPORT: ALL % CHECKS PASSED', passes; else raise exception 'REPORT: % passed, % FAILED%', passes, fails, rep; end if;
end $$;
