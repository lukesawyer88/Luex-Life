-- Bookings and Hosting, part 2 of 3 (guards and the "tomorrow" message).

create or replace function public.stamp_host_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); adult boolean;
begin
  if (select auth.uid()) is null then return new; end if;
  if new.family_id is distinct from public.my_family_id() then raise exception 'That change is not allowed'; end if;
  if tg_op = 'UPDATE' and new.family_id <> old.family_id then raise exception 'That change is not allowed'; end if;
  adult := public.is_family_adult(new.family_id);

  if tg_table_name = 'host_events' then
    if tg_op = 'INSERT' then
      -- hosting sits on a Calendar "party or visit" event in this household that I can see, added here by a grown-up
      if not exists (select 1 from public.cal_events e join public.family_members m on m.id = e.created_by_member
                     where e.id = new.event_id and e.family_id = new.family_id and e.type = 'social' and e.deleted_at is null
                       and e.source = 'manual' and e.rrule is null and m.role in ('parent', 'member'))
         or not public.can_see_event(new.event_id) then
        raise exception 'That change is not allowed';
      end if;
      new.created_by := me; new.created_at := now(); new.reminded_on := null;
    end if;

  elsif tg_table_name = 'host_guests' then
    if not exists (select 1 from public.host_events where id = new.host_id and family_id = new.family_id) then raise exception 'That change is not allowed'; end if;
    if tg_op = 'UPDATE' and old.deleted_at is not null then raise exception 'That change is not allowed'; end if;
    if tg_op = 'UPDATE' and new.host_id <> old.host_id then raise exception 'That change is not allowed'; end if;
    if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); new.deleted_at := null;
    else
      if new.created_by is distinct from old.created_by then raise exception 'That change is not allowed'; end if;
      if new.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then new.deleted_at := now(); end if;
    end if;

  elsif tg_table_name = 'host_items' then
    if not exists (select 1 from public.host_events where id = new.host_id and family_id = new.family_id) then raise exception 'That change is not allowed'; end if;
    if tg_op = 'UPDATE' and old.deleted_at is not null then raise exception 'That change is not allowed'; end if;
    if tg_op = 'UPDATE' and (new.host_id <> old.host_id or new.kind <> old.kind or new.created_by is distinct from old.created_by) then
      raise exception 'That change is not allowed';
    end if;
    if new.who is not null and (tg_op = 'INSERT' or new.who is distinct from old.who) then
      if not public.members_in_family(new.family_id, array[new.who]) then raise exception 'Pick someone in this household'; end if;
      -- only someone who can sign in and see the plan, or they'd never know
      if not exists (select 1 from public.cal_events e join public.host_events h on h.event_id = e.id join public.family_members m on m.id = new.who
                     where h.id = new.host_id and m.user_id is not null and public.member_sees_event(e, new.who)) then
        raise exception 'Pick someone who can see this plan';
      end if;
    end if;
    -- children only tick (or untick) a job given to them
    if not adult then
      if tg_op = 'INSERT' or old.who is distinct from me or new.title <> old.title or new.who is distinct from old.who
         or new.deleted_at is distinct from old.deleted_at then
        raise exception 'That change is not allowed';
      end if;
    end if;
    if tg_op = 'INSERT' then
      new.created_by := me; new.created_at := now(); new.deleted_at := null; new.done_at := null; new.done_by := null;
    else
      if new.done_at is not null and old.done_at is null then new.done_at := now(); new.done_by := me;
      elsif new.done_at is null then new.done_by := null;
      elsif new.done_at is distinct from old.done_at then new.done_at := old.done_at; end if;
      if new.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then new.deleted_at := now(); end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.stamp_host_row() from public, anon, authenticated;
create trigger host_events_stamp before insert or update on public.host_events for each row execute function public.stamp_host_row();
create trigger host_guests_stamp before insert or update on public.host_guests for each row execute function public.stamp_host_row();
create trigger host_items_stamp before insert or update on public.host_items for each row execute function public.stamp_host_row();

-- a job given to someone tells them (not when they gave it to themselves)
create or replace function public.after_host_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); e public.cal_events%rowtype;
begin
  if (select auth.uid()) is null or new.deleted_at is not null or new.who is null or new.who = me or new.done_at is not null then return null; end if;
  if tg_op = 'UPDATE' and new.who is not distinct from old.who then return null; end if;
  select ev.* into e from public.cal_events ev join public.host_events h on h.event_id = ev.id where h.id = new.host_id;
  if e.id is null or not public.member_sees_event(e, new.who) then return null; end if;
  perform public.notify(new.who, 'hosting', 'A job for ' || e.title, new.title, '/m/bookings?host=' || new.host_id, 'host:' || new.id, interval '1 minute');
  return null;
end $$;
revoke all on function public.after_host_item() from public, anon, authenticated;
create trigger host_items_after after insert or update on public.host_items for each row execute function public.after_host_item();

-- ---------------------------------------------------------------- "tomorrow" (from 6pm family time, once per date)
-- To the people on the event who can see it (or every grown-up who can, when nobody is listed): how many are coming
-- and what's still to get or do.

create or replace function public.queue_host_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare f record; h record; v uuid; today date; n integer := 0; coming integer; left_n integer; msg text;
begin
  for f in select id, coalesce(timezone, 'Europe/London') as tz from public.families where archived_at is null loop
    if extract(hour from now() at time zone f.tz) < 18 then continue; end if;
    today := (now() at time zone f.tz)::date;
    for h in
      select x.id, e.id as event_id, e.title, e.people, (e.starts_at at time zone f.tz)::date as on_day
      from public.host_events x join public.cal_events e on e.id = x.event_id
      where x.family_id = f.id and e.deleted_at is null and e.type = 'social' and (e.starts_at at time zone f.tz)::date = today + 1
        and x.reminded_on is distinct from (e.starts_at at time zone f.tz)::date
    loop
      update public.host_events set reminded_on = h.on_day where id = h.id;
      select coalesce(sum(people), 0) into coming from public.host_guests where host_id = h.id and deleted_at is null and status = 'yes';
      select count(*) into left_n from public.host_items where host_id = h.id and deleted_at is null and done_at is null;
      msg := coming || case when coming = 1 then ' person' else ' people' end || ' coming'
        || case when left_n = 0 then '. Everything''s ready' else ', ' || left_n || case when left_n = 1 then ' thing' else ' things' end || ' still to get or do' end;
      for v in select m.id from public.family_members m join public.cal_events e on e.id = h.event_id
               where m.family_id = f.id and m.archived_at is null and m.user_id is not null
                 and (m.id = any (h.people) or (cardinality(h.people) = 0 and m.role in ('parent', 'member')))
                 and m.role in ('parent', 'member')
                 and public.member_sees_event(e, m.id) loop
        perform public.notify(v, 'hosting', h.title || ' is tomorrow', msg, '/m/bookings?host=' || h.id, null, interval '0');
        n := n + 1;
      end loop;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.queue_host_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.host_events, public.host_guests, public.host_items;
  end if;
end $$;
