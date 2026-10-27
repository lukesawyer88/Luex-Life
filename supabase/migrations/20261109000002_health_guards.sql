-- Family Health, part 2 of 3 (guards and reminders).

create or replace function public.stamp_health_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); m public.health_meds%rowtype; today date;
begin
  if (select auth.uid()) is null then return new; end if;
  if new.family_id is distinct from public.my_family_id() then raise exception 'That change is not allowed'; end if;
  if tg_op = 'UPDATE' and new.family_id <> old.family_id then raise exception 'That change is not allowed'; end if;
  today := (now() at time zone coalesce((select timezone from public.families where id = new.family_id), 'Europe/London'))::date;

  if tg_table_name = 'health_meds' then
    if tg_op = 'UPDATE' and new.person_id <> old.person_id then raise exception 'That change is not allowed'; end if;
    if tg_op = 'INSERT' and not public.members_in_family(new.family_id, array[new.person_id]) then raise exception 'Pick someone in this household'; end if;
    if cardinality(new.times) <> cardinality(array(select distinct unnest(new.times))) then raise exception 'Each time only once'; end if;
    -- reminders only go to parents (they're the only ones who can see Health); on a change, anyone who has since
    -- left or stopped being a parent is quietly taken off, so the reminder can still be changed or stopped
    if tg_op = 'INSERT' and exists (select 1 from unnest(new.remind) r where not exists (select 1 from public.family_members x
               where x.id = r and x.family_id = new.family_id and x.role = 'parent' and x.archived_at is null)) then
      raise exception 'Reminders can only go to parents';
    end if;
    new.remind := array(select distinct r from unnest(new.remind) r where exists (select 1 from public.family_members x
      where x.id = r and x.family_id = new.family_id and x.role = 'parent' and x.archived_at is null));
    if cardinality(new.remind) = 0 then new.remind := array[me]; end if;
    if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); new.deleted_at := null;
    else
      if old.deleted_at is not null then raise exception 'That change is not allowed'; end if;
      if new.deleted_at is not null then new.deleted_at := now(); end if;
    end if;

  elsif tg_table_name = 'health_doses' then
    select * into m from public.health_meds where id = new.med_id and family_id = new.family_id and deleted_at is null;
    if m.id is null then raise exception 'That change is not allowed'; end if;
    if tg_op = 'UPDATE' and (new.med_id <> old.med_id or new.on_date <> old.on_date or new.at_time <> old.at_time) then
      raise exception 'That change is not allowed';
    end if;
    if tg_op = 'INSERT' then
      if not (new.at_time = any (m.times)) or new.on_date < m.start_on or (m.end_on is not null and new.on_date > m.end_on)
         or new.on_date > today + 1 or new.on_date < today - 7 then
        raise exception 'That dose isn''t on the list';
      end if;
      new.reminded_at := null;
    else
      new.reminded_at := old.reminded_at;
    end if;
    if new.given_at is not null and (tg_op = 'INSERT' or old.given_at is null) then new.given_at := now(); new.given_by := me;
    elsif new.given_at is null then new.given_by := null;
    elsif tg_op = 'UPDATE' then new.given_at := old.given_at; new.given_by := old.given_by; end if;

  elsif tg_table_name = 'health_checks' then
    if tg_op = 'UPDATE' and new.person_id <> old.person_id then raise exception 'That change is not allowed'; end if;
    if tg_op = 'INSERT' then
      if not public.members_in_family(new.family_id, array[new.person_id]) then raise exception 'Pick someone in this household'; end if;
      new.created_by := me; new.created_at := now(); new.deleted_at := null; new.done_at := null; new.last_done_on := null; new.reminded_on := null;
    else
      if old.deleted_at is not null then raise exception 'That change is not allowed'; end if;
      if new.deleted_at is not null then new.deleted_at := now(); end if;
      if new.last_done_on is distinct from old.last_done_on and new.last_done_on is not null then
        if new.last_done_on > today + 1 then raise exception 'Pick a day that has happened'; end if;
        -- done: a repeating one moves to its next date; a one-off is finished
        if new.every_months is not null then
          new.due_on := (new.last_done_on + make_interval(months => new.every_months))::date; new.done_at := null;
        else
          new.done_at := now();
        end if;
        new.reminded_on := null;
      elsif new.done_at is not null and old.done_at is null then new.done_at := now();
      elsif new.done_at is not null then new.done_at := old.done_at;
      end if;
      if new.due_on is distinct from old.due_on then new.reminded_on := null; end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.stamp_health_row() from public, anon, authenticated;
create trigger health_meds_stamp before insert or update on public.health_meds for each row execute function public.stamp_health_row();
create trigger health_doses_stamp before insert or update on public.health_doses for each row execute function public.stamp_health_row();
create trigger health_checks_stamp before insert or update on public.health_checks for each row execute function public.stamp_health_row();

-- ---------------------------------------------------------------- reminders (every 5 minutes)
-- Medicine: at each time (within half an hour of it, once), unless it's already been ticked as given, to the
-- parents picked on the reminder. Check-ups: from 8am on the day they're due, once per date, to every parent.

create or replace function public.queue_health_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare f record; m record; c record; v uuid; local timestamp; today date; n integer := 0; made integer;
begin
  for f in select id, coalesce(timezone, 'Europe/London') as tz from public.families where archived_at is null loop
    local := now() at time zone f.tz;
    today := local::date;

    -- each dose time today and yesterday as a real instant, so times just before midnight still fire
    for m in
      select x.id, x.remind, t.at_time, d.on_day, p.display_name as who
      from public.health_meds x cross join lateral unnest(x.times) as t(at_time)
      cross join lateral (values (today), (today - 1)) as d(on_day)
      join public.family_members p on p.id = x.person_id
      where x.family_id = f.id and x.deleted_at is null and p.archived_at is null
        and x.start_on <= d.on_day and (x.end_on is null or x.end_on >= d.on_day)
        and now() - ((d.on_day + t.at_time::time) at time zone f.tz) between interval '0' and interval '30 minutes'
    loop
      insert into public.health_doses (family_id, med_id, on_date, at_time, reminded_at)
        values (f.id, m.id, m.on_day, m.at_time, now()) on conflict (med_id, on_date, at_time) do nothing;
      get diagnostics made = row_count;
      if made = 0 then continue; end if;
      for v in select x.id from public.family_members x where x.id = any (m.remind) and x.family_id = f.id
                 and x.role = 'parent' and x.archived_at is null and x.user_id is not null loop
        -- kept plain: it can show on a locked phone
        perform public.notify(v, 'health', 'Medicine time for ' || m.who, 'Tap to see what, and tick it when it''s given',
          '/m/health?tab=medicine', null, interval '0');
        n := n + 1;
      end loop;
    end loop;

    if extract(hour from local) >= 8 then
      for c in
        select x.id, x.due_on, p.display_name as who from public.health_checks x join public.family_members p on p.id = x.person_id
        where x.family_id = f.id and x.deleted_at is null and x.done_at is null and x.due_on <= today
          and x.reminded_on is distinct from x.due_on and p.archived_at is null
      loop
        update public.health_checks set reminded_on = c.due_on where id = c.id;
        for v in select x.id from public.family_members x where x.family_id = f.id and x.role = 'parent' and x.archived_at is null and x.user_id is not null loop
          perform public.notify(v, 'health', 'A check-up is due for ' || c.who, 'Tap to see which. Book it, then tick it when it''s done',
            '/m/health?tab=checks', null, interval '0');
          n := n + 1;
        end loop;
      end loop;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.queue_health_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.health_meds, public.health_doses, public.health_checks;
  end if;
end $$;
