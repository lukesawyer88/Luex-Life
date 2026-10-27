-- Family Board, part 4 of 5 (actions, files, live updates). See part 1 for the rules.

-- ---------------------------------------------------------------- starting chats

create or replace function public.board_family_thread()
returns uuid language plpgsql security definer set search_path = '' as $$
declare fid uuid := public.my_family_id(); tid uuid;
begin
  if fid is null then raise exception 'That change is not allowed'; end if;
  select id into tid from public.board_threads where family_id = fid and kind = 'family';
  if tid is null then
    insert into public.board_threads (family_id, kind) values (fid, 'family')
      on conflict (family_id) where kind = 'family' do nothing returning id into tid;
    if tid is null then select id into tid from public.board_threads where family_id = fid and kind = 'family'; end if;
  end if;
  return tid;
end $$;

create or replace function public.board_open_direct(p_other uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); fid uuid := public.my_family_id(); k text; tid uuid; other_login uuid;
begin
  if me is null or p_other is null or p_other = me then raise exception 'That change is not allowed'; end if;
  select user_id into other_login from public.family_members where id = p_other and family_id = fid and archived_at is null;
  if not found then raise exception 'That person is not in this family'; end if;
  if other_login is null then raise exception 'They need their own login to chat'; end if;
  if not public.board_allowed(me, 'private_chats') or not public.board_allowed(me, 'chat') then
    raise exception 'A parent has switched private chats off for you';
  end if;
  k := least(me::text, p_other::text) || ':' || greatest(me::text, p_other::text);
  select id into tid from public.board_threads where family_id = fid and kind = 'direct' and direct_key = k;
  if tid is null then
    insert into public.board_threads (family_id, kind, direct_key, created_by) values (fid, 'direct', k, me)
      on conflict (family_id, direct_key) where kind = 'direct' do nothing returning id into tid;
    if tid is null then
      select id into tid from public.board_threads where family_id = fid and kind = 'direct' and direct_key = k;
    else
      insert into public.board_thread_people (thread_id, member_id, family_id) values (tid, me, fid), (tid, p_other, fid);
    end if;
  end if;
  return tid;
end $$;

create or replace function public.board_create_group(p_title text, p_emoji text, p_people uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); fid uuid := public.my_family_id(); tid uuid; ppl uuid[];
begin
  if me is null then raise exception 'That change is not allowed'; end if;
  if not public.board_allowed(me, 'private_chats') or not public.board_allowed(me, 'chat') then
    raise exception 'A parent has switched private chats off for you';
  end if;
  ppl := array(select distinct x from unnest(coalesce(p_people, '{}') || me) x where x is not null);
  if cardinality(ppl) < 2 or cardinality(ppl) > 30 then raise exception 'Pick at least one other person'; end if;
  if exists (select 1 from unnest(ppl) x where not exists (
      select 1 from public.family_members m where m.id = x and m.family_id = fid and m.archived_at is null and m.user_id is not null)) then
    raise exception 'Those people are not in this family';
  end if;
  insert into public.board_threads (family_id, kind, title, emoji, created_by)
    values (fid, 'group', btrim(p_title), nullif(p_emoji, ''), me) returning id into tid;
  insert into public.board_thread_people (thread_id, member_id, family_id) select tid, x, fid from unnest(ppl) x;
  return tid;
end $$;

-- removing someone from a group (kept in its own function: see docs/todo.md, notes for builders)
create or replace function public.board_remove_person(p_thread uuid, p_member uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.board_thread_people where thread_id = p_thread and member_id = p_member
$$;
revoke all on function public.board_remove_person(uuid, uuid) from public, anon, authenticated;

-- the starter or a parent changes who is in a group
create or replace function public.board_set_group_people(p_thread uuid, p_people uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); th public.board_threads%rowtype; ppl uuid[]; x uuid;
begin
  select * into th from public.board_threads where id = p_thread and kind = 'group' and archived_at is null;
  if not found or not public.is_family_member(th.family_id)
     or not (th.created_by = me or (public.is_family_parent(th.family_id) and public.board_can_see_thread(p_thread))) then
    raise exception 'That change is not allowed';
  end if;
  ppl := array(select distinct y from unnest(coalesce(p_people, '{}')) y where y is not null);
  if cardinality(ppl) < 2 or cardinality(ppl) > 30 then raise exception 'A group needs at least two people'; end if;
  if exists (select 1 from unnest(ppl) y where not exists (
      select 1 from public.family_members m where m.id = y and m.family_id = th.family_id and m.archived_at is null and m.user_id is not null)) then
    raise exception 'Those people are not in this family';
  end if;
  for x in select member_id from public.board_thread_people where thread_id = p_thread and not (member_id = any(ppl)) loop
    perform public.board_remove_person(p_thread, x);
  end loop;
  insert into public.board_thread_people (thread_id, member_id, family_id)
    select p_thread, y, th.family_id from unnest(ppl) y on conflict (thread_id, member_id) do nothing;
end $$;

create or replace function public.board_leave_group(p_thread uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id();
begin
  if not exists (select 1 from public.board_threads where id = p_thread and kind = 'group')
     or not exists (select 1 from public.board_thread_people where thread_id = p_thread and member_id = me) then
    raise exception 'That change is not allowed';
  end if;
  perform public.board_remove_person(p_thread, me);
end $$;

-- ---------------------------------------------------------------- reading, muting, unread counts

create or replace function public.board_mark_read(p_thread uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); fid uuid;
begin
  if not public.board_member_sees_thread(p_thread, me) then return; end if;
  select family_id into fid from public.board_threads where id = p_thread;
  insert into public.board_thread_state (thread_id, member_id, family_id, last_read_at) values (p_thread, me, fid, now())
    on conflict (thread_id, member_id) do update set last_read_at = greatest(public.board_thread_state.last_read_at, now());
  -- waiting chat alerts for this chat are no longer needed
  update public.notifications set read_at = now() where member_id = me and read_at is null
    and (group_key = 'msg:' || p_thread or link like '/m/board?thread=' || p_thread || '%');
end $$;

create or replace function public.board_set_mute(p_thread uuid, p_muted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); fid uuid;
begin
  if not public.board_member_sees_thread(p_thread, me) then raise exception 'That change is not allowed'; end if;
  select family_id into fid from public.board_threads where id = p_thread;
  insert into public.board_thread_state (thread_id, member_id, family_id, last_read_at, muted)
    values (p_thread, me, fid, now() - interval '100 years', coalesce(p_muted, false))
    on conflict (thread_id, member_id) do update set muted = coalesce(p_muted, false);
end $$;

-- the chats I'm in, with how many messages I haven't read
create or replace function public.board_unread()
returns table (thread_id uuid, unread integer, last_message_at timestamptz, muted boolean)
language sql stable security definer set search_path = '' as $$
  select t.id,
    (select count(*)::integer from public.board_messages m
      where m.thread_id = t.id and m.deleted_at is null and m.author is distinct from public.my_member_id()
        and m.created_at > coalesce(st.last_read_at, '-infinity'::timestamptz)),
    t.last_message_at, coalesce(st.muted, false)
  from public.board_threads t
    left join public.board_thread_state st on st.thread_id = t.id and st.member_id = public.my_member_id()
  where t.family_id = public.my_family_id() and public.board_member_sees_thread(t.id, public.my_member_id())
$$;

-- ---------------------------------------------------------------- polls and shared places

create or replace function public.board_create_poll(p_thread uuid, p_question text, p_kind text, p_multi boolean,
  p_options jsonb, p_client_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare fid uuid; mid uuid; o jsonb; i integer := 0;
begin
  select family_id into fid from public.board_threads where id = p_thread;
  if fid is null or not public.board_can_post(p_thread) then raise exception 'That change is not allowed'; end if;
  if p_kind not in ('choice', 'date') then raise exception 'That change is not allowed'; end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) not between 2 and 12 then
    raise exception 'A poll needs between 2 and 12 answers';
  end if;
  perform set_config('luex.boardsys', 'on', true);
  insert into public.board_messages (family_id, thread_id, kind, body, client_id)
    values (fid, p_thread, 'poll', left(btrim(p_question), 200), p_client_id) returning id into mid;
  perform set_config('luex.boardsys', 'off', true);
  insert into public.board_polls (message_id, family_id, question, kind, multi)
    values (mid, fid, btrim(p_question), p_kind, coalesce(p_multi, false));
  for o in select value from jsonb_array_elements(p_options) loop
    insert into public.board_poll_options (message_id, family_id, label, on_date, position)
      values (mid, fid, btrim(o ->> 'label'), case when p_kind = 'date' then (o ->> 'on_date')::date end, i);
    if p_kind = 'date' and o ->> 'on_date' is null then raise exception 'Each answer needs a date'; end if;
    i := i + 1;
  end loop;
  return mid;
end $$;

-- "Share my location" (only when someone taps it): kept for one hour
create or replace function public.board_share_location(p_thread uuid, p_reply_to uuid, p_lat double precision,
  p_lng double precision, p_accuracy integer, p_client_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); fid uuid; mid uuid; asker uuid;
begin
  select family_id into fid from public.board_threads where id = p_thread;
  if fid is null or not public.board_can_post(p_thread) then raise exception 'That change is not allowed'; end if;
  if not public.board_allowed(me, 'location') then raise exception 'A parent has switched location sharing off for you'; end if;
  if p_reply_to is not null then
    select author into asker from public.board_messages where id = p_reply_to and thread_id = p_thread and deleted_at is null;
    if not found then raise exception 'That change is not allowed'; end if;
  end if;
  perform set_config('luex.boardsys', 'on', true);
  insert into public.board_messages (family_id, thread_id, kind, reply_to, mentions, client_id)
    values (fid, p_thread, 'location', p_reply_to, case when asker is null then '{}' else array[asker] end, p_client_id)
    returning id into mid;
  perform set_config('luex.boardsys', 'off', true);
  insert into public.board_locations (message_id, family_id, thread_id, lat, lng, accuracy)
    values (mid, fid, p_thread, p_lat, p_lng, least(greatest(coalesce(p_accuracy, 0), 0), 100000));
  return mid;
end $$;

-- ---------------------------------------------------------------- storage allowance

create or replace function public.board_allowance() returns bigint language sql immutable set search_path = '' as $$
  select 53687091200::bigint  -- 50 GB per family
$$;

create or replace function public.board_bytes_used(f uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint from storage.objects o
  where o.bucket_id = 'board-media' and o.name like f::text || '/%'
$$;

create or replace function public.board_storage()
returns table (used bigint, allowance bigint) language sql stable security definer set search_path = '' as $$
  select public.board_bytes_used(public.my_family_id()), public.board_allowance() where public.my_family_id() is not null
$$;

-- ---------------------------------------------------------------- read-only album links

create or replace function public.board_create_album_share(p_album uuid, p_label text, p_days integer)
returns text language plpgsql security definer set search_path = '' as $$
declare fid uuid; tok text;
begin
  select family_id into fid from public.board_albums where id = p_album and archived_at is null;
  if fid is null or not public.is_family_adult(fid) then raise exception 'That change is not allowed'; end if;
  if p_days not between 1 and 90 then raise exception 'Links last between 1 and 90 days'; end if;
  tok := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.board_album_shares (family_id, album_id, label, token_hash, expires_at, created_by)
    values (fid, p_album, left(btrim(p_label), 60), encode(extensions.digest(tok, 'sha256'), 'hex'),
      now() + make_interval(days => p_days), public.my_member_id());
  return tok;
end $$;

-- what a link shows (the album-share service signs the file addresses; it runs with the service key)
create or replace function public.shared_album(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.board_album_shares%rowtype; a public.board_albums%rowtype;
begin
  if p_token is null or char_length(p_token) > 100 then return null; end if;
  select * into s from public.board_album_shares
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and revoked_at is null and expires_at > now();
  if not found then return null; end if;
  select * into a from public.board_albums where id = s.album_id and archived_at is null;
  if not found then return null; end if;
  update public.board_album_shares set last_used_at = now() where id = s.id;
  return jsonb_build_object('title', a.title, 'label', s.label, 'expires_at', s.expires_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object('path', m.path, 'kind', m.kind, 'mime', m.mime,
        'caption', m.caption, 'width', m.width, 'height', m.height) order by coalesce(m.taken_at, m.created_at) desc)
      from public.board_media m where m.album_id = a.id and m.deleted_at is null and m.kind in ('photo', 'video', 'drawing')
        and m.thread_id is null and m.memory_id is null), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- search

-- runs as the person searching, so row security decides what comes back
create or replace function public.board_search(p_q text)
returns table (kind text, id uuid, ref uuid, title text, snippet text, at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with q as (select '%' || replace(replace(replace(left(btrim(p_q), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat)
  select * from (
    (select 'message'::text, m.id, m.thread_id, ''::text, left(m.body, 200), m.created_at
      from public.board_messages m, q where m.deleted_at is null and m.body ilike q.pat order by m.created_at desc limit 30)
    union all
    (select 'list_item', i.id, i.list_id, l.title, i.text, i.created_at
      from public.board_list_items i join public.board_lists l on l.id = i.list_id, q
      where l.archived_at is null and (i.text ilike q.pat or l.title ilike q.pat) limit 30)
    union all
    (select 'note', n.id, null::uuid, '', left(n.body, 200), n.updated_at
      from public.board_notes n, q where n.deleted_at is null and n.body ilike q.pat limit 30)
    union all
    (select 'memory', x.id, null::uuid, x.title, left(x.body, 200), x.happened_on::timestamptz
      from public.board_memories x, q where x.deleted_at is null and (x.title ilike q.pat or x.body ilike q.pat) limit 30)
    union all
    (select 'goal', g.id, null::uuid, g.title, coalesce(g.unit, ''), g.created_at
      from public.board_goals g, q where g.archived_at is null and g.title ilike q.pat limit 30)
  ) r where char_length(btrim(p_q)) >= 2
$$;

-- ---------------------------------------------------------------- journal questions (run by the schedule)

create or replace function public.queue_journal_prompts()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; p record; n integer := 0; lt timestamp;
begin
  for r in
    select s.member_id, s.journal_time, s.family_id, coalesce(f.timezone, 'Europe/London') as tz
    from public.board_settings s
      join public.family_members m on m.id = s.member_id and m.role = 'child' and m.archived_at is null and m.user_id is not null
      join public.families f on f.id = s.family_id
    where s.journal_prompts
  loop
    lt := now() at time zone r.tz;
    if lt::time < r.journal_time or lt::time > r.journal_time + interval '3 hours' then continue; end if;
    if exists (select 1 from public.board_prompt_sends where member_id = r.member_id and day = lt::date) then continue; end if;
    -- a question they haven't had for the longest time
    select q.id, q.text into p from public.board_prompts q
      where q.archived_at is null and (q.family_id is null or q.family_id = r.family_id)
      order by (select max(day) from public.board_prompt_sends x where x.member_id = r.member_id and x.prompt_id = q.id) nulls first,
        (q.family_id is null), random()
      limit 1;
    if p.id is null then continue; end if;
    insert into public.board_prompt_sends (member_id, day, prompt_id) values (r.member_id, lt::date, p.id) on conflict do nothing;
    if found then
      perform public.board_notify(r.member_id, 'prompt', 'Today''s question', p.text, '/m/board?tab=journal&prompt=' || p.id, null);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- today's question for me (children see it at the top of their journal)
create or replace function public.board_todays_prompt()
returns table (prompt_id uuid, text text) language sql stable security definer set search_path = '' as $$
  select q.id, q.text from public.board_prompt_sends s join public.board_prompts q on q.id = s.prompt_id
  where s.member_id = public.my_member_id()
  order by s.day desc limit 1
$$;

-- ---------------------------------------------------------------- tidying (run by the schedule)

create or replace function public.board_tidy_places()
returns void language sql security definer set search_path = '' as $$
  delete from public.board_locations where expires_at < now()
$$;
-- removed messages keep their words for a day (for undo), then lose them
create or replace function public.board_tidy_removed()
returns void language sql security definer set search_path = '' as $$
  update public.board_messages set body = '', mentions = '{}' where deleted_at < now() - interval '1 day' and body <> ''
$$;
create or replace function public.board_tidy_sends()
returns void language sql security definer set search_path = '' as $$
  delete from public.board_prompt_sends where day < current_date - 400
$$;

revoke all on function public.board_family_thread(), public.board_open_direct(uuid), public.board_create_group(text, text, uuid[]),
  public.board_set_group_people(uuid, uuid[]), public.board_leave_group(uuid), public.board_mark_read(uuid),
  public.board_set_mute(uuid, boolean), public.board_unread(),
  public.board_create_poll(uuid, text, text, boolean, jsonb, text),
  public.board_share_location(uuid, uuid, double precision, double precision, integer, text),
  public.board_storage(), public.board_create_album_share(uuid, text, integer), public.board_search(text),
  public.board_todays_prompt()
  from public, anon;
grant execute on function public.board_family_thread(), public.board_open_direct(uuid), public.board_create_group(text, text, uuid[]),
  public.board_set_group_people(uuid, uuid[]), public.board_leave_group(uuid), public.board_mark_read(uuid),
  public.board_set_mute(uuid, boolean), public.board_unread(),
  public.board_create_poll(uuid, text, text, boolean, jsonb, text),
  public.board_share_location(uuid, uuid, double precision, double precision, integer, text),
  public.board_storage(), public.board_create_album_share(uuid, text, integer), public.board_search(text),
  public.board_todays_prompt()
  to authenticated;
revoke all on function public.board_allowance(), public.board_bytes_used(uuid), public.shared_album(text),
  public.queue_journal_prompts(), public.board_tidy_places(), public.board_tidy_removed(), public.board_tidy_sends()
  from public, anon, authenticated;
grant execute on function public.shared_album(text) to service_role;

-- ---------------------------------------------------------------- files (private bucket)

-- 50 MB is the most a single upload can be on Supabase's free plan; videos are also capped at 3 minutes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('board-media', 'board-media', false, 52428800, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac'])
on conflict (id) do nothing;

-- <family>/board/t/<chat>/<file>   chat photos, videos and voice notes: people who can see the chat
-- <family>/board/m/<memory>/<file> memory photos: people who can see the memory
-- <family>/board/a/<file>          album photos and drawings: the family
create or replace function public.board_file_ok(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_name, '/'); fid uuid; x uuid; me uuid := public.my_member_id();
  uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; mem public.board_memories%rowtype;
begin
  if parts[1] is null or parts[1] !~ uuid_re or parts[2] is distinct from 'board' then return false; end if;
  fid := parts[1]::uuid;
  if not public.is_family_member(fid) then return false; end if;
  if p_write and public.board_bytes_used(fid) >= public.board_allowance() then return false; end if;
  if parts[3] = 't' and array_length(parts, 1) = 5 and parts[4] ~ uuid_re and parts[5] <> '' then
    x := parts[4]::uuid;
    if not exists (select 1 from public.board_threads where id = x and family_id = fid) then return false; end if;
    return case when p_write then public.board_member_sees_thread(x, me) else public.board_can_see_thread(x) end;
  elsif parts[3] = 'm' and array_length(parts, 1) = 5 and parts[4] ~ uuid_re and parts[5] <> '' then
    select * into mem from public.board_memories where id = parts[4]::uuid and family_id = fid;
    if not found then return false; end if;
    return public.board_member_sees_memory(mem, me)
      and (not p_write or mem.author = me or public.is_family_parent(fid));
  elsif parts[3] = 'a' and array_length(parts, 1) = 4 and parts[4] <> '' then
    return true;
  end if;
  return false;
end $$;
create or replace function public.board_file_can_remove(p_name text, p_owner uuid, p_owner_id text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.board_file_ok(p_name, false) then return false; end if;
  return p_owner = (select auth.uid()) or p_owner_id = (select auth.uid())::text
    or public.is_family_parent(split_part(p_name, '/', 1)::uuid);
end $$;
revoke all on function public.board_file_ok(text, boolean), public.board_file_can_remove(text, uuid, text) from public, anon;
grant execute on function public.board_file_ok(text, boolean), public.board_file_can_remove(text, uuid, text) to authenticated;

create policy board_media_files_read on storage.objects for select to authenticated
  using (bucket_id = 'board-media' and public.board_file_ok(name, false));
create policy board_media_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'board-media' and public.board_file_ok(name, true));
create policy board_media_files_remove on storage.objects for delete to authenticated
  using (bucket_id = 'board-media' and public.board_file_can_remove(name, owner, owner_id));

-- ---------------------------------------------------------------- live updates
-- every published table has a plain uuid key (delete messages skip row security and carry only the key)

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.board_messages, public.board_threads, public.board_thread_state,
      public.board_lists, public.board_list_items, public.board_notes, public.board_goals, public.board_goal_steps,
      public.board_media, public.board_memories;
  end if;
end $$;
