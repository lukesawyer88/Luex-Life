-- Luex Life Food access test. Creates throwaway families, tries to break every Board rule, then rolls
-- itself back (it always ends with an error carrying the report). Run after ANY change to Food access:
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
  fa uuid; fb uuid; ann uuid; pat uuid; gran uuid; kid uuid; tom uuid; ben uuid;
  rc uuid; rc2 uuid; col uuid; big text; pl uuid; req uuid; li uuid; it uuid; st uuid; tk uuid; x uuid; tok text; n int; t text; ok boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'ann@test.dev', 'authenticated', 'authenticated'), (up, 'pat@test.dev', 'authenticated', 'authenticated'),
    (ug, 'gran@test.dev', 'authenticated', 'authenticated'), (uk, 'kid@test.dev', 'authenticated', 'authenticated'),
    (ub, 'ben@test.dev', 'authenticated', 'authenticated');
  perform pg_temp.act(ub, 'ben@test.dev'); fb := public.create_family('Beta', 'Ben'); ben := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); fa := public.create_family('Alpha', 'Ann'); ann := public.my_member_id();
  insert into public.family_members (family_id, display_name, role, birthday) values (fa, 'Tom', 'child', '2017-03-04') returning id into tom;
  tok := public.create_invite(fa, 'pat@test.dev', 'parent', 'Pat');
  perform pg_temp.act(up, 'pat@test.dev'); perform public.accept_invite(tok); pat := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'gran@test.dev', 'member', 'Gran');
  perform pg_temp.act(ug, 'gran@test.dev'); perform public.accept_invite(tok); gran := public.my_member_id();
  perform pg_temp.act(ua, 'ann@test.dev'); tok := public.create_invite(fa, 'kid@test.dev', 'child', 'Kid');
  perform pg_temp.act(uk, 'kid@test.dev'); perform public.accept_invite(tok); kid := public.my_member_id();

  -- ===== recipes
  perform pg_temp.act(ug, 'gran@test.dev');
  insert into public.food_recipes (family_id, title, servings, ingredients, allergens)
    values (fa, 'Gran''s scones', 8, '[{"qty":225,"unit":"g","name":"self-raising flour"}]', array['gluten', 'dairy']) returning id into rc;
  perform pg_temp.chk((select created_by from public.food_recipes where id = rc) = gran, 'a recipe records who added it');
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(exists (select 1 from public.food_recipes where id = rc), 'the family sees every recipe');
  begin
    update public.food_recipes set title = 'Kid scones' where id = rc;
    perform pg_temp.chk(false, 'someone changed another person''s recipe');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.food_recipes set times_made = times_made + 1, last_made = current_date where id = rc;
  perform pg_temp.chk((select times_made from public.food_recipes where id = rc) = 1, 'anyone can record "made it"');
  begin
    update public.food_recipes set times_made = 99 where id = rc;
    perform pg_temp.chk(false, '"made it" count jumped');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.food_ratings (recipe_id, member_id, family_id, value) values (rc, ann, fa, 1);
  perform pg_temp.chk((select member_id from public.food_ratings where recipe_id = rc) = kid, 'a rating is stamped with who gave it');
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.food_recipes set notes = 'Less sugar' where id = rc;
  perform pg_temp.chk((select notes from public.food_recipes where id = rc) = 'Less sugar', 'a parent can change any recipe');
  begin
    insert into public.food_recipes (family_id, title, photo_path) values (fa, 'Sneaky', fb || '/food/x.jpg');
    perform pg_temp.chk(false, 'a recipe pointed at another family''s photo');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.food_recipes where family_id = fa), 'another family sees our recipes');
  begin
    insert into public.food_recipes (family_id, title) values (fa, 'Spam');
    perform pg_temp.chk(false, 'another family added a recipe');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.food_ratings (recipe_id, member_id, family_id, value) values (rc, ben, fb, -1);
    perform pg_temp.chk(false, 'another family rated our recipe');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== avoid tags
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.food_avoid (family_id, member_id, kind, label) values (fa, kid, 'allergy', 'nuts');
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk(exists (select 1 from public.food_avoid where member_id = kid), 'whoever cooks can see allergies');
  begin
    insert into public.food_avoid (family_id, member_id, kind, label) values (fa, kid, 'dislike', 'peas');
    perform pg_temp.chk(false, 'a grown-up who is not a parent set a child''s allergies');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.food_avoid (family_id, member_id, kind, label) values (fa, gran, 'diet', 'vegetarian');
  perform pg_temp.chk(exists (select 1 from public.food_avoid where member_id = gran), 'a grown-up sets their own');
  perform pg_temp.act(uk, 'kid@test.dev');
  delete from public.food_avoid where member_id = kid;
  get diagnostics n = row_count; perform pg_temp.chk(n = 0, 'a child removed their own allergy');
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.food_avoid where family_id = fa), 'another family sees our allergies');

  -- ===== meal plan and dinner requests
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.food_plan (family_id, day, slot, recipe_id, cook) values (fa, current_date, 'dinner', rc, pat) returning id into pl;
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.food_plan (family_id, day, slot, title, status, cook) values (fa, current_date + 1, 'dinner', 'Pizza', 'planned', kid) returning id into req;
  perform pg_temp.chk((select status = 'requested' and cook is null and requested_by = kid from public.food_plan where id = req), 'a child''s meal goes in as a request');
  begin
    update public.food_plan set title = 'Chips' where id = pl;
    perform pg_temp.chk(false, 'a child changed the meal plan');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.food_plan set status = 'planned' where id = req;
    perform pg_temp.chk(false, 'a child approved their own request');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'food' and member_id in (ann, pat)) = 2, 'parents hear about a dinner request');
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    update public.food_plan set status = 'planned' where id = req;
    perform pg_temp.chk(false, 'a grown-up who is not a parent approved a request');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.food_plan set status = 'planned' where id = req;
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'food' and member_id = kid) = 1, 'the child hears the answer');
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    insert into public.food_plan (family_id, day, slot, title, cook) values (fa, current_date, 'lunch', 'x', ben);
    perform pg_temp.chk(false, 'someone from another family was made the cook');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== lunches
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.food_lunches (family_id, member_id, day, items) values (fa, kid, current_date, array['sandwich', 'apple']);
  begin
    insert into public.food_lunches (family_id, member_id, day, items) values (fa, tom, current_date, array['crisps']);
    perform pg_temp.chk(false, 'a child planned someone else''s lunch');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== shopping
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.food_lists (family_id, title) values (fa, 'Weekly shop') returning id into li;
  insert into public.food_list_items (list_id, family_id, name, aisle) values (li, fa, 'Milk', 'Dairy');
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.food_list_items (list_id, family_id, name) values (li, fa, 'milk ') returning id into it;
  perform pg_temp.chk((select aisle from public.food_list_items where id = it) = 'Dairy', 'items go to the aisle the family used before');
  perform pg_temp.chk((select used_count from public.food_known_items where family_id = fa and name_key = 'milk') = 2, 'the family''s usual items are remembered');
  perform pg_temp.chk((select added_by from public.food_list_items where id = it) = kid, 'items show who added them');
  perform pg_temp.act(ug, 'gran@test.dev');
  update public.food_list_items set done_at = now() where id = it;
  perform pg_temp.chk((select done_by from public.food_list_items where id = it) = gran, 'ticks record who ticked');
  perform pg_temp.act(uk, 'kid@test.dev');
  select id into x from public.food_list_items where name = 'Milk';
  begin
    update public.food_list_items set name = 'Sweets' where id = x;
    perform pg_temp.chk(false, 'a child changed someone else''s item');
  exception when others then perform pg_temp.chk(true, ''); end;
  delete from public.food_list_items where id = x;
  get diagnostics n = row_count; perform pg_temp.chk(n = 0, 'a child removed someone else''s item');
  begin
    insert into public.food_aisles (family_id, name) values (fa, 'Sweets');
    perform pg_temp.chk(false, 'a child changed the aisles');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.food_list_items where family_id = fa), 'another family sees our shopping');
  begin
    insert into public.food_list_items (list_id, family_id, name) values (li, fb, 'x');
    perform pg_temp.chk(false, 'an item slipped into another family''s list');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== stock and use-by alerts
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.food_stock (family_id, name, place, use_by) values (fa, 'Chicken', 'fridge', (now() at time zone 'Pacific/Kiritimati')::date) returning id into st;  -- "today" for that time zone
  perform pg_temp.sys();
  update public.families set timezone = 'Pacific/Kiritimati' where id = fa;  -- always after 08:00 somewhere for the test
  if (now() at time zone 'Pacific/Kiritimati')::time >= '08:00' then
    n := public.queue_food_alerts();
    perform pg_temp.chk((select count(*) from public.notifications where kind = 'food' and title like 'Use soon%' and member_id in (ann, pat, gran)) = 3, 'grown-ups hear what to use soon');
    perform pg_temp.chk((select count(*) from public.notifications where kind = 'food' and title like 'Use soon%' and member_id = kid) = 0, 'children are not sent use-by alerts');
    n := public.queue_food_alerts();
    perform pg_temp.chk((select count(*) from public.notifications where kind = 'food' and title like 'Use soon%' and member_id = ann) = 1, 'use-by alerts only once a day');
  end if;

  -- ===== takeaways
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.food_takeaways (family_id, name, phone) values (fa, 'Golden Dragon', '01234 567890') returning id into tk;
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.food_takeaway_orders (takeaway_id, family_id, member_id, order_text) values (tk, fa, kid, 'Chicken balls');
  begin
    insert into public.food_takeaway_orders (takeaway_id, family_id, member_id, order_text) values (tk, fa, gran, 'Nothing');
    perform pg_temp.chk(false, 'a child set someone else''s usual order');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.food_takeaways (family_id, name) values (fa, 'Sweet shop');
    perform pg_temp.chk(false, 'a child added a takeaway');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    perform pg_temp.act(ua, 'ann@test.dev');
    insert into public.food_takeaways (family_id, name, link) values (fa, 'Bad link', 'javascript:alert(1)');
    perform pg_temp.chk(false, 'a takeaway link that is not a web address');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== money: parents only
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.food_spend (family_id, amount, store) values (fa, 84.20, 'Tesco');
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.food_spend), 'a grown-up who is not a parent sees the food budget');
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.food_spend), 'a child sees the food budget');

  -- ===== calories: grown-ups only, private
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    insert into public.food_settings (member_id, family_id, calories_on) values (kid, fa, true);
    perform pg_temp.chk(false, 'a child switched calorie tracking on');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.food_diary (family_id, member_id, label, kcal) values (fa, kid, 'Toast', 200);
    perform pg_temp.chk(false, 'a child logged calories');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    insert into public.food_diary (family_id, member_id, label, kcal) values (fa, gran, 'Toast', 200);
    perform pg_temp.chk(false, 'calories logged before switching on');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.food_settings (member_id, family_id, calories_on) values (gran, fa, true);
  insert into public.food_diary (family_id, member_id, label, kcal) values (fa, gran, 'Toast', 200);
  perform pg_temp.chk(exists (select 1 from public.food_diary where member_id = gran), 'a grown-up logs their own calories');
  perform pg_temp.act(ua, 'ann@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.food_diary), 'a parent reads another grown-up''s calories');
  perform pg_temp.chk(not exists (select 1 from public.food_settings where member_id = gran), 'a parent reads another grown-up''s calorie settings');
  begin
    insert into public.food_diary (family_id, member_id, label, kcal) values (fa, gran, 'Cake', 900);
    perform pg_temp.chk(false, 'someone logged calories for someone else');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== fixes from the security review
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.food_plan (family_id, day, slot, title) values (fa, current_date + 4, 'dinner', 'Sweets for tea') returning id into x;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.food_plan set status = 'declined' where id = x;
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    update public.food_plan set status = 'planned' where id = x;
    perform pg_temp.chk(false, 'a grown-up who is not a parent overturned a parent''s no');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    update public.food_recipes set last_made = '1999-01-01' where id = rc;
    perform pg_temp.chk(false, 'someone rewrote when a recipe was last made');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    update public.food_recipes set last_made = null where id = rc;
    perform pg_temp.chk(false, 'someone cleared when a recipe was last made');
  exception when others then perform pg_temp.chk(true, ''); end;
  select id into x from public.food_list_items where name = 'Milk';
  begin
    update public.food_list_items set aisle = 'Sweets' where id = x;
    perform pg_temp.chk(false, 'a child moved someone else''s item to another aisle');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.food_known_items set aisle = 'Sweets' where family_id = fa;
  get diagnostics n = row_count; perform pg_temp.chk(n = 0, 'a child changed the family''s remembered aisles');
  insert into public.food_list_items (list_id, family_id, name, aisle) values (li, fa, 'Cheese', 'Sweets') returning id into x;
  perform pg_temp.chk((select aisle is distinct from 'Sweets' from public.food_list_items where id = x), 'a child taught the family a new aisle');
  -- removing a collection doesn't lock the recipes in it
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.food_collections (family_id, title) values (fa, 'Faves') returning id into col;
  update public.food_recipes set collections = array[col] where id = rc;
  delete from public.food_collections where id = col;
  perform pg_temp.act(ug, 'gran@test.dev');
  update public.food_recipes set notes = 'Still editable' where id = rc;
  perform pg_temp.chk((select notes from public.food_recipes where id = rc) = 'Still editable', 'a removed collection blocked editing a recipe');
  -- someone leaving doesn't lock the rows that mention them
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.food_list_items (list_id, family_id, name, assignee) values (li, fa, 'Batteries', tom) returning id into x;
  perform pg_temp.sys(); update public.family_members set archived_at = now() where id = tom;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.food_list_items set done_at = now() where id = x;
  perform pg_temp.chk((select done_at is not null from public.food_list_items where id = x), 'an item for someone who left can''t be ticked');
  perform pg_temp.sys(); update public.family_members set archived_at = null where id = tom;
  -- no oversized rows
  perform pg_temp.act(uk, 'kid@test.dev');
  big := repeat('x', 100000);
  begin
    insert into public.food_recipes (family_id, title, nutrition) values (fa, 'Big', jsonb_build_object('note', big));
    perform pg_temp.chk(false, 'an oversized recipe was saved');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.food_recipes (family_id, title, tags) values (fa, 'Big tags', array[big]);
    perform pg_temp.chk(false, 'oversized tags were saved');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.food_lunches (family_id, member_id, day, items) values (fa, kid, current_date + 9, array[big]);
    perform pg_temp.chk(false, 'an oversized lunch was saved');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.food_recipes (family_id, title, source_url) values (fa, 'Bad link', 'javascript:alert(1)');
    perform pg_temp.chk(false, 'a recipe link that is not a web address');
  exception when others then perform pg_temp.chk(true, ''); end;
  -- photos switch applies to food photos
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.board_settings set photos = false where member_id = kid;
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(not public.food_file_ok(fa || '/food/recipes/k.jpg', true), 'a child with photos off added a food photo');
  perform pg_temp.chk(not public.food_can_add_photo(), 'the import service would fetch a picture for a child with photos off');
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.board_settings set photos = true where member_id = kid;
  -- import rate limit
  perform pg_temp.sys();
  for n in 1..15 loop perform public.food_log_import(kid); end loop;
  perform pg_temp.chk(not public.food_log_import(kid), 'recipe imports are not limited');
  -- a private calendar event can't be attached to a meal by someone who can't see it
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.cal_events (family_id, title, starts_at, ends_at, visibility, viewers) values (fa, 'Surprise', now(), now() + interval '1 hour', 'selected', array[pat]) returning id into x;
  perform pg_temp.act(ug, 'gran@test.dev');
  begin
    update public.food_plan set cal_event_id = x where id = pl;
    perform pg_temp.chk(false, 'a meal was linked to a private event its editor can''t see');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== files
  perform pg_temp.act(ua, 'ann@test.dev');
  perform pg_temp.chk(public.food_file_ok(fa || '/food/recipes/a.jpg', true), 'a family member can add a food photo');
  perform pg_temp.chk(not public.food_file_ok(fa || '/board/a/a.jpg', false), 'the food rule opens other folders');
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not public.food_file_ok(fa || '/food/recipes/a.jpg', false), 'another family opens our food photos');
  perform pg_temp.act(null, null);
  begin
    select count(*) into n from public.food_recipes;
    perform pg_temp.chk(n = 0, 'a signed-out visitor reads recipes');
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
