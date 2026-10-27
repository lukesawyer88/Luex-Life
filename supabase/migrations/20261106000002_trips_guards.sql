-- Trips and Holidays, part 2 of 3 (guards and the "two days to go" message).

create or replace function public.stamp_trip_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); adult boolean;
begin
  if (select auth.uid()) is null then return new; end if;
  if new.family_id is distinct from public.my_family_id() then raise exception 'That change is not allowed'; end if;
  if tg_op = 'UPDATE' and new.family_id <> old.family_id then raise exception 'That change is not allowed'; end if;
  adult := public.is_family_adult(new.family_id);

  if tg_table_name = 'trips' then
    if tg_op = 'INSERT' then
      -- a trip sits on a Calendar trip event in this household that I can see, added here (not imported) by a grown-up,
      -- so a child can't later change or remove the trip by changing their own event
      if not exists (select 1 from public.cal_events e join public.family_members m on m.id = e.created_by_member
                     where e.id = new.event_id and e.family_id = new.family_id and e.type = 'trip' and e.deleted_at is null
                       and e.source = 'manual' and e.rrule is null and m.role in ('parent', 'member'))
         or not public.can_see_event(new.event_id) then
        raise exception 'That change is not allowed';
      end if;
      new.created_by := me; new.created_at := now(); new.reminded_on := null;
    end if;

  elsif tg_table_name = 'trip_items' then
    if not exists (select 1 from public.trips where id = new.trip_id and family_id = new.family_id) then raise exception 'That change is not allowed'; end if;
    -- removed stays removed
    if tg_op = 'UPDATE' and old.deleted_at is not null then raise exception 'That change is not allowed'; end if;
    if tg_op = 'UPDATE' and (new.trip_id <> old.trip_id or new.kind <> old.kind or new.created_by is distinct from old.created_by) then
      raise exception 'That change is not allowed';
    end if;
    if new.member_id is not null and not public.members_in_family(new.family_id, array[new.member_id]) then raise exception 'Pick someone in this household'; end if;
    -- children pack their own things: they add, rename, tick and remove their own packing, nothing else
    if not adult then
      if new.kind <> 'pack' or new.member_id is distinct from me then raise exception 'That change is not allowed'; end if;
      if tg_op = 'UPDATE' and (old.member_id is distinct from me or new.position <> old.position) then raise exception 'That change is not allowed'; end if;
    end if;
    if tg_op = 'INSERT' then
      new.created_by := me; new.created_at := now(); new.deleted_at := null;
      new.done_at := null; new.done_by := null;
    else
      if new.done_at is not null and old.done_at is null then new.done_at := now(); new.done_by := me;
      elsif new.done_at is null then new.done_by := null;
      elsif new.done_at is distinct from old.done_at then new.done_at := old.done_at; end if;
      if new.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then new.deleted_at := now(); end if;
    end if;

  elsif tg_table_name = 'trip_ideas' then
    if tg_op = 'UPDATE' and old.deleted_at is not null then raise exception 'That change is not allowed'; end if;
    if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); new.deleted_at := null; new.done_at := null;
    else
      if new.created_by is distinct from old.created_by then raise exception 'That change is not allowed'; end if;
      -- grown-ups change any idea; others only their own
      if not adult and old.created_by is distinct from me then raise exception 'That change is not allowed'; end if;
      if new.done_at is not null and old.done_at is null then new.done_at := now();
      elsif new.done_at is distinct from old.done_at and new.done_at is not null then new.done_at := old.done_at; end if;
      if new.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then new.deleted_at := now(); end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.stamp_trip_row() from public, anon, authenticated;
create trigger trips_stamp before insert or update on public.trips for each row execute function public.stamp_trip_row();
create trigger trip_items_stamp before insert or update on public.trip_items for each row execute function public.stamp_trip_row();
create trigger trip_ideas_stamp before insert or update on public.trip_ideas for each row execute function public.stamp_trip_row();

-- ---------------------------------------------------------------- "two days to go" (from 6pm family time, once per start date;
-- a trip added the day before still gets it)
-- To whoever's going (who can see the trip), or every grown-up when nobody is picked.

create or replace function public.queue_trip_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare f record; t record; v uuid; today date; n integer := 0; left_n integer; msg text;
begin
  for f in select id, coalesce(timezone, 'Europe/London') as tz from public.families where archived_at is null loop
    if extract(hour from now() at time zone f.tz) < 18 then continue; end if;
    today := (now() at time zone f.tz)::date;
    for t in
      select x.id, e.id as event_id, e.title, e.people, (e.starts_at at time zone f.tz)::date as starts
      from public.trips x join public.cal_events e on e.id = x.event_id
      where x.family_id = f.id and e.deleted_at is null and e.type = 'trip' and (e.starts_at at time zone f.tz)::date between today + 1 and today + 2
        and x.reminded_on is distinct from (e.starts_at at time zone f.tz)::date
    loop
      update public.trips set reminded_on = t.starts where id = t.id;
      for v in select m.id from public.family_members m join public.cal_events e on e.id = t.event_id
               where m.family_id = f.id and m.archived_at is null and m.user_id is not null
                 and (m.id = any (t.people) or (cardinality(t.people) = 0 and m.role in ('parent', 'member')))
                 and public.member_sees_event(e, m.id) loop
        -- what's still to pack for this person (their own and the shared things) and still to do before going
        select count(*) into left_n from public.trip_items i where i.trip_id = t.id and i.deleted_at is null and i.done_at is null
          and ((i.kind = 'pack' and (i.member_id is null or i.member_id = v)) or i.kind = 'todo');
        msg := case when left_n = 0 then 'Everything''s ticked. Have a lovely time' else left_n || case when left_n = 1 then ' thing' else ' things' end || ' still to pack or do' end;
        perform public.notify(v, 'trip', 'Off to ' || t.title || ' on ' || to_char(t.starts, 'FMDay'), msg, '/m/trips?trip=' || t.id, null, interval '0');
        n := n + 1;
      end loop;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.queue_trip_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.trips, public.trip_items, public.trip_ideas;
  end if;
end $$;
