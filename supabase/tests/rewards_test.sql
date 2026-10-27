-- Luex Life Rewards and Pocket Rewards access test. Creates throwaway families, tries to break every Board rule, then rolls
-- itself back (it always ends with an error carrying the report). Run after ANY change to Rewards access:
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
  fa uuid; fb uuid; ann uuid; pat uuid; gran uuid; kid uuid; ben uuid;
  ch uuid; cd uuid; hb uuid; hw uuid; rw uuid; shop uuid; sh uuid; cl uuid; jb uuid; x uuid; g uuid; tok text; n int; t text; d date; tz text;
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
  -- a time zone where it's daytime now, so the pay-day run happens
  select z into tz from unnest(array['Europe/London', 'Asia/Tokyo', 'America/New_York', 'Pacific/Kiritimati', 'Asia/Kolkata', 'America/Los_Angeles']) z
    where (now() at time zone z)::time between '08:00' and '17:00' limit 1;
  perform pg_temp.sys(); update public.families set timezone = tz where id = fa;
  d := (now() at time zone tz)::date;

  -- ===== set-up
  perform pg_temp.act(uk, 'kid@test.dev');
  perform public.reward_setup();
  perform pg_temp.chk((select children from public.reward_settings where family_id = fa), 'a household with children has pocket money on');

  -- ===== stars from the Calendar
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.chores (family_id, title, people, stars, money, needs_confirm) values (fa, 'Tidy room', array[kid], 3, 0.50, true) returning id into ch;
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.chore_done (family_id, chore_id, due_on, for_member) values (fa, ch, d, kid) returning id into cd;
  perform pg_temp.chk(pg_temp.st(kid) = 0, 'stars arrive before a parent confirms');
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.chore_done set confirmed_at = now() where id = cd;
  perform pg_temp.chk(pg_temp.st(kid) = 3, 'a confirmed chore earns its stars');
  perform pg_temp.chk(pg_temp.pb(kid, 'spend') = 0.50, 'a confirmed chore pays its money');
  delete from public.chore_done where id = cd;
  perform pg_temp.chk(pg_temp.st(kid) = 0 and pg_temp.pb(kid, 'spend') = 0, 'un-ticking takes the stars and money back');
  update public.chores set needs_photo = true where id = ch;
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    insert into public.chore_done (family_id, chore_id, due_on, for_member) values (fa, ch, d, kid);
    perform pg_temp.chk(false, 'a photo chore was ticked without a photo');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    insert into public.chore_done (family_id, chore_id, due_on, for_member, photo_path) values (fa, ch, d, kid, fa || '/rewards/' || ann || '/x.jpg');
    perform pg_temp.chk(false, 'a photo from someone else''s folder was used');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.chore_done (family_id, chore_id, due_on, for_member, photo_path) values (fa, ch, d, kid, fa || '/rewards/' || kid || '/p.jpg') returning id into cd;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.chore_done set confirmed_at = now() where id = cd;
  perform pg_temp.chk((select photo_path is null from public.chore_done where id = cd), 'the photo is let go once confirmed');
  perform pg_temp.chk(pg_temp.st(kid) = 3, 'stars after confirming a photo chore');

  -- Board goals
  insert into public.board_goals (family_id, title, people, stars) values (fa, 'Read 10 books', array[kid, ann], 5) returning id into g;
  update public.board_goals set done_at = now() where id = g;
  perform pg_temp.chk(pg_temp.st(kid) = 8 and pg_temp.st(ann) = 5, 'a finished goal pays everyone in it');
  update public.board_goals set done_at = null where id = g;
  perform pg_temp.chk(pg_temp.st(kid) = 3, 're-opening a goal takes its stars back');
  update public.board_goals set done_at = now() where id = g;

  -- ===== habits
  insert into public.habits (family_id, member_id, title, target, unit, stars, buddy) values (fa, ann, 'Water', 8, 'glasses', 2, pat) returning id into hb;
  insert into public.habit_logs (family_id, habit_id, member_id, day, count) values (fa, hb, ann, d, 5);
  perform pg_temp.chk(pg_temp.st(ann) = 5, 'a habit pays only when the target is reached');
  update public.habit_logs set count = 8 where habit_id = hb and day = d;
  perform pg_temp.chk(pg_temp.st(ann) = 7, 'reaching the target pays');
  update public.habit_logs set skipped = true where habit_id = hb and day = d;
  perform pg_temp.chk(pg_temp.st(ann) = 5, 'a skipped day doesn''t pay');
  update public.habit_logs set skipped = false where habit_id = hb and day = d;
  begin
    insert into public.habit_logs (family_id, habit_id, member_id, day, count) values (fa, hb, ann, d - 10, 8);
    perform pg_temp.chk(false, 'a habit was ticked for long ago');
  exception when others then perform pg_temp.chk(true, ''); end;
  insert into public.habits (family_id, member_id, title, per, target, stars) values (fa, ann, 'Gym', 'week', 2, 4) returning id into hw;
  insert into public.habit_logs (family_id, habit_id, member_id, day, count) values (fa, hw, ann, d, 1);
  perform pg_temp.chk(pg_temp.st(ann) = 7, 'a weekly habit waits for its target');
  insert into public.habit_logs (family_id, habit_id, member_id, day, count) values (fa, hw, ann, d - (case when extract(isodow from d) = 1 then -1 else 1 end), 1);
  perform pg_temp.chk(pg_temp.st(ann) = 11, 'a weekly habit pays at its target');
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.habits (family_id, member_id, title, stars) values (fa, kid, 'Brush teeth', 50) returning id into x;
  perform pg_temp.chk((select stars from public.habits where id = x) = 0, 'a child set their own stars');
  perform pg_temp.chk(not exists (select 1 from public.habits where id = hb), 'a child sees a grown-up''s habit');
  -- the buddy
  perform pg_temp.act(up, 'pat@test.dev');
  perform pg_temp.chk(exists (select 1 from public.habit_logs where habit_id = hb), 'the buddy sees the habit''s ticks');
  perform pg_temp.chk(not exists (select 1 from public.habits where id = hw), 'the other grown-up sees a habit that isn''t shared');
  perform pg_temp.chk(not exists (select 1 from public.star_entries where member_id = ann), 'one grown-up sees another''s stars');
  perform public.reward_cheer(hb); perform public.reward_cheer(hb);
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where member_id = ann and title like '%cheering%') = 1, 'a cheer arrives once a day');
  perform pg_temp.act(up, 'pat@test.dev');
  begin
    update public.habit_logs set count = 0 where habit_id = hb;
    get diagnostics n = row_count; perform pg_temp.chk(n = 0, 'the buddy changed someone''s ticks');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.star_entries where member_id = kid), 'a grown-up who isn''t a parent sees a child''s stars');
  begin
    perform public.reward_cheer(hb);
    perform pg_temp.chk(false, 'someone who isn''t the buddy cheered');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== spending stars: my rewards
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.rewards (family_id, kind, owner, title, stars) values (fa, 'me', ann, 'New trainers', 10) returning id into rw;
  insert into public.reward_claims (family_id, reward_id, member_id) values (fa, rw, ann) returning id into cl;
  perform pg_temp.chk((select status from public.reward_claims where id = cl) = 'approved' and pg_temp.st(ann) = 1, 'a grown-up treats themselves straight away');
  begin
    insert into public.reward_claims (family_id, reward_id, member_id) values (fa, rw, ann);
    perform pg_temp.chk(false, 'a reward was claimed without enough stars');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(up, 'pat@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.rewards where id = rw), 'another grown-up sees my own reward');

  -- the children's shop
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    insert into public.rewards (family_id, kind, title, stars) values (fa, 'shop', 'Free sweets', 1);
    perform pg_temp.chk(false, 'a child stocked the shop');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.rewards (family_id, kind, title, stars) values (fa, 'shop', 'Film night pick', 4) returning id into shop;
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.reward_claims (family_id, reward_id, member_id) values (fa, shop, kid) returning id into cl;
  perform pg_temp.chk((select status from public.reward_claims where id = cl) = 'waiting' and pg_temp.st(kid) = 8, 'a child''s request waits for a parent');
  update public.reward_claims set status = 'approved' where id = cl;
  get diagnostics n = row_count;
  perform pg_temp.chk((select status from public.reward_claims where id = cl) = 'waiting', 'a child approved their own request');
  perform pg_temp.sys();
  perform pg_temp.chk((select count(*) from public.notifications where kind = 'reward' and title like 'Kid would like%' and member_id in (ann, pat)) = 2, 'both parents hear about a request');
  perform pg_temp.act(up, 'pat@test.dev');
  update public.reward_claims set status = 'approved' where id = cl;
  perform pg_temp.chk(pg_temp.st(kid) = 4, 'approving spends the stars');

  -- a shared reward
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.rewards (family_id, kind, people, title, stars) values (fa, 'shared', array[ann, kid], 'Pizza night', 5) returning id into sh;
  insert into public.reward_gives (family_id, reward_id, member_id, stars) values (fa, sh, ann, 1);
  begin
    insert into public.reward_gives (family_id, reward_id, member_id, stars) values (fa, sh, ann, 50);
    perform pg_temp.chk(false, 'more stars were given than someone has');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.reward_gives (family_id, reward_id, member_id, stars) values (fa, sh, kid, 4);
  perform pg_temp.chk((select done_at is not null from public.rewards where id = sh), 'a shared reward is reached when the stars add up');
  perform pg_temp.act(up, 'pat@test.dev');
  begin
    insert into public.reward_gives (family_id, reward_id, member_id, stars) values (fa, sh, pat, 1);
    perform pg_temp.chk(false, 'someone outside a shared reward gave to it');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== pocket money
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.reward_people (member_id, family_id, pocket_amount, save_pct, give_pct, next_pay) values (kid, fa, 5, 20, 10, d);
  perform pg_temp.act(uk, 'kid@test.dev');
  update public.reward_people set pocket_amount = 500 where member_id = kid;
  perform pg_temp.chk((select pocket_amount from public.reward_people where member_id = kid) = 5, 'a child raised their own pocket money');
  perform pg_temp.chk(tz is not null, 'a daytime zone was found for the pay-day check');
  if tz is not null then
    perform pg_temp.sys();
    n := public.queue_reward_jobs(); n := public.queue_reward_jobs();
    perform pg_temp.chk(pg_temp.pb(kid, 'spend') = 0.50 + 3.50 and pg_temp.pb(kid, 'save') = 1 and pg_temp.pb(kid, 'give') = 0.50,
      'pay day splits into the pots, once');
    perform pg_temp.chk((select next_pay from public.reward_people where member_id = kid) = d + 7, 'the next pay day moves on');
  end if;
  perform pg_temp.sys(); delete from public.pocket_entries where member_id = kid and kind = 'pay';
  insert into public.pocket_entries (family_id, member_id, pot, amount, kind) values (fa, kid, 'spend', 4, 'other');
  -- spending waits for a parent
  perform pg_temp.act(uk, 'kid@test.dev');
  insert into public.pocket_entries (family_id, member_id, amount, kind, note) values (fa, kid, 2, 'spend', 'Sweets') returning id into x;
  perform pg_temp.chk((select status = 'waiting' and amount = -2 from public.pocket_entries where id = x), 'a child''s spending waits and counts as money out');
  begin
    insert into public.pocket_entries (family_id, member_id, amount, kind) values (fa, kid, 100, 'gift');
    perform pg_temp.chk(false, 'a child gave themselves money');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.pocket_entries set status = 'ok' where id = x;
  perform pg_temp.chk((select status from public.pocket_entries where id = x) = 'waiting', 'a child approved their own spending');
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.pocket_entries set status = 'ok' where id = x;
  perform pg_temp.chk(pg_temp.pb(kid, 'spend') = 2.50, 'approved spending comes off');
  begin
    delete from public.pocket_entries where member_id = kid and kind = 'chore';
    get diagnostics n = row_count; perform pg_temp.chk(n = 0, 'chore money was removed by hand');
  exception when others then perform pg_temp.chk(true, ''); end;
  -- deductions
  begin
    insert into public.pocket_entries (family_id, member_id, amount, kind) values (fa, kid, 1, 'deduction');
    perform pg_temp.chk(false, 'a deduction while deductions are off');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.reward_settings set deductions_on = true where family_id = fa;
  insert into public.pocket_entries (family_id, member_id, amount, kind) values (fa, kid, 1, 'deduction');
  perform pg_temp.chk(pg_temp.pb(kid, 'spend') = 1.50, 'a deduction comes off when switched on');
  -- a gift from Gran
  perform pg_temp.act(ug, 'gran@test.dev');
  insert into public.pocket_entries (family_id, member_id, amount, kind, note) values (fa, kid, 20, 'birthday', 'Happy birthday');
  perform pg_temp.chk(not exists (select 1 from public.pocket_entries where member_id = kid), 'a grown-up who isn''t a parent reads a child''s money');
  perform pg_temp.act(ua, 'ann@test.dev');
  perform pg_temp.chk((select status from public.pocket_entries where member_id = kid and kind = 'birthday') = 'waiting', 'a gift waits for a parent');
  begin
    perform pg_temp.act(ug, 'gran@test.dev');
    insert into public.pocket_entries (family_id, member_id, amount, kind) values (fa, ann, 20, 'gift');
    perform pg_temp.chk(false, 'a gift was put in a grown-up''s jar');
  exception when others then perform pg_temp.chk(true, ''); end;
  -- moving money and swapping stars
  perform pg_temp.act(uk, 'kid@test.dev');
  perform public.reward_move(kid, 'spend', 'save', 1);
  perform pg_temp.chk(pg_temp.pb(kid, 'save') = 1, 'a child saves money');
  begin
    perform public.reward_move(kid, 'save', 'spend', 1);
    perform pg_temp.chk(false, 'a child took money out of savings');
  exception when others then perform pg_temp.chk(true, ''); end;
  begin
    perform public.reward_swap(kid, 2);
    perform pg_temp.chk(false, 'stars were swapped while swapping is off');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(ua, 'ann@test.dev');
  update public.reward_settings set stars_per_pound = 2 where family_id = fa;
  insert into public.star_entries (family_id, member_id, delta, kind, note) values (fa, kid, 2, 'bonus', 'Kind to sister');
  perform pg_temp.chk(pg_temp.st(kid) = 2, 'a parent gives bonus stars');
  perform pg_temp.act(uk, 'kid@test.dev');
  perform public.reward_swap(kid, 2);
  perform pg_temp.chk(pg_temp.st(kid) = 0 and pg_temp.pb(kid, 'spend') = 1.50, 'stars swap for money at the household''s rate');
  begin
    perform public.reward_advance(kid, 10, 1);
    perform pg_temp.chk(false, 'a child gave themselves an advance');
  exception when others then perform pg_temp.chk(true, ''); end;
  -- a savings goal from a wish list
  perform pg_temp.act(ua, 'ann@test.dev');
  insert into public.pocket_goals (family_id, member_id, title, target) values (fa, kid, 'Lego', 2.5) returning id into g;
  perform public.reward_move(kid, 'spend', 'save', 1.5);
  perform pg_temp.chk((select reached_at is not null from public.pocket_goals where id = g), 'a goal is reached when the savings get there');
  perform public.reward_advance(kid, 10, 2);
  perform pg_temp.chk((select advance_owed from public.reward_people where member_id = kid) = 10, 'an advance is remembered');
  -- a grown-up's treat jar
  perform pg_temp.act(up, 'pat@test.dev');
  insert into public.reward_people (member_id, family_id, pocket_amount, interest_pct) values (pat, fa, 10, 5);
  perform pg_temp.chk((select interest_pct from public.reward_people where member_id = pat) = 0, 'a grown-up paid themselves interest');
  perform pg_temp.chk(exists (select 1 from public.reward_people where member_id = kid), 'a parent sees a child''s pocket money settings');
  perform pg_temp.act(ua, 'ann@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.reward_people where member_id = pat), 'one grown-up sees another''s treat jar');
  perform pg_temp.act(uk, 'kid@test.dev');
  begin
    insert into public.star_entries (family_id, member_id, delta, kind) values (fa, kid, 50, 'bonus');
    perform pg_temp.chk(false, 'a child gave themselves stars');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== up-for-grabs jobs
  perform pg_temp.act(up, 'pat@test.dev');
  insert into public.reward_jobs (family_id, title, money, stars, people, needs_photo) values (fa, 'Wash the car', 3, 2, array[kid], true) returning id into jb;
  perform pg_temp.act(ua, 'ann@test.dev');
  begin
    update public.reward_jobs set claimed_by = ann where id = jb;
    perform pg_temp.chk(false, 'someone claimed a job that isn''t for them');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(uk, 'kid@test.dev');
  update public.reward_jobs set claimed_by = kid where id = jb;
  begin
    update public.reward_jobs set done_at = now() where id = jb;
    perform pg_temp.chk(false, 'a photo job was done without a photo');
  exception when others then perform pg_temp.chk(true, ''); end;
  update public.reward_jobs set done_at = now(), photo_path = fa || '/rewards/' || kid || '/car.jpg' where id = jb;
  begin
    update public.reward_jobs set confirmed_at = now() where id = jb;
    perform pg_temp.chk(false, 'someone confirmed their own job');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.act(up, 'pat@test.dev');
  perform pg_temp.chk(public.reward_file_ok(fa || '/rewards/' || kid || '/car.jpg', false), 'the person who set the job sees its photo');
  update public.reward_jobs set confirmed_at = now() where id = jb;
  perform pg_temp.act(ua, 'ann@test.dev');
  perform pg_temp.chk(pg_temp.st(kid) = 2 and pg_temp.pb(kid, 'spend') = 13, 'a confirmed job pays');
  perform pg_temp.chk((select photo_path is null from public.reward_jobs where id = jb), 'a job photo is let go once confirmed');

  -- ===== files
  perform pg_temp.act(uk, 'kid@test.dev');
  perform pg_temp.chk(public.reward_file_ok(fa || '/rewards/' || kid || '/a.jpg', true), 'a person adds their own photo');
  perform pg_temp.chk(not public.reward_file_ok(fa || '/rewards/' || ann || '/a.jpg', false), 'a child opens a grown-up''s photo');
  perform pg_temp.act(ug, 'gran@test.dev');
  perform pg_temp.chk(not public.reward_file_ok(fa || '/rewards/' || kid || '/a.jpg', false), 'a grown-up who isn''t a parent opens a child''s photo');

  -- ===== other families and visitors
  perform pg_temp.act(ub, 'ben@test.dev');
  perform pg_temp.chk(not exists (select 1 from public.star_entries where family_id = fa), 'another family sees our stars');
  perform pg_temp.chk(not exists (select 1 from public.rewards where family_id = fa), 'another family sees our rewards');
  perform pg_temp.chk(not exists (select 1 from public.reward_balances() where member_id = kid), 'another family sees balances');
  begin
    perform public.reward_move(kid, 'spend', 'save', 1);
    perform pg_temp.chk(false, 'another family moved our child''s money');
  exception when others then perform pg_temp.chk(true, ''); end;
  perform pg_temp.chk(not public.reward_file_ok(fa || '/rewards/' || kid || '/a.jpg', false), 'another family opens our photos');
  perform pg_temp.act(null, null);
  begin
    select count(*) into n from public.pocket_entries;
    perform pg_temp.chk(n = 0, 'a signed-out visitor reads pocket money');
  exception when others then perform pg_temp.chk(true, ''); end;

  -- ===== the weekly bonus counts due chores
  perform pg_temp.sys();
  perform pg_temp.chk(public.reward_chore_due((select c from public.chores c where id = ch), date '2030-01-07') = 7, 'a daily chore is due 7 times a week');

  perform pg_temp.sys();
  select count(*) filter (where passed), string_agg(case when not passed then E'\nFAIL: ' || msg end, '')
    into n, t from t_results;
  if (select count(*) from t_results where not passed) = 0 then
    raise exception 'REPORT: ALL % CHECKS PASSED', n;
  else
    raise exception 'REPORT: % passed, % FAILED%', n, (select count(*) from t_results where not passed), t;
  end if;
end $$;
