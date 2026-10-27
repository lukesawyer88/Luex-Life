-- Home Care, part 2 of 3 (guards, ticking a job, the bin rota, reminders, photos).

-- ---------------------------------------------------------------- the bin rota

-- is this a normal collection day for the bin?
create or replace function public.hc_bin_is_day(b public.hc_bins, d date)
returns boolean language sql immutable set search_path = '' as $$
  select mod(mod(d - b.first_on, 7 * b.every_weeks) + 7 * b.every_weeks, 7 * b.every_weeks) = 0
$$;

-- whose turn it is for the collection normally on day d (a swap wins); null: everyone
create or replace function public.hc_bin_person(b public.hc_bins, d date)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.who from public.hc_bin_changes c where c.bin_id = b.id and c.on_date = d),
    case when cardinality(b.people) > 0 then
      b.people[1 + mod(mod(floor((d - b.first_on)::numeric / (7 * b.every_weeks))::integer, cardinality(b.people)) + cardinality(b.people), cardinality(b.people))]
    end)
$$;
revoke all on function public.hc_bin_person(public.hc_bins, date) from public, anon, authenticated;

-- people on a rota or looking after something: in this household, and a child only when a parent says so
create or replace function public.hc_people_ok(f uuid, ids uuid[])
returns boolean language sql stable security definer set search_path = '' as $$
  select public.members_in_family(f, ids)
    and (public.is_family_parent(f) or not exists (
      select 1 from public.family_members m where m.id = any (ids) and m.role = 'child'))
$$;
revoke all on function public.hc_people_ok(uuid, uuid[]) from public, anon, authenticated;

-- a photo must be a real file in this household's folder
create or replace function public.hc_photo_ok(f uuid, p text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p is null or (p ~ ('^' || f::text || '/home/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
    and exists (select 1 from storage.objects o where o.bucket_id = 'home-files' and o.name = p))
$$;
revoke all on function public.hc_photo_ok(uuid, text) from public, anon, authenticated;

create or replace function public.stamp_hc_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); adult boolean; b public.hc_bins%rowtype;
begin
  if (select auth.uid()) is null then return new; end if;
  if new.family_id is distinct from public.my_family_id() then raise exception 'That change is not allowed'; end if;
  if tg_op = 'UPDATE' and new.family_id <> old.family_id then raise exception 'That change is not allowed'; end if;
  adult := public.is_family_adult(new.family_id);

  if tg_table_name = 'hc_bins' then
    if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); new.archived_at := null; end if;
    if (tg_op = 'INSERT' or new.people is distinct from old.people) then
      if (select count(distinct x) from unnest(new.people) x) <> cardinality(new.people) then raise exception 'Pick each person once'; end if;
      -- only people newly added are checked (a grown-up can reorder a rota a parent put a child on)
      if not public.hc_people_ok(new.family_id, array(select unnest(new.people) except
           select unnest(case when tg_op = 'UPDATE' then old.people else '{}'::uuid[] end))) then
        raise exception 'Pick grown-ups in this household';
      end if;
    end if;

  elsif tg_table_name = 'hc_bin_changes' then
    select * into b from public.hc_bins where id = new.bin_id and family_id = new.family_id;
    if not found then raise exception 'That change is not allowed'; end if;
    if tg_op = 'UPDATE' and (new.bin_id <> old.bin_id or new.on_date <> old.on_date) then raise exception 'That change is not allowed'; end if;
    if not public.hc_bin_is_day(b, new.on_date) then raise exception 'That isn''t a collection day'; end if;
    if new.move_to is not null and abs(new.move_to - new.on_date) > 14 then raise exception 'Move it by two weeks at most'; end if;
    if new.who is not null and not public.hc_people_ok(new.family_id, array[new.who]) then raise exception 'Pick a grown-up in this household'; end if;

  elsif tg_table_name = 'hc_jobs' then
    if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); new.archived_at := null; new.last_done_on := null; end if;
    if new.who is not null and (tg_op = 'INSERT' or new.who is distinct from old.who)
       and not public.hc_people_ok(new.family_id, array[new.who]) then raise exception 'Pick a grown-up in this household'; end if;
    if new.contact_id is not null and not exists (select 1 from public.em_contacts where id = new.contact_id and family_id = new.family_id) then
      raise exception 'That change is not allowed';
    end if;

  elsif tg_table_name = 'hc_repairs' then
    if tg_op = 'INSERT' then
      new.created_by := me; new.created_at := now(); new.done_at := null; new.done_by := null; new.deleted_at := null;
      -- children add what's broken; a grown-up decides who sorts it
      if not adult and (new.who is not null or new.contact_id is not null) then raise exception 'That change is not allowed'; end if;
    else
      if new.created_by is distinct from old.created_by then raise exception 'That change is not allowed'; end if;
      if not adult then
        if old.created_by is distinct from me or old.done_at is not null or old.deleted_at is not null
           or new.who is distinct from old.who or new.contact_id is distinct from old.contact_id or new.done_at is distinct from old.done_at then
          raise exception 'That change is not allowed';
        end if;
      end if;
      if new.done_at is not null and old.done_at is null then new.done_at := now(); new.done_by := me;
      elsif new.done_at is null then new.done_by := null;
      elsif new.done_at is distinct from old.done_at then new.done_at := old.done_at; end if;
      if new.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then new.deleted_at := now(); end if;
    end if;
    if new.who is not null and (tg_op = 'INSERT' or new.who is distinct from old.who)
       and not public.hc_people_ok(new.family_id, array[new.who]) then raise exception 'Pick a grown-up in this household'; end if;
    if new.contact_id is not null and not exists (select 1 from public.em_contacts where id = new.contact_id and family_id = new.family_id) then
      raise exception 'That change is not allowed';
    end if;
    if (tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path) and not public.hc_photo_ok(new.family_id, new.photo_path) then
      raise exception 'Add the photo again';
    end if;

  elsif tg_table_name = 'hc_readings' then
    if not exists (select 1 from public.hc_meters where id = new.meter_id and family_id = new.family_id) then raise exception 'That change is not allowed'; end if;
    if tg_op = 'UPDATE' and new.meter_id <> old.meter_id then raise exception 'That change is not allowed'; end if;
    if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); new.deleted_at := null;
    elsif new.created_by is distinct from old.created_by then raise exception 'That change is not allowed'; end if;
    if new.read_on > (now() at time zone 'utc')::date + 1 then raise exception 'That date is in the future'; end if;
    if (tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path) and not public.hc_photo_ok(new.family_id, new.photo_path) then
      raise exception 'Add the photo again';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.stamp_hc_row() from public, anon, authenticated;
create trigger hc_bins_stamp before insert or update on public.hc_bins for each row execute function public.stamp_hc_row();
create trigger hc_bin_changes_stamp before insert or update on public.hc_bin_changes for each row execute function public.stamp_hc_row();
create trigger hc_jobs_stamp before insert or update on public.hc_jobs for each row execute function public.stamp_hc_row();
create trigger hc_repairs_stamp before insert or update on public.hc_repairs for each row execute function public.stamp_hc_row();
create trigger hc_meters_stamp before insert or update on public.hc_meters for each row execute function public.stamp_hc_row();
create trigger hc_readings_stamp before insert or update on public.hc_readings for each row execute function public.stamp_hc_row();

-- a new thing to fix tells the grown-ups (grouped); being asked to sort one tells that person
create or replace function public.after_hc_repair()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); v uuid; who text;
begin
  if (select auth.uid()) is null or new.deleted_at is not null then return null; end if;
  select display_name into who from public.family_members where id = me;
  if tg_op = 'INSERT' then
    for v in select id from public.family_members where family_id = new.family_id and archived_at is null and user_id is not null
               and role in ('parent', 'member') and id <> me and id is distinct from new.who loop
      perform public.notify(v, 'home', 'Something to fix', coalesce(who, 'Someone') || ': ' || new.title, '/m/home-care?tab=fix',
        'hc-fix-' || new.family_id, interval '2 minutes');
    end loop;
  end if;
  if new.who is not null and new.who <> me and (tg_op = 'INSERT' or new.who is distinct from old.who) and new.done_at is null then
    perform public.notify(new.who, 'home', 'Can you sort this?', new.title || coalesce(' (' || new.place || ')', ''), '/m/home-care?tab=fix',
      null, interval '0');
  end if;
  return null;
end $$;
revoke all on function public.after_hc_repair() from public, anon, authenticated;
create trigger hc_repairs_after after insert or update on public.hc_repairs for each row execute function public.after_hc_repair();

-- ---------------------------------------------------------------- ticking a yearly job

create or replace function public.hc_job_tick(p_job uuid, p_done_on date, p_note text)
returns date language plpgsql security definer set search_path = '' as $$
declare j public.hc_jobs%rowtype; nd date;
begin
  select * into j from public.hc_jobs where id = p_job and family_id = public.my_family_id() and archived_at is null;
  if not found or not public.is_family_adult(j.family_id) then raise exception 'That change is not allowed'; end if;
  if p_done_on is null or p_done_on > current_date + 1 or p_done_on < current_date - 400 then raise exception 'Pick the day it was done'; end if;
  insert into public.hc_job_done (job_id, family_id, done_on, note, done_by)
    values (j.id, j.family_id, p_done_on, left(coalesce(trim(p_note), ''), 200), public.my_member_id());
  nd := (p_done_on + make_interval(months => j.every_months))::date;
  -- done long ago: the next one is the first still to come
  while nd < current_date loop nd := (nd + make_interval(months => j.every_months))::date; end loop;
  update public.hc_jobs set last_done_on = greatest(coalesce(last_done_on, p_done_on), p_done_on), next_due = greatest(next_due, nd) where id = j.id;
  return (select next_due from public.hc_jobs where id = j.id);
end $$;
revoke all on function public.hc_job_tick(uuid, date, text) from public, anon;
grant execute on function public.hc_job_tick(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------- reminders (every hour; each sent once)
--   bins: from 7pm the night before, to whoever's turn it is (everyone grown-up when there's no rota)
--   jobs: from 8am, a week before and on the day, to whoever looks after it (or every grown-up)

create or replace function public.queue_home_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare f record; r record; today date; t date; hr integer; n integer := 0;
begin
  for f in select id, coalesce(timezone, 'Europe/London') as tz from public.families where archived_at is null loop
    hr := extract(hour from now() at time zone f.tz);
    today := (now() at time zone f.tz)::date;
    t := today + 1;

    if hr >= 19 then
      for r in
        with due as (
          -- normal collections tomorrow that weren't moved or skipped
          select b.id, b.name, public.hc_bin_person(b, t) as person from public.hc_bins b
          where b.family_id = f.id and b.archived_at is null and public.hc_bin_is_day(b, t)
            and not exists (select 1 from public.hc_bin_changes c where c.bin_id = b.id and c.on_date = t and (c.skip or c.move_to is not null))
          union all
          -- collections moved to tomorrow (from a real collection day)
          select b.id, b.name, public.hc_bin_person(b, c.on_date) from public.hc_bin_changes c join public.hc_bins b on b.id = c.bin_id
          where b.family_id = f.id and b.archived_at is null and c.move_to = t and not c.skip and public.hc_bin_is_day(b, c.on_date)
        ), fresh as (
          -- keyed on the day it's really collected, so a collection moved after its first reminder is reminded again
          insert into public.hc_sends (ref_id, for_date, kind) select distinct id, t, 'bin' from due on conflict do nothing returning ref_id
        ), sendto as (
          select d.name, m.id as member_id from due d join fresh s on s.ref_id = d.id
          join public.family_members m on m.family_id = f.id and m.archived_at is null and m.user_id is not null
            and ((d.person is not null and m.id = d.person)
              or ((d.person is null or not exists (select 1 from public.family_members p where p.id = d.person and p.archived_at is null and p.user_id is not null))
                  and m.role in ('parent', 'member')))
        )
        select member_id, string_agg(name, ' and ' order by name) as names, count(*) as k from sendto group by member_id
      loop
        perform public.notify(r.member_id, 'home', 'Bins out tonight', r.names || case when r.k > 1 then ' go' else ' goes' end || ' tomorrow',
          '/m/home-care', null, interval '0');
        n := n + 1;
      end loop;
    end if;

    if hr >= 8 then
      for r in
        with due as (
          select j.id, j.title, j.next_due, j.who, case when j.next_due = today then 'job_day' else 'job_week' end as kind
          from public.hc_jobs j
          where j.family_id = f.id and j.archived_at is null and (j.next_due = today or j.next_due = today + 7)
        ), fresh as (
          insert into public.hc_sends (ref_id, for_date, kind) select id, next_due, kind from due on conflict do nothing returning ref_id, kind
        )
        select d.title, d.kind, d.next_due, m.id as member_id from due d join fresh s on s.ref_id = d.id and s.kind = d.kind
        join public.family_members m on m.family_id = f.id and m.archived_at is null and m.user_id is not null
          and ((d.who is not null and m.id = d.who)
            or ((d.who is null or not exists (select 1 from public.family_members p where p.id = d.who and p.archived_at is null and p.user_id is not null))
                and m.role in ('parent', 'member')))
      loop
        perform public.notify(r.member_id, 'home', case when r.kind = 'job_day' then 'Due today: ' else 'Due next week: ' end || r.title,
          case when r.kind = 'job_day' then 'Tick it in Home Care once it''s done' else 'Time to book it in' end, '/m/home-care?tab=jobs', null, interval '0');
        n := n + 1;
      end loop;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.queue_home_reminders() from public, anon, authenticated;

create or replace function public.hc_tidy_sends()
returns void language sql security definer set search_path = '' as $$
  delete from public.hc_sends where for_date < current_date - 30
$$;
revoke all on function public.hc_tidy_sends() from public, anon, authenticated;

-- photos nothing uses any more (taken off, replaced, or on something removed), at least a day old: the nightly
-- "file-tidy" server function deletes them (the database can't delete stored files itself)
create or replace function public.hc_unused_files(p_limit integer)
returns setof text language sql stable security definer set search_path = '' as $$
  select o.name from storage.objects o
  where o.bucket_id = 'home-files' and o.created_at < now() - interval '1 day'
    and not exists (select 1 from public.hc_repairs r where r.photo_path = o.name and r.deleted_at is null)
    and not exists (select 1 from public.hc_readings r where r.photo_path = o.name and r.deleted_at is null)
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 500), 1), 1000)
$$;
revoke all on function public.hc_unused_files(integer) from public, anon, authenticated;
grant execute on function public.hc_unused_files(integer) to service_role;

-- ---------------------------------------------------------------- photos (private bucket): <family>/home/<file>.jpg

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('home-files', 'home-files', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create or replace function public.hc_file_ok(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_name, '/');
  uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if array_length(parts, 1) <> 3 or parts[1] !~ uuid_re or parts[2] <> 'home' or parts[3] !~ (substr(uuid_re, 1, length(uuid_re) - 1) || '\.jpg$') then
    return false;
  end if;
  if parts[1]::uuid is distinct from public.my_family_id() or not public.is_family_member(parts[1]::uuid) then return false; end if;
  if p_write then return public.food_bytes_used(parts[1]::uuid) < public.board_allowance(); end if;
  return true;
end $$;
revoke all on function public.hc_file_ok(text, boolean) from public, anon;
grant execute on function public.hc_file_ok(text, boolean) to authenticated;

-- the family's space: every module's files together
create or replace function public.food_bytes_used(f uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint from storage.objects o
  where o.bucket_id in ('board-media', 'food-files', 'money-files', 'reward-files', 'school-files', 'doc-files', 'home-files') and o.name like f::text || '/%'
$$;
revoke all on function public.food_bytes_used(uuid) from public, anon, authenticated;

create policy hc_files_read on storage.objects for select to authenticated
  using (bucket_id = 'home-files' and public.hc_file_ok(name, false));
create policy hc_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'home-files' and public.hc_file_ok(name, true));
create policy hc_files_remove on storage.objects for delete to authenticated
  using (bucket_id = 'home-files' and public.hc_file_ok(name, false) and public.is_family_adult(split_part(name, '/', 1)::uuid));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.hc_bins, public.hc_bin_changes, public.hc_jobs, public.hc_repairs, public.hc_readings;
  end if;
end $$;
