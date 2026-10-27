-- School and Activities, part 2 of 3 (guards, notifications, the morning summary, letter photos).

create or replace function public.school_role(m uuid) returns text language sql stable security definer set search_path = '' as $$
  select role from public.family_members where id = m
$$;
revoke all on function public.school_role(uuid) from public, anon, authenticated;

-- a letter photo must be a real file in the household's school folder
create or replace function public.school_photo_ok(f uuid, p text) returns boolean language sql stable security definer set search_path = '' as $$
  select p is null or (p like f::text || '/school/%' and exists (select 1 from storage.objects o where o.bucket_id = 'school-files' and o.name = p))
$$;
revoke all on function public.school_photo_ok(uuid, text) from public, anon, authenticated;

create or replace function public.stamp_school_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); parent boolean; my_role text; e public.cal_events%rowtype;
begin
  if (select auth.uid()) is null then return new; end if;
  if new.family_id is distinct from public.my_family_id() then raise exception 'That change is not allowed'; end if;
  if tg_op = 'UPDATE' and new.family_id <> old.family_id then raise exception 'That change is not allowed'; end if;
  parent := public.is_family_parent(new.family_id);
  my_role := public.school_role(me);

  case tg_table_name
    when 'school_places' then
      if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); new.archived_at := null; end if;

    when 'school_children', 'school_days' then
      if public.school_role(new.member_id) is distinct from 'child' or not public.members_in_family(new.family_id, array[new.member_id]) then
        raise exception 'Pick a child in this household';
      end if;
      if tg_table_name = 'school_children' then
        if new.place_id is not null and not exists (select 1 from public.school_places where id = new.place_id and family_id = new.family_id) then
          raise exception 'That change is not allowed';
        end if;
        new.updated_at := now();
      else
        if exists (select 1 from unnest(new.bring) b where char_length(b) not between 1 and 40) then raise exception 'Keep each item short'; end if;
      end if;

    when 'school_runs', 'school_run_changes' then
      if public.school_role(new.member_id) is distinct from 'child'
         or not public.members_in_family(new.family_id, array_remove(array[new.member_id, new.drop_by, new.pick_by], null)) then
        raise exception 'Pick people in this household';
      end if;
      -- only grown-ups do the school run
      if coalesce(public.school_role(new.drop_by), 'parent') = 'child' or coalesce(public.school_role(new.pick_by), 'parent') = 'child' then
        raise exception 'Pick a grown-up for the school run';
      end if;
      if tg_table_name = 'school_run_changes' then
        if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); end if;
        if new.on_date < public.family_today(new.family_id) - 1 or new.on_date > public.family_today(new.family_id) + 366 then
          raise exception 'Pick a day from today on';
        end if;
      end if;

    when 'school_activities' then
      select * into e from public.cal_events where id = new.event_id;
      if not found or e.family_id <> new.family_id or e.deleted_at is not null then raise exception 'That change is not allowed'; end if;
      -- clubs are for everyone to see: never a private event (it would show in everyone's morning summary)
      if e.visibility <> 'all' or not public.can_see_event(new.event_id) then raise exception 'Only events everyone can see can be a club'; end if;
      if not public.members_in_family(new.family_id, array[new.member_id]) then raise exception 'Pick someone in this household'; end if;
      if new.place_id is not null and not exists (select 1 from public.school_places where id = new.place_id and family_id = new.family_id) then
        raise exception 'That change is not allowed';
      end if;
      if exists (select 1 from unnest(new.kit) k where char_length(k) not between 1 and 40) then raise exception 'Keep each item short'; end if;
      if tg_op = 'INSERT' then new.created_by := me; new.created_at := now();
      elsif new.event_id <> old.event_id or new.member_id <> old.member_id then raise exception 'That change is not allowed'; end if;

    when 'school_tasks' then
      if new.member_id is not null and not public.members_in_family(new.family_id, array[new.member_id]) then
        raise exception 'Pick someone in this household';
      end if;
      if (tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path) and not public.school_photo_ok(new.family_id, new.photo_path) then
        raise exception 'Add the photo again';
      end if;
      if tg_op = 'INSERT' then
        new.created_by := me; new.created_at := now(); new.done_at := null; new.done_by := null; new.deleted_at := null;
        -- children add their own homework only
        if my_role = 'child' and (new.kind <> 'homework' or new.member_id is distinct from me) then
          raise exception 'Ask a grown-up to add that';
        end if;
      else
        if my_role = 'child' and (old.member_id is distinct from me or old.kind <> 'homework') then
          raise exception 'That change is not allowed';
        end if;
        -- ticking: anyone allowed to see it; changing the details: whoever added it, or a parent
        if (new.title, new.kind, new.due_on, new.amount, new.note, new.photo_path, new.member_id, new.deleted_at)
           is distinct from (old.title, old.kind, old.due_on, old.amount, old.note, old.photo_path, old.member_id, old.deleted_at)
           and not (parent or old.created_by = me) then
          raise exception 'Only the person who added this, or a parent, can change it';
        end if;
        if my_role = 'child' and (new.kind <> 'homework' or new.member_id is distinct from me) then raise exception 'That change is not allowed'; end if;
        if new.done_at is not null and old.done_at is null then new.done_at := now(); new.done_by := me;
        elsif new.done_at is null then new.done_by := null;
        else new.done_at := old.done_at; new.done_by := old.done_by; end if;
        if new.deleted_at is not null and old.deleted_at is null then new.deleted_at := now(); end if;
      end if;

    when 'school_people' then
      null;

    else null;
  end case;
  return new;
end $$;
revoke all on function public.stamp_school_row() from public, anon, authenticated;

create trigger school_places_stamp before insert or update on public.school_places for each row execute function public.stamp_school_row();
create trigger school_children_stamp before insert or update on public.school_children for each row execute function public.stamp_school_row();
create trigger school_days_stamp before insert or update on public.school_days for each row execute function public.stamp_school_row();
create trigger school_activities_stamp before insert or update on public.school_activities for each row execute function public.stamp_school_row();
create trigger school_runs_stamp before insert or update on public.school_runs for each row execute function public.stamp_school_row();
create trigger school_run_changes_stamp before insert or update on public.school_run_changes for each row execute function public.stamp_school_row();
create trigger school_tasks_stamp before insert or update on public.school_tasks for each row execute function public.stamp_school_row();
create trigger school_people_stamp before insert or update on public.school_people for each row execute function public.stamp_school_row();

-- a changed pickup tells the people now doing it
create or replace function public.after_school_run_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); child text; day_name text; v uuid;
begin
  -- only when who's doing it (or the time) changed, and only to the people newly named
  if tg_op = 'UPDATE' and (new.drop_by, new.pick_by, new.pick_time) is not distinct from (old.drop_by, old.pick_by, old.pick_time) then
    return null;
  end if;
  select display_name into child from public.family_members where id = new.member_id;
  day_name := case when new.on_date = public.family_today(new.family_id) then 'today' else to_char(new.on_date, 'FMDay FMDD FMMonth') end;
  for v in select distinct x from unnest(array[new.drop_by, new.pick_by]) x where x is not null and x is distinct from me
             and (tg_op = 'INSERT' or x is distinct from old.drop_by and x is distinct from old.pick_by or new.pick_time is distinct from old.pick_time) loop
    perform public.notify(v, 'school', 'School run ' || day_name,
      concat_ws(' and ', case when new.drop_by = v then 'You''re taking ' || child end,
                         case when new.pick_by = v then 'You''re picking up ' || child || coalesce(' at ' || to_char(new.pick_time, 'HH24:MI'), '') end),
      '/m/school', 'school-run:' || new.member_id || ':' || new.on_date, interval '2 minutes');
  end loop;
  return null;
end $$;
revoke all on function public.after_school_run_change() from public, anon, authenticated;
create trigger school_run_changes_after after insert or update on public.school_run_changes for each row execute function public.after_school_run_change();

-- ---------------------------------------------------------------- the morning summary (once a day, 7 to 9.30am family time)

-- one line for a child today: what to bring, clubs, who's taking and picking up, what's due
create or replace function public.school_today_line(c uuid, today date, tz text, only_runs_for uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  dow integer := extract(isodow from today)::integer;
  code text := (array['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow from today)::integer];
  parts text[] := '{}'; d public.school_days%rowtype; drop_by uuid; pick_by uuid; pick_time time; ch record; a record; t record;
begin
  -- who's doing the school run (a change for today wins)
  select r.drop_by, r.pick_by, r.pick_time into drop_by, pick_by, pick_time from public.school_run_changes r where r.member_id = c and r.on_date = today;
  if not found and dow <= 5 then
    select r.drop_by, r.pick_by, r.pick_time into drop_by, pick_by, pick_time from public.school_runs r where r.member_id = c and r.weekday = dow;
  end if;
  if only_runs_for is not null then
    if drop_by = only_runs_for then parts := parts || 'you''re taking them'; end if;
    if pick_by = only_runs_for then parts := parts || ('you''re picking up' || coalesce(' at ' || to_char(pick_time, 'HH24:MI'), '')); end if;
    return array_to_string(parts, ' · ');
  end if;
  select * into d from public.school_days where member_id = c and weekday = dow;
  if found and cardinality(d.bring) > 0 then parts := parts || array_to_string(d.bring, ', '); end if;
  if found and d.lunch = 'packed' then parts := parts || 'packed lunch'::text; end if;
  for a in select e.title, e.starts_at, sa.kit from public.school_activities sa join public.cal_events e on e.id = sa.event_id
           where sa.member_id = c and e.deleted_at is null and e.recurrence_of is null and e.visibility = 'all'
             and not exists (select 1 from unnest(e.exdates) x where (x at time zone tz)::date = today)
             and ((e.rrule is null and (e.starts_at at time zone tz)::date = today)
               or (e.rrule ~ '^FREQ=WEEKLY' and e.rrule like '%' || code || '%' and (e.starts_at at time zone tz)::date <= today)
               or (e.rrule ~ '^FREQ=DAILY' and (e.starts_at at time zone tz)::date <= today))
           order by (e.starts_at at time zone tz)::time loop
    parts := parts || (a.title || ' ' || to_char(a.starts_at at time zone tz, 'HH24:MI')
      || case when cardinality(a.kit) > 0 then ' (' || array_to_string(a.kit, ', ') || ')' else '' end);
  end loop;
  if pick_by is not null then
    select display_name into ch from public.family_members where id = pick_by;
    parts := parts || (ch.display_name || ' picks up' || coalesce(' at ' || to_char(pick_time, 'HH24:MI'), ''));
  end if;
  for t in select title from public.school_tasks where (member_id = c) and deleted_at is null and done_at is null
             and due_on between today and today + 1 order by due_on limit 3 loop
    parts := parts || (t.title || ' due');
  end loop;
  return array_to_string(parts, ' · ');
end $$;
revoke all on function public.school_today_line(uuid, date, text, uuid) from public, anon, authenticated;

create or replace function public.queue_school_morning()
returns integer language plpgsql security definer set search_path = '' as $$
declare f record; p record; c record; today date; now_t time; lines text[]; line text; n integer := 0;
begin
  for f in select id, coalesce(timezone, 'Europe/London') as tz from public.families where archived_at is null loop
    now_t := (now() at time zone f.tz)::time;
    if now_t < '07:00' or now_t > '09:30' then continue; end if;
    today := (now() at time zone f.tz)::date;
    if not exists (select 1 from public.family_members where family_id = f.id and role = 'child' and archived_at is null) then continue; end if;
    for p in select m.id, m.role from public.family_members m where m.family_id = f.id and m.archived_at is null and m.user_id is not null
             and coalesce((select morning from public.school_people sp where sp.member_id = m.id), true) loop
      lines := '{}';
      for c in select m.id, m.display_name from public.family_members m
               where m.family_id = f.id and m.role = 'child' and m.archived_at is null
                 and (p.role = 'parent' or m.id = p.id or p.role = 'member') order by m.display_name loop
        line := public.school_today_line(c.id, today, f.tz, case when p.role = 'member' then p.id end);
        if line <> '' then lines := lines || (case when p.role = 'child' then '' else c.display_name || ': ' end || line); end if;
      end loop;
      -- tasks for everyone (no child named)
      for c in select title from public.school_tasks where family_id = f.id and member_id is null and deleted_at is null and done_at is null
                 and due_on between today and today + 1 and p.role <> 'member' limit 2 loop
        lines := lines || (c.title || ' due');
      end loop;
      if cardinality(lines) = 0 then continue; end if;
      insert into public.school_sends (member_id, for_date) values (p.id, today) on conflict do nothing;
      if not found then continue; end if;
      perform public.notify(p.id, 'school', 'Today', array_to_string(lines, ' | '), '/m/school', null, interval '0');
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.queue_school_morning() from public, anon, authenticated;

create or replace function public.school_tidy_sends()
returns void language sql security definer set search_path = '' as $$
  delete from public.school_sends where for_date < current_date - 30
$$;
revoke all on function public.school_tidy_sends() from public, anon, authenticated;

-- ---------------------------------------------------------------- letter photos (private bucket)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-files', 'school-files', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- <family>/school/<file>: everyone in the household reads and adds (within the family's space); the uploader or a parent removes
create or replace function public.school_file_ok(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_name, '/');
  uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if array_length(parts, 1) <> 3 or parts[1] !~ uuid_re or parts[2] <> 'school' or parts[3] = '' then return false; end if;
  if parts[1]::uuid is distinct from public.my_family_id() or not public.is_family_member(parts[1]::uuid) then return false; end if;
  if p_write then return public.food_bytes_used(parts[1]::uuid) < public.board_allowance(); end if;
  return true;
end $$;
revoke all on function public.school_file_ok(text, boolean) from public, anon;
grant execute on function public.school_file_ok(text, boolean) to authenticated;

-- the family's space: Board, Food, Money, Rewards and School files together
create or replace function public.food_bytes_used(f uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint from storage.objects o
  where o.bucket_id in ('board-media', 'food-files', 'money-files', 'reward-files', 'school-files') and o.name like f::text || '/%'
$$;
revoke all on function public.food_bytes_used(uuid) from public, anon, authenticated;

create policy school_files_read on storage.objects for select to authenticated
  using (bucket_id = 'school-files' and public.school_file_ok(name, false));
create policy school_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'school-files' and public.school_file_ok(name, true));
create policy school_files_remove on storage.objects for delete to authenticated
  using (bucket_id = 'school-files' and public.school_file_ok(name, false)
    and (owner_id = (select auth.uid())::text or public.is_family_parent(public.my_family_id())));

-- ---------------------------------------------------------------- live updates (plain uuid keys only)

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.school_tasks, public.school_run_changes, public.school_activities, public.school_places;
  end if;
end $$;
