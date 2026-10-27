-- Family Calendar, part 7 of 7 (actions). See part 1 for the rules.

-- ---------------------------------------------------------------- doing things

-- save this device for push; a device moves to whoever is signed in on it now
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_agent text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); me uuid := public.my_member_id(); fid uuid := public.my_family_id();
begin
  if uid is null or me is null then raise exception 'Please sign in'; end if;
  if p_endpoint !~* '^https://' then raise exception 'That device cannot get notifications'; end if;
  if (select count(*) from public.push_subscriptions where user_id = uid) >= 10 then
    delete from public.push_subscriptions where id = (select id from public.push_subscriptions where user_id = uid order by created_at limit 1);
  end if;
  -- a device can move to a new person only when it proves it is the same device (same keys)
  delete from public.push_subscriptions where endpoint = p_endpoint and (user_id = uid or (p256dh = p_p256dh and auth = p_auth));
  if exists (select 1 from public.push_subscriptions where endpoint = p_endpoint) then
    raise exception 'That device cannot get notifications';
  end if;
  insert into public.push_subscriptions (family_id, member_id, user_id, endpoint, p256dh, auth, user_agent)
    values (fid, me, uid, p_endpoint, p_p256dh, p_auth, left(p_agent, 300));
end $$;

-- a parent makes a share link; the token is shown once
create or replace function public.create_share(p_name text, p_kind text, p_people uuid[], p_show_notes boolean, p_hours integer)
returns text language plpgsql security definer set search_path = '' as $$
declare fid uuid := public.my_family_id(); tok text;
begin
  if fid is null or not public.is_family_parent(fid) then raise exception 'Only a parent can share the calendar'; end if;
  if p_kind not in ('babysitter', 'outside') then raise exception 'Unknown kind of link'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 24 * 366 then raise exception 'Choose how long the link lasts'; end if;
  if not public.members_in_family(fid, coalesce(p_people, '{}')) then raise exception 'Those people are not in this family'; end if;
  if (select count(*) from public.cal_shares where family_id = fid and revoked_at is null and expires_at > now()) >= 20 then
    raise exception 'Too many open links. Stop some first';
  end if;
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.cal_shares (family_id, name, kind, people, show_notes, token_hash, expires_at, created_by_member)
    values (fid, trim(p_name), p_kind, coalesce(p_people, '{}'), coalesce(p_show_notes, true),
            encode(extensions.digest(tok, 'sha256'), 'hex'), now() + make_interval(hours => p_hours), public.my_member_id());
  perform public.log_event(fid, 'calendar_shared', jsonb_build_object('kind', p_kind));
  return tok;
end $$;

-- what a share link shows (no sign-in): only events everyone in the family can see, never private ones.
-- Repeating events come back as their series; the page works out the dates.
create or replace function public.shared_calendar(p_token text, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.cal_shares%rowtype; f public.families%rowtype; res jsonb;
begin
  select * into s from public.cal_shares
    where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and revoked_at is null and expires_at > now();
  if not found then return null; end if;
  if p_to < p_from or p_to - p_from > interval '62 days' then raise exception 'Choose a shorter time'; end if;
  update public.cal_shares set last_used_at = now() where id = s.id;
  select * into f from public.families where id = s.family_id;
  -- the family must still exist and the parent who made the link must still be a parent in it
  if f.archived_at is not null or not exists (select 1 from public.family_members where id = s.created_by_member
       and family_id = f.id and role = 'parent' and archived_at is null) then
    return null;
  end if;
  select jsonb_build_object(
    'family', f.name,
    'timezone', f.timezone,
    'kind', s.kind,
    'name', s.name,
    'expires_at', s.expires_at,
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name, 'colour', m.colour) order by m.created_at)
       from public.family_members m where m.family_id = f.id and m.archived_at is null
         and (cardinality(s.people) = 0 or m.id = any(s.people))), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'type', e.type, 'all_day', e.all_day,
         'starts_at', e.starts_at, 'ends_at', e.ends_at, 'rrule', e.rrule, 'exdates', e.exdates,
         'recurrence_of', e.recurrence_of, 'recurrence_date', e.recurrence_date,
         'people', e.people, 'location', coalesce(e.location, pl.name), 'driver', e.driver))
       from public.cal_events e left join public.cal_places pl on pl.id = e.place_id
       where e.family_id = f.id and e.deleted_at is null and e.visibility = 'all' and e.type <> 'reminder'
         and e.starts_at < p_to and (e.rrule is not null or e.ends_at >= p_from)
         and (cardinality(s.people) = 0 or cardinality(e.people) = 0 or e.people && s.people)
         and (e.recurrence_of is null or exists (select 1 from public.cal_events sr
              where sr.id = e.recurrence_of and sr.visibility = 'all' and sr.deleted_at is null))), '[]'::jsonb),
    'birthdays', case when s.kind <> 'babysitter' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('name', m.display_name, 'birthday', to_char(m.birthday, 'MM-DD')))
       from public.family_members m where m.family_id = f.id and m.archived_at is null and m.birthday is not null
         and (cardinality(s.people) = 0 or m.id = any(s.people))), '[]'::jsonb) end,
    'notes', case when s.show_notes then coalesce((select jsonb_agg(jsonb_build_object('day', n.day, 'body', n.body))
       from public.cal_day_notes n where n.family_id = f.id and n.day between (p_from::date - 1) and p_to::date), '[]'::jsonb) else '[]'::jsonb end,
    'routines', case when s.kind = 'babysitter' then coalesce((select jsonb_agg(jsonb_build_object('name', r.name, 'member', r.member_id,
         'start_time', r.start_time, 'days', r.days,
         'steps', (select coalesce(jsonb_agg(st.title order by st.position), '[]'::jsonb) from public.routine_steps st where st.routine_id = r.id)))
       from public.routines r where r.family_id = f.id and r.active
         and (cardinality(s.people) = 0 or r.member_id = any(s.people))), '[]'::jsonb) else '[]'::jsonb end
  ) into res;
  return res;
end $$;

revoke all on function public.check_family_timezone(), public.family_today(uuid), public.after_feed_change(),
  public.guard_share_change() from public, anon, authenticated;
revoke all on function public.can_see_event(uuid), public.member_sees_event(public.cal_events, uuid),
  public.guard_event_change(), public.after_event_change(), public.notify(uuid, text, text, text, text, text, interval),
  public.stamp_family_row(), public.guard_chore_done(), public.can_do_routine(uuid), public.guard_routine_activity(),
  public.guard_wish_claim(), public.after_wish_change(), public.owns_wish_list(uuid), public.can_edit_wish_list(uuid),
  public.save_push_subscription(text, text, text, text), public.create_share(text, text, uuid[], boolean, integer),
  public.shared_calendar(text, timestamptz, timestamptz)
  from public, anon, authenticated;

grant execute on function public.can_see_event(uuid), public.can_do_routine(uuid), public.owns_wish_list(uuid),
  public.can_edit_wish_list(uuid), public.save_push_subscription(text, text, text, text),
  public.create_share(text, text, uuid[], boolean, integer) to authenticated;
grant execute on function public.shared_calendar(text, timestamptz, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------- files (private bucket)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-files', 'family-files', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- <family>/events/<event>/<file>: read and add = anyone who can see the event
-- <family>/routines/<file>: read = family, add = parents
create or replace function public.family_file_ok(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_name, '/'); fid uuid; eid uuid;
  uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if parts[1] is null or parts[1] !~ uuid_re then return false; end if;
  fid := parts[1]::uuid;
  if not public.is_family_member(fid) then return false; end if;
  if parts[2] = 'events' and array_length(parts, 1) = 4 and parts[3] ~ uuid_re and parts[4] <> '' then
    eid := parts[3]::uuid;
    return exists (select 1 from public.cal_events where id = eid and family_id = fid) and public.can_see_event(eid);
  elsif parts[2] = 'routines' and array_length(parts, 1) = 3 and parts[3] <> '' then
    return (not p_write) or public.is_family_parent(fid);
  end if;
  return false;
end $$;
-- remove: the person who added the file, or a parent of that family
create or replace function public.family_file_can_remove(p_name text, p_owner uuid, p_owner_id text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare first text := split_part(p_name, '/', 1);
begin
  if not public.family_file_ok(p_name, true) then return false; end if;
  return p_owner = (select auth.uid()) or p_owner_id = (select auth.uid())::text or public.is_family_parent(first::uuid);
end $$;
revoke all on function public.family_file_ok(text, boolean), public.family_file_can_remove(text, uuid, text) from public, anon;
grant execute on function public.family_file_ok(text, boolean), public.family_file_can_remove(text, uuid, text) to authenticated;

create policy family_files_read on storage.objects for select to authenticated
  using (bucket_id = 'family-files' and public.family_file_ok(name, false));
create policy family_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'family-files' and public.family_file_ok(name, true));
create policy family_files_remove on storage.objects for delete to authenticated
  using (bucket_id = 'family-files' and public.family_file_can_remove(name, owner, owner_id));

-- ---------------------------------------------------------------- live updates

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.cal_events, public.cal_comments, public.cal_day_notes,
      public.chore_done, public.routine_ticks, public.routine_runs, public.wish_items;
    -- not wish_claims: delete messages skip row security and would tell a list's owner an item had been claimed
  end if;
end $$;
