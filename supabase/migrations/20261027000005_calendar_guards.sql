-- Family Calendar, part 4 of 7 (guards). See part 1 for the rules.

-- ---------------------------------------------------------------- guards for the other tables

create or replace function public.stamp_family_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id();
begin
  if (select auth.uid()) is not null and not public.is_family_member(new.family_id) then raise exception 'That change is not allowed'; end if;
  if tg_op = 'UPDATE' and new.family_id <> old.family_id then raise exception 'That change is not allowed'; end if;
  case tg_table_name
    when 'cal_comments' then
      if tg_op = 'INSERT' then new.member_id := me; new.created_at := now(); new.deleted_at := null;
        if not public.can_see_event(new.event_id) or not exists (select 1 from public.cal_events where id = new.event_id and family_id = new.family_id) then raise exception 'That change is not allowed'; end if;
        if new.photo_path is not null and new.photo_path not like new.family_id::text || '/events/' || new.event_id::text || '/%' then raise exception 'That change is not allowed'; end if;
      elsif new.body is distinct from old.body or new.photo_path is distinct from old.photo_path or new.member_id is distinct from old.member_id or new.event_id <> old.event_id then
        raise exception 'Comments cannot be edited, only removed';
      end if;
    when 'cal_files' then
      new.created_by_member := me; new.created_at := now();
      if not public.can_see_event(new.event_id) or not exists (select 1 from public.cal_events where id = new.event_id and family_id = new.family_id) then raise exception 'That change is not allowed'; end if;
      if new.path not like new.family_id::text || '/events/' || new.event_id::text || '/%' then raise exception 'That change is not allowed'; end if;
    when 'cal_day_notes' then new.member_id := me; new.updated_at := now();
    when 'cal_feeds' then
      if tg_op = 'INSERT' then new.created_by_member := me; end if;
      if new.visibility = 'all' then new.viewers := '{}'; end if;
      if not public.members_in_family(new.family_id, new.people || new.viewers) then raise exception 'Those people are not in this family'; end if;
      if new.visibility = 'selected' and exists (select 1 from unnest(new.viewers) v join public.family_members m on m.id = v where m.user_id is null) then
        raise exception 'Only people with a login can be chosen';
      end if;
      if new.type not in ('birthday', 'school', 'activity', 'appointment', 'social', 'trip', 'work', 'reminder', 'other') then raise exception 'Unknown event type'; end if;
    when 'chores' then
      if tg_op = 'INSERT' then new.created_by_member := me; end if;
      new.updated_at := now();
      if not public.members_in_family(new.family_id, new.people) then raise exception 'Those people are not in this family'; end if;
    when 'routines' then
      if not public.members_in_family(new.family_id, array[new.member_id]) then raise exception 'That person is not in this family'; end if;
    when 'routine_steps' then
      if not exists (select 1 from public.routines where id = new.routine_id and family_id = new.family_id) then raise exception 'That change is not allowed'; end if;
      if new.photo_path is not null and new.photo_path not like new.family_id::text || '/routines/%' then raise exception 'That change is not allowed'; end if;
    when 'wish_lists' then
      if tg_op = 'UPDATE' then raise exception 'That change is not allowed'; end if;
      if not public.members_in_family(new.family_id, array[new.owner_member]) then raise exception 'That person is not in this family'; end if;
    when 'wish_items' then
      if tg_op = 'INSERT' then new.created_at := now(); new.removed_at := null;
      elsif new.list_id <> old.list_id then raise exception 'That change is not allowed'; end if;
      if not exists (select 1 from public.wish_lists where id = new.list_id and family_id = new.family_id) then raise exception 'That change is not allowed'; end if;
      new.updated_at := now();
    when 'cal_places', 'cal_terms' then null;
    else null;
  end case;
  return new;
end $$;

create trigger cal_comments_stamp before insert or update on public.cal_comments for each row execute function public.stamp_family_row();
create trigger cal_files_stamp before insert on public.cal_files for each row execute function public.stamp_family_row();
create trigger cal_day_notes_stamp before insert or update on public.cal_day_notes for each row execute function public.stamp_family_row();
create trigger cal_feeds_stamp before insert or update on public.cal_feeds for each row execute function public.stamp_family_row();
create trigger chores_stamp before insert or update on public.chores for each row execute function public.stamp_family_row();
create trigger routines_stamp before insert or update on public.routines for each row execute function public.stamp_family_row();
create trigger routine_steps_stamp before insert or update on public.routine_steps for each row execute function public.stamp_family_row();
create trigger wish_lists_stamp before insert or update on public.wish_lists for each row execute function public.stamp_family_row();
create trigger wish_items_stamp before insert or update on public.wish_items for each row execute function public.stamp_family_row();
create trigger cal_places_stamp before update on public.cal_places for each row execute function public.stamp_family_row();
create trigger cal_terms_stamp before update on public.cal_terms for each row execute function public.stamp_family_row();

-- chores: a child ticks their own; parents tick anyone's and confirm. Stars are fixed when ticked.
create or replace function public.guard_chore_done()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); c public.chores%rowtype; parent boolean;
begin
  if not public.is_family_member(new.family_id) then raise exception 'That change is not allowed'; end if;
  if tg_op = 'INSERT' then
    select * into c from public.chores where id = new.chore_id;
    if not found or c.family_id <> new.family_id or not c.active then raise exception 'That chore is not available'; end if;
    parent := public.is_family_parent(new.family_id);
    perform pg_advisory_xact_lock(hashtextextended(new.chore_id::text || new.due_on::text, 0));
    if c.mode = 'anyone' then
      if not parent then new.for_member := me; end if;
      if cardinality(c.people) > 0 and not (new.for_member = any(c.people)) then raise exception 'That chore is not for you'; end if;
      if exists (select 1 from public.chore_done where chore_id = new.chore_id and due_on = new.due_on) then
        raise exception 'Someone has already done this one';
      end if;
    elsif not (new.for_member = any(c.people)) then
      raise exception 'That chore is not for that person';
    end if;
    if not parent and new.for_member <> me then raise exception 'You can only tick your own chores'; end if;
    if not public.members_in_family(new.family_id, array[new.for_member]) then raise exception 'That person is not in this family'; end if;
    -- parents can catch up on the last two weeks; everyone else ticks today or yesterday; never before the chore existed
    if new.due_on > public.family_today(new.family_id) or new.due_on < public.family_today(new.family_id) - 14
       or (not parent and new.due_on < public.family_today(new.family_id) - 1)
       or new.due_on < c.starts_on or new.due_on < (c.created_at at time zone 'UTC')::date - 1 then
      raise exception 'That day is too far away to tick';
    end if;
    -- weekly chores only on their days
    if c.rrule like '%BYDAY=%' and c.rrule like 'FREQ=WEEKLY%' and not (
         (array['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow from new.due_on)::int]
         = any(string_to_array(substring(c.rrule from 'BYDAY=([A-Z,]+)'), ','))) then
      raise exception 'That chore is not due that day';
    end if;
    new.done_by := me; new.done_at := now(); new.stars := c.stars;
    if parent or not c.needs_confirm then new.confirmed_by := me; new.confirmed_at := now();
    else new.confirmed_by := null; new.confirmed_at := null; end if;
  else
    if not public.is_family_parent(old.family_id) then raise exception 'Only a parent can confirm chores'; end if;
    if new.chore_id <> old.chore_id or new.due_on <> old.due_on or new.for_member <> old.for_member or new.family_id <> old.family_id
       or new.done_by is distinct from old.done_by or new.stars <> old.stars then raise exception 'That change is not allowed'; end if;
    new.confirmed_by := me; new.confirmed_at := now();
  end if;
  return new;
end $$;
create trigger chore_done_guard before insert or update on public.chore_done for each row execute function public.guard_chore_done();

-- routines: the person doing it, or a parent, ticks steps and runs the timer
create or replace function public.can_do_routine(r uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select true from public.routines where id = r and public.is_family_member(family_id)
    and (member_id = public.my_member_id() or public.is_family_parent(family_id)) limit 1), false)
$$;

create or replace function public.guard_routine_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rt public.routines%rowtype;
begin
  if not public.is_family_member(new.family_id) then raise exception 'That change is not allowed'; end if;
  select * into rt from public.routines where id = new.routine_id;
  if not found or rt.family_id <> new.family_id then raise exception 'That change is not allowed'; end if;
  if tg_table_name = 'routine_ticks' then
    if not exists (select 1 from public.routine_steps where id = new.step_id and routine_id = new.routine_id) then raise exception 'That change is not allowed'; end if;
    if new.done_on > public.family_today(new.family_id) or new.done_on < public.family_today(new.family_id) - 1 then raise exception 'That day is too far away'; end if;
    new.done_by := public.my_member_id(); new.done_at := now();
  else
    if tg_op = 'INSERT' then
      if not rt.active or not (extract(isodow from new.run_on)::smallint = any(rt.days))
         or new.run_on > public.family_today(new.family_id) or new.run_on < public.family_today(new.family_id) - 1 then
        raise exception 'That routine is not on that day';
      end if;
      new.started_at := now(); new.finished_at := null; new.stars := 0;
    else
      if new.routine_id <> old.routine_id or new.run_on <> old.run_on or new.started_at <> old.started_at then raise exception 'That change is not allowed'; end if;
      -- finishing earns the routine's stars once, and only when every step is ticked
      if new.finished_at is not null and old.finished_at is null then
        if not exists (select 1 from public.routine_steps where routine_id = new.routine_id) then raise exception 'Tick every step first'; end if;
        if exists (select 1 from public.routine_steps st where st.routine_id = new.routine_id
                   and not exists (select 1 from public.routine_ticks t where t.step_id = st.id and t.done_on = new.run_on)) then
          raise exception 'Tick every step first';
        end if;
        new.finished_at := now(); new.stars := rt.stars;
      else new.finished_at := old.finished_at; new.stars := old.stars; end if;
    end if;
  end if;
  return new;
end $$;
create trigger routine_ticks_guard before insert on public.routine_ticks for each row execute function public.guard_routine_activity();
create trigger routine_runs_guard before insert or update on public.routine_runs for each row execute function public.guard_routine_activity();

-- wish claims: never on your own list; one claim per item; the claimer is whoever is signed in
create or replace function public.guard_wish_claim()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select list_id, family_id into new.list_id, new.family_id from public.wish_items where id = new.item_id and removed_at is null;
    if new.list_id is null or not public.is_family_member(new.family_id) then raise exception 'That item is not available'; end if;
    if public.owns_wish_list(new.list_id) then raise exception 'You cannot buy from your own list'; end if;
    new.claimed_by := public.my_member_id(); new.claimed_at := now();
  else
    if new.item_id <> old.item_id or new.list_id <> old.list_id or new.family_id <> old.family_id
       or new.claimed_by is distinct from old.claimed_by or new.claimed_at <> old.claimed_at then raise exception 'That change is not allowed'; end if;
  end if;
  return new;
end $$;
create trigger wish_claims_guard before insert or update on public.wish_claims for each row execute function public.guard_wish_claim();

-- wish list changes: one summary notification for the parents (not the person who made the change)
create or replace function public.after_wish_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.my_member_id();
  w public.wish_lists%rowtype;
  owner_name text;
  r record;
  n integer;
begin
  if me is null then return coalesce(new, old); end if;
  select * into w from public.wish_lists where id = coalesce(new.list_id, old.list_id);
  select display_name into owner_name from public.family_members where id = w.owner_member;
  for r in
    select m.id from public.family_members m left join public.notification_prefs p on p.member_id = m.id
    where m.family_id = w.family_id and m.role = 'parent' and m.archived_at is null and m.user_id is not null
      and m.id <> me and m.id <> w.owner_member and coalesce(p.wishlists, true)
  loop
    select count into n from public.notifications where member_id = r.id and group_key = 'wish:' || w.id and pushed_at is null;
    perform public.notify(r.id, 'wishlist',
      owner_name || '''s ' || case w.occasion when 'christmas' then 'Christmas' else 'birthday' end || ' list changed',
      coalesce(n + 1, 1)::text || case when coalesce(n + 1, 1) = 1 then ' change' else ' changes' end || '. Tap to see the list.',
      '/m/calendar?tab=wishes&list=' || w.id, 'wish:' || w.id, interval '10 minutes');
  end loop;
  return coalesce(new, old);
end $$;
create trigger wish_items_after after insert or update on public.wish_items for each row execute function public.after_wish_change();

