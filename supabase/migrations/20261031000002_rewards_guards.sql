-- Rewards and Pocket Money, part 2 of 3 (guards, earning, actions, files). See part 1 for the rules.

-- ---------------------------------------------------------------- helpers

create or replace function public.reward_sys() returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('luex.rewardsys', true), 'off') = 'on' and pg_trigger_depth() > 0
$$;
revoke all on function public.reward_sys() from public, anon, authenticated;

create or replace function public.reward_role(m uuid) returns text language sql stable security definer set search_path = '' as $$
  select role from public.family_members where id = m
$$;
revoke all on function public.reward_role(uuid) from public, anon, authenticated;

create or replace function public.reward_star_balance(m uuid) returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(delta), 0)::integer from public.star_entries where member_id = m
$$;
create or replace function public.reward_pot_balance(m uuid, p text) returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount), 0) from public.pocket_entries where member_id = m and pot = p and status = 'ok'
$$;
revoke all on function public.reward_star_balance(uuid), public.reward_pot_balance(uuid, text) from public, anon, authenticated;

-- the parents of a family who can get notifications
create or replace function public.reward_parents(f uuid) returns setof uuid language sql stable security definer set search_path = '' as $$
  select id from public.family_members where family_id = f and role = 'parent' and archived_at is null and user_id is not null
$$;
revoke all on function public.reward_parents(uuid) from public, anon, authenticated;

-- a notification, if this person wants that kind
create or replace function public.reward_notify(m uuid, alert text, title text, body text, link text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select alert = any(alerts) from public.reward_people where member_id = m), true) then
    perform public.notify(m, 'reward', title, body, link, null, interval '0');
  end if;
end $$;
revoke all on function public.reward_notify(uuid, text, text, text, text) from public, anon, authenticated;

-- write entries as the system (the guard lets them through)
create or replace function public.reward_add_stars(f uuid, m uuid, d integer, k text, key text, note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if d = 0 then return; end if;
  perform set_config('luex.rewardsys', 'on', true);
  insert into public.star_entries (family_id, member_id, delta, kind, source_key, note)
    values (f, m, d, k, key, left(coalesce(note, ''), 120)) on conflict (source_key) do nothing;
  perform set_config('luex.rewardsys', 'off', true);
end $$;
create or replace function public.reward_add_money(f uuid, m uuid, p text, a numeric, k text, key text, note text, d date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if a = 0 then return; end if;
  perform set_config('luex.rewardsys', 'on', true);
  insert into public.pocket_entries (family_id, member_id, pot, amount, kind, source_key, note, on_date)
    values (f, m, p, a, k, key, left(coalesce(note, ''), 120), coalesce(d, public.family_today(f))) on conflict (source_key) do nothing;
  perform set_config('luex.rewardsys', 'off', true);
end $$;
-- (each delete is its own small function)
create or replace function public.reward_remove_stars(key_like text)
returns void language sql security definer set search_path = '' as $$
  delete from public.star_entries where source_key like key_like
$$;
create or replace function public.reward_remove_money(key_like text)
returns void language sql security definer set search_path = '' as $$
  delete from public.pocket_entries where source_key like key_like
$$;
revoke all on function public.reward_remove_stars(text), public.reward_remove_money(text) from public, anon, authenticated;

create or replace function public.reward_remove(key_like text)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  -- taking earnings back must never leave someone owing stars or money they've already used
  for r in select member_id, sum(delta) as d from public.star_entries where source_key like key_like group by member_id loop
    perform 1 from public.family_members where id = r.member_id for update;
    if public.reward_star_balance(r.member_id) - r.d < 0 then raise exception 'Those stars have already been spent, so this can''t be undone'; end if;
  end loop;
  for r in select member_id, pot, sum(amount) as a from public.pocket_entries where source_key like key_like and status = 'ok' group by member_id, pot loop
    perform 1 from public.family_members where id = r.member_id for update;
    if public.reward_pot_balance(r.member_id, r.pot) - r.a < 0 then raise exception 'That money has already been used, so this can''t be undone'; end if;
  end loop;
  perform set_config('luex.rewardsys', 'on', true);
  perform public.reward_remove_stars(key_like);
  perform public.reward_remove_money(key_like);
  perform set_config('luex.rewardsys', 'off', true);
end $$;
revoke all on function public.reward_add_stars(uuid, uuid, integer, text, text, text), public.reward_add_money(uuid, uuid, text, numeric, text, text, text, date),
  public.reward_remove(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- the guard

create or replace function public.stamp_reward_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.my_member_id();
  parent boolean;
  my_role text;
  target_role text;
  r public.rewards%rowtype;
  h public.habits%rowtype;
  s public.reward_settings%rowtype;
  today date;
begin
  if (select auth.uid()) is null or public.reward_sys() then return new; end if;
  if new.family_id is distinct from public.my_family_id() then raise exception 'That change is not allowed'; end if;
  if tg_op = 'UPDATE' and new.family_id <> old.family_id then raise exception 'That change is not allowed'; end if;
  parent := public.is_family_parent(new.family_id);
  my_role := public.reward_role(me);
  today := public.family_today(new.family_id);

  case tg_table_name
    when 'reward_settings' then
      new.updated_at := now();

    when 'reward_people' then
      if not public.members_in_family(new.family_id, array[new.member_id]) then raise exception 'That person is not in this family'; end if;
      target_role := public.reward_role(new.member_id);
      if new.member_id = me and my_role = 'child' then
        -- children only choose their notifications
        if tg_op = 'INSERT' then
          new.pocket_amount := 0; new.pocket_every := 'week'; new.next_pay := null; new.save_pct := 0; new.give_pct := 0;
          new.paused_until := null; new.interest_pct := 0; new.match_pct := 0; new.teen_mode := false; new.advance_repay := 0;
        else
          new.pocket_amount := old.pocket_amount; new.pocket_every := old.pocket_every; new.next_pay := old.next_pay;
          new.save_pct := old.save_pct; new.give_pct := old.give_pct; new.paused_until := old.paused_until;
          new.interest_pct := old.interest_pct; new.match_pct := old.match_pct; new.teen_mode := old.teen_mode; new.advance_repay := old.advance_repay;
        end if;
      elsif target_role <> 'child' then
        -- a grown-up's own treat jar: no interest, matching, teen mode or advances
        new.interest_pct := 0; new.match_pct := 0; new.teen_mode := false; new.advance_repay := 0;
      end if;
      if tg_op = 'INSERT' then new.advance_owed := 0; end if;
      if new.pocket_amount > 0 and new.next_pay is null then new.next_pay := today; end if;
      if new.next_pay is not null and new.next_pay < today - 1 and (tg_op = 'INSERT' or new.next_pay is distinct from old.next_pay) then
        raise exception 'Pick today or a day after';
      end if;
      new.updated_at := now();

    when 'star_entries' then
      -- by hand: a parent's bonus or deduction for a child
      if not parent or public.reward_role(new.member_id) <> 'child' then raise exception 'That change is not allowed'; end if;
      if new.kind = 'bonus' and new.delta > 0 then null;
      elsif new.kind = 'deduction' and new.delta < 0 then
        if not coalesce((select deductions_on from public.reward_settings where family_id = new.family_id), false) then
          raise exception 'Deductions are switched off';
        end if;
        perform 1 from public.family_members where id = new.member_id for update;
        if public.reward_star_balance(new.member_id) + new.delta < 0 then raise exception 'They don''t have that many stars'; end if;
      else raise exception 'That change is not allowed'; end if;
      new.created_by := me; new.created_at := now(); new.source_key := null;

    when 'habits' then
      if new.buddy is not null and (new.buddy = new.member_id or not public.members_in_family(new.family_id, array[new.buddy])) then
        raise exception 'Pick someone else in your household';
      end if;
      if tg_op = 'INSERT' then
        new.created_by := me; new.created_at := now(); new.archived_at := null;
        if my_role = 'child' then new.stars := 0; end if;
      else
        -- a child can't change how a habit pays, or put away one a grown-up set
        if my_role = 'child' and (old.stars > 0 or old.created_by is distinct from me) then
          new.stars := old.stars; new.per := old.per; new.target := old.target; new.archived_at := old.archived_at;
        elsif my_role = 'child' then
          new.stars := old.stars;
        end if;
      end if;

    when 'habit_logs' then
      select * into h from public.habits where id = new.habit_id;
      if not found or h.family_id <> new.family_id or h.member_id <> new.member_id or h.archived_at is not null then
        raise exception 'That change is not allowed';
      end if;
      if tg_op = 'UPDATE' and (new.habit_id <> old.habit_id or new.day <> old.day or new.member_id <> old.member_id) then
        raise exception 'That change is not allowed';
      end if;
      if new.day > today or new.day < today - 7 then raise exception 'That day is too far away to tick'; end if;
      new.updated_at := now();

    when 'rewards' then
      if tg_op = 'INSERT' then
        new.created_by := me; new.created_at := now(); new.done_at := null; new.archived_at := null;
      end if;
      if new.kind = 'me' then
        if not public.reward_sees(new.family_id, new.owner) then raise exception 'That change is not allowed'; end if;
      elsif new.kind = 'shared' then
        if not public.is_family_adult(new.family_id) then raise exception 'Ask a grown-up to set this up'; end if;
        if not public.members_in_family(new.family_id, new.people) then raise exception 'Those people are not in this family'; end if;
        if tg_op = 'UPDATE' and old.created_by is distinct from me and not parent then raise exception 'Only the person who set this up can change it'; end if;
      else
        if not parent then raise exception 'Only a parent can change the reward shop'; end if;
      end if;
      if tg_op = 'UPDATE' and old.done_at is not null and (new.stars <> old.stars or new.people <> old.people) then
        raise exception 'This one is already reached';
      end if;

    when 'reward_gives' then
      select * into r from public.rewards where id = new.reward_id;
      if not found or r.family_id <> new.family_id or r.kind <> 'shared' or r.done_at is not null or r.archived_at is not null then
        raise exception 'That reward isn''t open';
      end if;
      if new.member_id <> me or not (cardinality(r.people) = 0 or me = any(r.people)) then raise exception 'That change is not allowed'; end if;
      perform 1 from public.family_members where id = me for update;
      if public.reward_star_balance(me) < new.stars then raise exception 'You don''t have that many stars'; end if;
      new.created_at := now();

    when 'reward_claims' then
      if tg_op = 'INSERT' then
        select * into r from public.rewards where id = new.reward_id;
        if not found or r.family_id <> new.family_id or r.archived_at is not null or r.kind = 'shared'
           or (r.kind = 'me' and r.owner <> new.member_id) then
          raise exception 'That reward isn''t open';
        end if;
        if new.member_id <> me and not parent then raise exception 'That change is not allowed'; end if;
        new.stars := r.stars;
        perform 1 from public.family_members where id = new.member_id for update;
        if public.reward_star_balance(new.member_id) < new.stars then raise exception 'Not enough stars yet'; end if;
        new.created_at := now();
        if parent or (my_role <> 'child' and new.member_id = me)
           or (r.kind = 'me' and coalesce((select teen_mode from public.reward_people where member_id = new.member_id), false)) then
          new.status := 'approved'; new.decided_by := me; new.decided_at := now();
        else
          new.status := 'waiting'; new.decided_by := null; new.decided_at := null;
        end if;
      else
        if not parent or old.status <> 'waiting' or new.status not in ('approved', 'declined')
           or new.reward_id <> old.reward_id or new.member_id <> old.member_id or new.stars <> old.stars then
          raise exception 'That change is not allowed';
        end if;
        perform 1 from public.family_members where id = new.member_id for update;
        if new.status = 'approved' and public.reward_star_balance(new.member_id) < new.stars then raise exception 'Not enough stars yet'; end if;
        new.decided_by := me; new.decided_at := now();
      end if;

    when 'pocket_entries' then
      if tg_op = 'INSERT' then
        target_role := public.reward_role(new.member_id);
        if new.on_date > today or new.on_date < today - 366 then raise exception 'Pick a date in the last year'; end if;
        new.created_by := me; new.created_at := now(); new.decided_by := null; new.decided_at := null;
        -- a phone's own key for something added without a signal (so a retry never saves it twice)
        if new.source_key is not null and new.source_key !~ '^device:[0-9a-f-]{36}$' then new.source_key := null; end if;
        -- the sign follows the kind
        if new.kind in ('bonus', 'gift', 'tooth_fairy', 'birthday', 'other') and new.amount < 0 then raise exception 'That change is not allowed'; end if;
        if new.kind in ('deduction', 'spend', 'cash') and new.amount > 0 then new.amount := -new.amount; end if;
        if parent and target_role = 'child' then
          if new.kind not in ('bonus', 'deduction', 'spend', 'cash', 'gift', 'tooth_fairy', 'birthday', 'other') then raise exception 'That change is not allowed'; end if;
          if new.kind = 'deduction' and not coalesce((select deductions_on from public.reward_settings where family_id = new.family_id), false) then
            raise exception 'Deductions are switched off';
          end if;
          new.status := 'ok';
        elsif new.member_id = me and my_role <> 'child' then
          -- a grown-up's own treat jar
          if new.kind not in ('spend', 'gift', 'other') then raise exception 'That change is not allowed'; end if;
          new.pot := 'spend'; new.status := 'ok';
        elsif new.member_id = me then
          -- a child records their own spending; it waits for a parent unless they're in teen mode
          if new.kind <> 'spend' then raise exception 'That change is not allowed'; end if;
          new.status := case when coalesce((select teen_mode from public.reward_people where member_id = me), false) then 'ok' else 'waiting' end;
        elsif public.is_family_adult(new.family_id) and target_role = 'child' and new.kind in ('gift', 'birthday') then
          new.status := 'waiting';
        else
          raise exception 'That change is not allowed';
        end if;
        if new.amount < 0 then
          perform 1 from public.family_members where id = new.member_id for update;
          if new.status = 'ok' and public.reward_pot_balance(new.member_id, new.pot) + new.amount < 0 then
            raise exception 'There isn''t that much in that pot';
          end if;
        end if;
      else
        if not parent or old.status <> 'waiting' or new.status not in ('ok', 'declined')
           or new.member_id <> old.member_id or new.amount <> old.amount or new.pot <> old.pot or new.kind <> old.kind then
          raise exception 'That change is not allowed';
        end if;
        perform 1 from public.family_members where id = new.member_id for update;
        if new.status = 'ok' and new.amount < 0 and public.reward_pot_balance(new.member_id, new.pot) + new.amount < 0 then
          raise exception 'There isn''t that much in that pot';
        end if;
        new.decided_by := me; new.decided_at := now();
      end if;

    when 'pocket_goals' then
      if tg_op = 'INSERT' then
        new.created_by := me; new.created_at := now(); new.reached_at := null; new.archived_at := null;
        if new.wish_item_id is not null and not exists (
            select 1 from public.wish_items i join public.wish_lists l on l.id = i.list_id
            where i.id = new.wish_item_id and i.family_id = new.family_id and l.owner_member = new.member_id) then
          raise exception 'That wish list item isn''t theirs';
        end if;
      end if;

    when 'reward_jobs' then
      if tg_op = 'INSERT' then
        if not public.members_in_family(new.family_id, new.people) then raise exception 'Those people are not in this family'; end if;
        new.created_by := me; new.created_at := now(); new.claimed_by := null; new.claimed_at := null; new.done_at := null;
        new.photo_path := null; new.confirmed_by := null; new.confirmed_at := null; new.archived_at := null;
      elsif new.confirmed_at is distinct from old.confirmed_at then
        -- confirming: the person who set it up (or a parent), never the person who did it
        if old.confirmed_at is not null or new.confirmed_at is null or old.done_at is null or old.claimed_by is null
           or me = old.claimed_by or not (me = old.created_by or parent)
           or (public.reward_role(old.claimed_by) = 'child' and not parent and (old.money > 0 or old.stars > 0))
           or new.title <> old.title or new.money <> old.money or new.stars <> old.stars or new.people <> old.people
           or new.claimed_by is distinct from old.claimed_by or new.done_at is distinct from old.done_at
           or new.archived_at is distinct from old.archived_at then
          raise exception 'That change is not allowed';
        end if;
        new.confirmed_by := me; new.confirmed_at := now(); new.photo_path := old.photo_path;
      elsif new.claimed_by is distinct from old.claimed_by or new.done_at is distinct from old.done_at or new.photo_path is distinct from old.photo_path then
        if old.confirmed_at is not null or old.archived_at is not null
           or new.title <> old.title or new.money <> old.money or new.stars <> old.stars or new.people <> old.people
           or new.needs_photo <> old.needs_photo or new.archived_at is distinct from old.archived_at then
          raise exception 'That change is not allowed';
        end if;
        if old.claimed_by is null and new.claimed_by = me then
          if not (cardinality(old.people) = 0 or me = any(old.people)) then raise exception 'That job isn''t for you'; end if;
          if new.done_at is not null or new.photo_path is not null then raise exception 'That change is not allowed'; end if;
          new.claimed_at := now();
        elsif old.claimed_by = me and new.claimed_by is null then
          if old.done_at is not null then raise exception 'That change is not allowed'; end if;
          new.claimed_at := null; new.photo_path := null;
        elsif old.claimed_by = me and new.claimed_by = me then
          if new.photo_path is not null and new.photo_path not like new.family_id::text || '/rewards/' || me::text || '/%' then
            raise exception 'That change is not allowed';
          end if;
          if new.photo_path is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'reward-files' and o.name = new.photo_path) then
            raise exception 'Add a photo first';
          end if;
          if new.done_at is not null then
            if old.needs_photo and new.photo_path is null then raise exception 'Add a photo first'; end if;
            new.done_at := coalesce(old.done_at, now());
          end if;
        else
          raise exception 'That change is not allowed';
        end if;
      else
        if not (me = old.created_by or parent) or old.confirmed_at is not null then raise exception 'That change is not allowed'; end if;
        if old.claimed_by is not null and (new.money <> old.money or new.stars <> old.stars) then
          raise exception 'Someone is already doing this, so the pay can''t change';
        end if;
        if not public.members_in_family(new.family_id, new.people) then raise exception 'Those people are not in this family'; end if;
      end if;

    else null;
  end case;
  return new;
end $$;
revoke all on function public.stamp_reward_row() from public, anon, authenticated;

create trigger reward_settings_stamp before insert or update on public.reward_settings for each row execute function public.stamp_reward_row();
create trigger reward_people_stamp before insert or update on public.reward_people for each row execute function public.stamp_reward_row();
create trigger star_entries_stamp before insert on public.star_entries for each row execute function public.stamp_reward_row();
create trigger habits_stamp before insert or update on public.habits for each row execute function public.stamp_reward_row();
create trigger habit_logs_stamp before insert or update on public.habit_logs for each row execute function public.stamp_reward_row();
create trigger rewards_stamp before insert or update on public.rewards for each row execute function public.stamp_reward_row();
create trigger reward_gives_stamp before insert on public.reward_gives for each row execute function public.stamp_reward_row();
create trigger reward_claims_stamp before insert or update on public.reward_claims for each row execute function public.stamp_reward_row();
create trigger pocket_entries_stamp before insert or update on public.pocket_entries for each row execute function public.stamp_reward_row();
create trigger pocket_goals_stamp before insert or update on public.pocket_goals for each row execute function public.stamp_reward_row();
create trigger reward_jobs_stamp before insert or update on public.reward_jobs for each row execute function public.stamp_reward_row();

-- only money typed in by hand can be removed by hand (pay, chores, jobs and the rest are the system's)
create or replace function public.guard_pocket_remove()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.reward_sys()
     and old.kind not in ('bonus', 'deduction', 'spend', 'cash', 'gift', 'tooth_fairy', 'birthday', 'other') then
    raise exception 'That can''t be removed by hand';
  end if;
  return old;
end $$;
revoke all on function public.guard_pocket_remove() from public, anon, authenticated;
create trigger pocket_entries_remove before delete on public.pocket_entries for each row execute function public.guard_pocket_remove();

-- ---------------------------------------------------------------- earning from the Calendar and the Board

create or replace function public.after_chore_done_reward()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.chores%rowtype;
begin
  if tg_op = 'DELETE' then
    -- a chore that's been removed keeps what it already earned
    if exists (select 1 from public.chores where id = old.chore_id) then perform public.reward_remove('chore:' || old.id::text); end if;
    return null;
  end if;
  if new.confirmed_at is null then return null; end if;
  select * into c from public.chores where id = new.chore_id;
  perform public.reward_add_stars(new.family_id, new.for_member, new.stars, 'chore', 'chore:' || new.id, c.title);
  if coalesce(c.money, 0) > 0 then
    perform public.reward_add_money(new.family_id, new.for_member, 'spend', c.money, 'chore', 'chore:' || new.id, c.title, new.due_on);
  end if;
  return null;
end $$;
revoke all on function public.after_chore_done_reward() from public, anon, authenticated;
create trigger chore_done_reward after insert or update or delete on public.chore_done for each row execute function public.after_chore_done_reward();

-- a chore photo: in the doer's own folder; asked for when the chore needs one; gone once a parent confirms
create or replace function public.guard_chore_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.chores%rowtype;
begin
  if tg_op = 'UPDATE' then
    new.photo_path := old.photo_path;
    return new;
  end if;
  if (select auth.uid()) is null then return new; end if;
  select * into c from public.chores where id = new.chore_id;
  if new.photo_path is not null and new.photo_path not like new.family_id::text || '/rewards/' || public.my_member_id()::text || '/%' then
    raise exception 'That change is not allowed';
  end if;
  if new.photo_path is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'reward-files' and o.name = new.photo_path) then
    raise exception 'Add a photo first';
  end if;
  if c.needs_photo and new.photo_path is null and not public.is_family_parent(new.family_id) then raise exception 'Add a photo first'; end if;
  return new;
end $$;
revoke all on function public.guard_chore_photo() from public, anon, authenticated;
create trigger chore_done_photo before insert or update on public.chore_done for each row execute function public.guard_chore_photo();

create or replace function public.after_routine_run_reward()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rt public.routines%rowtype;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.routines where id = old.routine_id) then perform public.reward_remove('routine:' || old.id::text); end if;
    return null;
  end if;
  if new.finished_at is null or new.stars <= 0 then return null; end if;
  select * into rt from public.routines where id = new.routine_id;
  perform public.reward_add_stars(new.family_id, rt.member_id, new.stars, 'routine', 'routine:' || new.id, rt.name);
  return null;
end $$;
revoke all on function public.after_routine_run_reward() from public, anon, authenticated;
create trigger routine_runs_reward after update or delete on public.routine_runs for each row execute function public.after_routine_run_reward();

create or replace function public.after_goal_reward()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m uuid;
begin
  if new.done_at is not null and old.done_at is null and new.stars > 0 and public.reward_role(new.done_by) = 'parent' then
    for m in select id from public.family_members where family_id = new.family_id and archived_at is null
               and (cardinality(new.people) = 0 or id = any(new.people)) loop
      perform public.reward_add_stars(new.family_id, m, new.stars, 'goal', 'goal:' || new.id || ':' || m, new.title);
    end loop;
  elsif new.done_at is null and old.done_at is not null then
    perform public.reward_remove('goal:' || new.id::text || ':%');
  end if;
  return null;
end $$;
revoke all on function public.after_goal_reward() from public, anon, authenticated;
create trigger board_goals_reward after update of done_at on public.board_goals for each row execute function public.after_goal_reward();

-- ---------------------------------------------------------------- habits earn when the day's (or week's) target is reached

create or replace function public.reward_check_habit(hid uuid, d date)
returns void language plpgsql security definer set search_path = '' as $$
declare h public.habits%rowtype; met boolean; wk date; key text;
begin
  select * into h from public.habits where id = hid;
  if not found then return; end if;
  if h.per = 'day' then
    key := 'habit:' || h.id || ':' || d;
    met := exists (select 1 from public.habit_logs where habit_id = hid and day = d and not skipped and count >= h.target);
  else
    wk := d - (extract(isodow from d)::integer - 1);
    key := 'habit:' || h.id || ':w:' || wk;
    met := (select count(*) from public.habit_logs where habit_id = hid and day between wk and wk + 6 and not skipped and count >= 1) >= h.target;
  end if;
  if met and h.stars > 0 then
    perform public.reward_add_stars(h.family_id, h.member_id, h.stars, 'habit', key, h.title);
  elsif not met then
    perform public.reward_remove(key);
  end if;
end $$;
revoke all on function public.reward_check_habit(uuid, date) from public, anon, authenticated;

create or replace function public.after_habit_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then perform public.reward_check_habit(old.habit_id, old.day);
  else perform public.reward_check_habit(new.habit_id, new.day); end if;
  return null;
end $$;
revoke all on function public.after_habit_log() from public, anon, authenticated;
create trigger habit_logs_after after insert or update or delete on public.habit_logs for each row execute function public.after_habit_log();

-- ---------------------------------------------------------------- spending stars

create or replace function public.after_reward_give()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.rewards%rowtype; m uuid;
begin
  select * into r from public.rewards where id = new.reward_id for update;
  perform public.reward_add_stars(new.family_id, new.member_id, -new.stars, 'give', 'give:' || new.id, r.title);
  if (select coalesce(sum(stars), 0) from public.reward_gives where reward_id = r.id) >= r.stars and r.done_at is null then
    perform set_config('luex.rewardsys', 'on', true);
    update public.rewards set done_at = now() where id = r.id;
    perform set_config('luex.rewardsys', 'off', true);
    for m in select id from public.family_members where family_id = r.family_id and archived_at is null and user_id is not null
               and (cardinality(r.people) = 0 or id = any(r.people)) loop
      perform public.reward_notify(m, 'goal', 'Reached: ' || r.title, 'Everyone''s stars got you there', '/m/pocket');
    end loop;
  end if;
  return null;
end $$;
revoke all on function public.after_reward_give() from public, anon, authenticated;
create trigger reward_gives_after after insert on public.reward_gives for each row execute function public.after_reward_give();

create or replace function public.after_reward_claim()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.rewards%rowtype; v uuid; who text;
begin
  select * into r from public.rewards where id = new.reward_id;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    perform public.reward_add_stars(new.family_id, new.member_id, -new.stars, 'claim', 'claim:' || new.id, r.title);
    if tg_op = 'UPDATE' then
      perform public.reward_notify(new.member_id, 'approval', 'Yes! ' || r.title, 'Your reward is on its way', '/m/pocket');
    end if;
  elsif new.status = 'waiting' and tg_op = 'INSERT' then
    select display_name into who from public.family_members where id = new.member_id;
    for v in select public.reward_parents(new.family_id) loop
      perform public.reward_notify(v, 'approval', who || ' would like: ' || r.title, new.stars || ' stars', '/m/pocket?tab=approvals');
    end loop;
  elsif new.status = 'declined' and tg_op = 'UPDATE' then
    perform public.reward_notify(new.member_id, 'approval', 'Not this time: ' || r.title, 'Your stars are still yours', '/m/pocket');
  end if;
  return null;
end $$;
revoke all on function public.after_reward_claim() from public, anon, authenticated;
create trigger reward_claims_after after insert or update on public.reward_claims for each row execute function public.after_reward_claim();

-- ---------------------------------------------------------------- pocket money: waiting things, goals reached

create or replace function public.after_pocket_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v uuid; who text; g record; bal numeric;
begin
  if tg_op = 'INSERT' and new.status = 'waiting' then
    select display_name into who from public.family_members where id = new.member_id;
    for v in select public.reward_parents(new.family_id) loop
      perform public.reward_notify(v, 'approval',
        case when new.amount < 0 then who || ' spent ' else 'Gift for ' || who || ': ' end || to_char(abs(new.amount), 'FM£999,990.00'),
        coalesce(nullif(new.note, ''), 'Tap to check it'), '/m/pocket?tab=approvals');
    end loop;
  end if;
  if new.status = 'ok' and new.pot = 'save' and new.amount > 0 then
    bal := public.reward_pot_balance(new.member_id, 'save');
    for g in select * from public.pocket_goals where member_id = new.member_id and reached_at is null and archived_at is null and target <= bal loop
      update public.pocket_goals set reached_at = now() where id = g.id;
      perform public.reward_notify(new.member_id, 'goal', 'You did it! ' || g.title, 'Your savings reached ' || to_char(g.target, 'FM£999,990.00'), '/m/pocket');
      if public.reward_role(new.member_id) = 'child' then
        select display_name into who from public.family_members where id = new.member_id;
        for v in select public.reward_parents(new.family_id) loop
          perform public.reward_notify(v, 'goal', who || ' reached a goal: ' || g.title, to_char(g.target, 'FM£999,990.00') || ' saved', '/m/pocket');
        end loop;
      end if;
    end loop;
  end if;
  return null;
end $$;
revoke all on function public.after_pocket_entry() from public, anon, authenticated;
create trigger pocket_entries_after after insert or update of status on public.pocket_entries for each row execute function public.after_pocket_entry();

-- ---------------------------------------------------------------- up-for-grabs jobs: done, then paid when confirmed

create or replace function public.after_reward_job()
returns trigger language plpgsql security definer set search_path = '' as $$
declare who text; v uuid;
begin
  if new.done_at is not null and old.done_at is null and new.created_by is not null then
    select display_name into who from public.family_members where id = new.claimed_by;
    perform public.reward_notify(new.created_by, 'approval', who || ' did: ' || new.title, 'Tap to check and pay', '/m/pocket?tab=jobs');
  end if;
  if new.confirmed_at is not null and old.confirmed_at is null then
    perform public.reward_add_stars(new.family_id, new.claimed_by, new.stars, 'job', 'job:' || new.id, new.title);
    if new.money > 0 then
      perform public.reward_add_money(new.family_id, new.claimed_by, 'spend', new.money, 'job', 'job:' || new.id, new.title, null);
    end if;
    perform public.reward_notify(new.claimed_by, 'pay', 'Paid: ' || new.title,
      concat_ws(' and ', case when new.money > 0 then to_char(new.money, 'FM£999,990.00') end, case when new.stars > 0 then new.stars || ' stars' end),
      '/m/pocket');
  end if;
  return null;
end $$;
revoke all on function public.after_reward_job() from public, anon, authenticated;
create trigger reward_jobs_after after update on public.reward_jobs for each row execute function public.after_reward_job();

-- ---------------------------------------------------------------- actions the app calls

-- settings for the household (first visit), and balances for everyone I can see
create or replace function public.reward_setup()
returns void language plpgsql security definer set search_path = '' as $$
declare f uuid := public.my_family_id();
begin
  if f is null or not public.is_family_member(f) then raise exception 'That change is not allowed'; end if;
  perform set_config('luex.rewardsys', 'on', true);
  insert into public.reward_settings (family_id, children)
    values (f, exists (select 1 from public.family_members where family_id = f and role = 'child' and archived_at is null))
    on conflict do nothing;
  perform set_config('luex.rewardsys', 'off', true);
end $$;

create or replace function public.reward_balances()
returns table (member_id uuid, stars integer, spend numeric, save numeric, give numeric, waiting integer)
language sql stable security definer set search_path = '' as $$
  select m.id, public.reward_star_balance(m.id), public.reward_pot_balance(m.id, 'spend'), public.reward_pot_balance(m.id, 'save'),
    public.reward_pot_balance(m.id, 'give'),
    (select count(*) from public.pocket_entries e where e.member_id = m.id and e.status = 'waiting')::integer
      + (select count(*) from public.reward_claims c where c.member_id = m.id and c.status = 'waiting')::integer
  from public.family_members m
  where m.family_id = public.my_family_id() and m.archived_at is null and public.reward_sees(m.family_id, m.id)
$$;

-- swap stars for money at the household's rate
create or replace function public.reward_swap(p_member uuid, p_stars integer)
returns numeric language plpgsql security definer set search_path = '' as $$
declare f uuid := public.my_family_id(); rate integer; amt numeric; used integer; k text := gen_random_uuid()::text;
begin
  if not public.reward_sees(f, p_member) or p_stars is null or p_stars < 1 then raise exception 'That change is not allowed'; end if;
  select stars_per_pound into rate from public.reward_settings where family_id = f;
  if rate is null then raise exception 'Swapping stars is switched off'; end if;
  perform 1 from public.family_members where id = p_member for update;
  if public.reward_star_balance(p_member) < p_stars then raise exception 'Not enough stars'; end if;
  -- whole pennies only, and only the stars those pennies cost
  amt := floor(p_stars * 100.0 / rate) / 100.0;
  if amt < 0.01 then raise exception 'That''s not enough stars to swap'; end if;
  used := ceil(amt * rate)::integer;
  perform public.reward_add_stars(f, p_member, -used, 'swap', 'swap:' || k, 'Swapped for money');
  perform public.reward_add_money(f, p_member, 'spend', amt, 'swap', 'swap:' || k, used || ' stars swapped', null);
  return amt;
end $$;

-- move money between a child's pots (into save or give any time; out of them only for parents or in teen mode)
create or replace function public.reward_move(p_member uuid, p_from text, p_to text, p_amount numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare f uuid := public.my_family_id(); k text := gen_random_uuid()::text; parent boolean;
begin
  if not public.reward_sees(f, p_member) or p_from = p_to or p_from not in ('spend', 'save', 'give') or p_to not in ('spend', 'save', 'give')
     or p_amount is null or p_amount <= 0 or p_amount >= 1000000 then
    raise exception 'That change is not allowed';
  end if;
  parent := public.is_family_parent(f);
  if not parent and p_from <> 'spend' and not coalesce((select teen_mode from public.reward_people where member_id = p_member), false) then
    raise exception 'Ask a parent to take money out of that pot';
  end if;
  perform 1 from public.family_members where id = p_member for update;
  if public.reward_pot_balance(p_member, p_from) < p_amount then raise exception 'There isn''t that much in that pot'; end if;
  perform public.reward_add_money(f, p_member, p_from, -round(p_amount, 2), 'move', 'move:' || k || ':out', 'Moved to ' || p_to, null);
  perform public.reward_add_money(f, p_member, p_to, round(p_amount, 2), 'move', 'move:' || k || ':in', 'Moved from ' || p_from, null);
end $$;

-- lend a child money now, paid back from their pocket money
create or replace function public.reward_advance(p_child uuid, p_amount numeric, p_repay numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare f uuid := public.my_family_id(); k text := gen_random_uuid()::text;
begin
  if not public.is_family_parent(f) or public.reward_role(p_child) <> 'child' or not public.reward_sees(f, p_child)
     or p_amount is null or p_amount <= 0 or p_amount >= 10000 or p_repay is null or p_repay <= 0 or p_repay >= 10000 then
    raise exception 'That change is not allowed';
  end if;
  perform set_config('luex.rewardsys', 'on', true);
  insert into public.reward_people (member_id, family_id) values (p_child, f) on conflict do nothing;
  update public.reward_people set advance_owed = advance_owed + round(p_amount, 2), advance_repay = round(p_repay, 2) where member_id = p_child;
  perform set_config('luex.rewardsys', 'off', true);
  perform public.reward_add_money(f, p_child, 'spend', round(p_amount, 2), 'advance', 'advance:' || k, 'Advance', null);
end $$;

-- cheer someone on (their habit buddy, once a day)
create or replace function public.reward_cheer(p_habit uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare h public.habits%rowtype; me uuid := public.my_member_id(); who text;
begin
  select * into h from public.habits where id = p_habit;
  if not found or h.family_id <> public.my_family_id() or h.buddy is distinct from me then raise exception 'That change is not allowed'; end if;
  insert into public.reward_sends (member_id, kind, for_date) values (me, 'cheer:' || p_habit, public.family_today(h.family_id)) on conflict do nothing;
  if not found then return; end if;
  select display_name into who from public.family_members where id = me;
  perform public.reward_notify(h.member_id, 'cheer', who || ' is cheering you on', coalesce(h.emoji || ' ', '') || h.title, '/m/pocket');
end $$;

revoke all on function public.reward_setup(), public.reward_balances(), public.reward_swap(uuid, integer), public.reward_move(uuid, text, text, numeric),
  public.reward_advance(uuid, numeric, numeric), public.reward_cheer(uuid) from public, anon;
grant execute on function public.reward_setup(), public.reward_balances(), public.reward_swap(uuid, integer), public.reward_move(uuid, text, text, numeric),
  public.reward_advance(uuid, numeric, numeric), public.reward_cheer(uuid) to authenticated;

-- ---------------------------------------------------------------- the schedule: pay day, interest and matching, weekly bonus, streaks

-- how many times a chore is due for a person in a week (only plain daily chores and weekly chores on set days count)
create or replace function public.reward_chore_due(c public.chores, wk date)
returns integer language plpgsql stable set search_path = '' as $$
declare n integer := 0; d date; days text[];
begin
  if c.rrule = 'FREQ=DAILY' then
    for d in select generate_series(wk, wk + 6, interval '1 day')::date loop
      if d >= c.starts_on then n := n + 1; end if;
    end loop;
  elsif c.rrule ~ '^FREQ=WEEKLY;BYDAY=[A-Z,]+$' then
    days := string_to_array(substring(c.rrule from 'BYDAY=([A-Z,]+)'), ',');
    for d in select generate_series(wk, wk + 6, interval '1 day')::date loop
      if d >= c.starts_on and (array['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow from d)::int] = any(days) then n := n + 1; end if;
    end loop;
  else
    return null;
  end if;
  return n;
end $$;
revoke all on function public.reward_chore_due(public.chores, date) from public, anon, authenticated;

create or replace function public.queue_reward_jobs()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  f record; p record; h record; c record; s public.reward_settings%rowtype;
  today date; now_t time; n integer := 0; i integer; give_a numeric; save_a numeric; spend_a numeric; rep numeric; pd date;
  mon text; bal numeric; saved numeric; wk date; due integer; done integer; ok boolean; any_due boolean;
begin
  perform set_config('luex.rewardsys', 'on', true);
  for f in select id, coalesce(timezone, 'Europe/London') as tz from public.families where archived_at is null loop
    now_t := (now() at time zone f.tz)::time;
    today := (now() at time zone f.tz)::date;
    if now_t < '07:00' then continue; end if;
    select * into s from public.reward_settings where family_id = f.id;

    -- pay day (pocket money for children, treat-jar money for grown-ups)
    for p in select rp.* from public.reward_people rp join public.family_members m on m.id = rp.member_id
             where rp.family_id = f.id and m.archived_at is null and rp.pocket_amount > 0 and rp.next_pay is not null and rp.next_pay <= today loop
      i := 0; pd := p.next_pay;
      while pd <= today and i < 3 loop
        if p.paused_until is null or p.paused_until < pd then
          give_a := round(p.pocket_amount * p.give_pct / 100.0, 2);
          save_a := round(p.pocket_amount * p.save_pct / 100.0, 2);
          spend_a := p.pocket_amount - give_a - save_a;
          perform public.reward_add_money(f.id, p.member_id, 'spend', spend_a, 'pay', 'pay:' || p.member_id || ':' || pd, 'Pocket money', pd);
          perform public.reward_add_money(f.id, p.member_id, 'save', save_a, 'pay', 'pay:' || p.member_id || ':' || pd || ':save', 'Pocket money', pd);
          perform public.reward_add_money(f.id, p.member_id, 'give', give_a, 'pay', 'pay:' || p.member_id || ':' || pd || ':give', 'Pocket money', pd);
          rep := least(p.advance_owed, p.advance_repay, spend_a);
          if rep > 0 then
            perform public.reward_add_money(f.id, p.member_id, 'spend', -rep, 'repay', 'repay:' || p.member_id || ':' || pd, 'Paying back the advance', pd);
            update public.reward_people set advance_owed = advance_owed - rep where member_id = p.member_id;
            p.advance_owed := p.advance_owed - rep;
          end if;
          perform public.reward_notify(p.member_id, 'pay',
            case when public.reward_role(p.member_id) = 'child' then 'Pocket money: ' else 'Treat jar: ' end || to_char(p.pocket_amount, 'FM£999,990.00'),
            'Added today', '/m/pocket');
          n := n + 1;
        end if;
        pd := case p.pocket_every when 'week' then pd + 7 when 'fortnight' then pd + 14 else (pd + interval '1 month')::date end;
        i := i + 1;
      end loop;
      update public.reward_people set next_pay = case when pd <= today then today + 1 else pd end where member_id = p.member_id;
    end loop;

    -- the 1st of the month: interest and matching on children's savings
    if extract(day from today) = 1 then
      mon := to_char(today - 1, 'YYYY-MM');
      for p in select rp.* from public.reward_people rp join public.family_members m on m.id = rp.member_id
               where rp.family_id = f.id and m.archived_at is null and m.role = 'child' and (rp.interest_pct > 0 or rp.match_pct > 0) loop
        if p.interest_pct > 0 then
          bal := public.reward_pot_balance(p.member_id, 'save');
          if bal > 0 then
            perform public.reward_add_money(f.id, p.member_id, 'save', round(bal * p.interest_pct / 100.0, 2), 'interest',
              'interest:' || p.member_id || ':' || mon, 'Interest from the bank of home', today);
          end if;
        end if;
        if p.match_pct > 0 then
          select coalesce(sum(amount), 0) into saved from public.pocket_entries
            where member_id = p.member_id and pot = 'save' and status = 'ok' and kind not in ('interest', 'match')
              and on_date >= date_trunc('month', today - 1)::date and on_date < today;
          if saved > 0 then
            perform public.reward_add_money(f.id, p.member_id, 'save', round(saved * p.match_pct / 100.0, 2), 'match',
              'match:' || p.member_id || ':' || mon, 'Matched by the grown-ups', today);
          end if;
        end if;
      end loop;
    end if;

    -- Sunday evening: a bonus for children whose chores for the week are all done
    if extract(isodow from today) = 7 and now_t >= '18:00' and (coalesce(s.week_bonus, 0) > 0 or coalesce(s.week_bonus_stars, 0) > 0) then
      wk := today - 6;
      for p in select m.id from public.family_members m where m.family_id = f.id and m.role = 'child' and m.archived_at is null loop
        ok := true; any_due := false;
        for c in select * from public.chores where family_id = f.id and active and mode = 'each' and p.id = any(people) loop
          due := public.reward_chore_due(c, wk);
          if due is null or due = 0 then continue; end if;
          any_due := true;
          select count(*) into done from public.chore_done
            where chore_id = c.id and for_member = p.id and due_on between wk and today and confirmed_at is not null;
          if done < due then ok := false; exit; end if;
        end loop;
        if ok and any_due then
          perform public.reward_add_money(f.id, p.id, 'spend', s.week_bonus, 'week', 'week:' || p.id || ':' || wk, 'All chores done this week', today);
          perform public.reward_add_stars(f.id, p.id, s.week_bonus_stars, 'week', 'week:' || p.id || ':' || wk, 'All chores done this week');
          perform public.reward_notify(p.id, 'pay', 'Every chore done this week!', 'Your weekly bonus is in', '/m/pocket');
        end if;
      end loop;
    end if;

    -- 7pm: a gentle nudge when today would break a run of daily habits
    if now_t >= '19:00' then
      for h in select hb.* from public.habits hb join public.family_members m on m.id = hb.member_id
               where hb.family_id = f.id and hb.archived_at is null and hb.per = 'day' and m.archived_at is null loop
        if exists (select 1 from public.habit_logs where habit_id = h.id and day = today - 1 and (skipped or count >= h.target))
           and exists (select 1 from public.habit_logs where habit_id = h.id and day = today - 2 and (skipped or count >= h.target))
           and not exists (select 1 from public.habit_logs where habit_id = h.id and day = today and (skipped or count >= h.target)) then
          insert into public.reward_sends (member_id, kind, for_date) values (h.member_id, 'streak:' || h.id, today) on conflict do nothing;
          if found then
            perform public.reward_notify(h.member_id, 'streak', 'Keep your run going', coalesce(h.emoji || ' ', '') || h.title || ' isn''t ticked yet today', '/m/pocket');
          end if;
        end if;
      end loop;
    end if;
  end loop;
  perform set_config('luex.rewardsys', 'off', true);
  return n;
end $$;
revoke all on function public.queue_reward_jobs() from public, anon, authenticated;

create or replace function public.reward_tidy_sends()
returns void language sql security definer set search_path = '' as $$
  delete from public.reward_sends where for_date < current_date - 60
$$;
revoke all on function public.reward_tidy_sends() from public, anon, authenticated;

-- ---------------------------------------------------------------- stars already earned count from day one

do $$
declare r record;
begin
  for r in select d.*, c.title from public.chore_done d join public.chores c on c.id = d.chore_id where d.confirmed_at is not null and d.stars > 0 loop
    perform public.reward_add_stars(r.family_id, r.for_member, r.stars, 'chore', 'chore:' || r.id, r.title);
  end loop;
  for r in select rr.*, rt.member_id, rt.name from public.routine_runs rr join public.routines rt on rt.id = rr.routine_id
           where rr.finished_at is not null and rr.stars > 0 loop
    perform public.reward_add_stars(r.family_id, r.member_id, r.stars, 'routine', 'routine:' || r.id, r.name);
  end loop;
  for r in select g.id, g.family_id, g.title, g.stars, m.id as member_id from public.board_goals g
           join public.family_members m on m.family_id = g.family_id and m.archived_at is null and (cardinality(g.people) = 0 or m.id = any(g.people))
           where g.done_at is not null and g.stars > 0 loop
    perform public.reward_add_stars(r.family_id, r.member_id, r.stars, 'goal', 'goal:' || r.id || ':' || r.member_id, r.title);
  end loop;
end $$;

-- ---------------------------------------------------------------- photo proof (private bucket)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reward-files', 'reward-files', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- <family>/rewards/<person>/<file>: the person adds their own; they, the family's parents and whoever set the job can see it
create or replace function public.reward_file_ok(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_name, '/');
  uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  f uuid;
begin
  if array_length(parts, 1) <> 4 or parts[1] !~ uuid_re or parts[2] <> 'rewards' or parts[3] !~ uuid_re or parts[4] = '' then return false; end if;
  f := parts[1]::uuid;
  if f is distinct from public.my_family_id() or not public.is_family_member(f) then return false; end if;
  if p_write then
    return parts[3] = public.my_member_id()::text and public.food_bytes_used(f) < public.board_allowance();
  end if;
  return parts[3] = public.my_member_id()::text
    or (public.is_family_parent(f) and public.reward_role(parts[3]::uuid) = 'child')
    or exists (select 1 from public.reward_jobs j where j.family_id = f and j.photo_path = p_name and j.created_by = public.my_member_id())
    or (public.is_family_parent(f) and exists (select 1 from public.chore_done d where d.family_id = f and d.photo_path = p_name));
end $$;
revoke all on function public.reward_file_ok(text, boolean) from public, anon;
grant execute on function public.reward_file_ok(text, boolean) to authenticated;

-- the family's space: Board, Food, Money and Rewards files together
create or replace function public.food_bytes_used(f uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint from storage.objects o
  where o.bucket_id in ('board-media', 'food-files', 'money-files', 'reward-files') and o.name like f::text || '/%'
$$;
revoke all on function public.food_bytes_used(uuid) from public, anon, authenticated;

create policy reward_files_read on storage.objects for select to authenticated
  using (bucket_id = 'reward-files' and public.reward_file_ok(name, false));
create policy reward_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'reward-files' and public.reward_file_ok(name, true));
create policy reward_files_remove on storage.objects for delete to authenticated
  using (bucket_id = 'reward-files' and public.reward_file_ok(name, false));
-- (read and remove follow the same rule: the person, a child's parent, or whoever checks that photo)

-- ---------------------------------------------------------------- live updates (plain uuid keys only)

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.star_entries, public.habit_logs, public.pocket_entries, public.reward_claims,
      public.reward_jobs, public.reward_gives, public.rewards;
  end if;
end $$;
