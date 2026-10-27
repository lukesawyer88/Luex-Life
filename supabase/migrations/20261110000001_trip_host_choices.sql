-- Parents' choices on trips and parties: whether children see a trip's plans (flights, hotel, references), and when
-- the reminder comes (off, or 1 to 3 days before).

alter table public.trips
  add column kids_see_plans boolean not null default true,
  add column remind_days smallint not null default 2 check (remind_days between 0 and 3);
alter table public.host_events
  add column remind_days smallint not null default 1 check (remind_days between 0 and 3);

grant insert (kids_see_plans, remind_days) on public.trips to authenticated;
grant update (kids_see_plans, remind_days) on public.trips to authenticated;
grant insert (remind_days) on public.host_events to authenticated;
grant update (remind_days) on public.host_events to authenticated;

-- a trip's plans: grown-ups always; children only when the trip allows it
create or replace function public.trip_plans_visible(t uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_family_adult(public.my_family_id())
    or exists (select 1 from public.trips x where x.id = t and x.kids_see_plans)
$$;
revoke all on function public.trip_plans_visible(uuid) from public, anon;
grant execute on function public.trip_plans_visible(uuid) to authenticated;

alter policy trip_items_read on public.trip_items
  using (public.trip_visible(trip_id) and (kind <> 'plan' or public.trip_plans_visible(trip_id)));

-- "N days to go" (from 6pm family time, once per start date): within the days the trip asks for
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
      where x.family_id = f.id and e.deleted_at is null and e.type = 'trip' and x.remind_days > 0
        and (e.starts_at at time zone f.tz)::date between today + 1 and today + x.remind_days
        and x.reminded_on is distinct from (e.starts_at at time zone f.tz)::date
    loop
      update public.trips set reminded_on = t.starts where id = t.id;
      for v in select m.id from public.family_members m join public.cal_events e on e.id = t.event_id
               where m.family_id = f.id and m.archived_at is null and m.user_id is not null
                 and (m.id = any (t.people) or (cardinality(t.people) = 0 and m.role in ('parent', 'member')))
                 and public.member_sees_event(e, m.id) loop
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

-- the hosts' reminder (from 6pm family time, once per date): within the days the plan asks for
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
      where x.family_id = f.id and e.deleted_at is null and e.type = 'social' and x.remind_days > 0
        and (e.starts_at at time zone f.tz)::date between today + 1 and today + x.remind_days
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
        perform public.notify(v, 'hosting',
          h.title || case when h.on_day = today + 1 then ' is tomorrow' else ' is on ' || to_char(h.on_day, 'FMDay') end,
          msg, '/m/bookings?host=' || h.id, null, interval '0');
        n := n + 1;
      end loop;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.queue_host_reminders() from public, anon, authenticated;
