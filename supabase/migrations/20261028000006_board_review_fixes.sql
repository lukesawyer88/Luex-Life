-- Family Board: fixes from the independent security review (27 Oct 2026). See part 1 for the rules.

-- ---------------------------------------------------------------- 1. a grown-up can never be turned into a child
-- (a child's chats and journal can be opened to parents; turning an adult into a "child" would open theirs)
create or replace function public.guard_board_role_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'child' and old.role <> 'child' and old.user_id is not null then
    raise exception 'A grown-up with a login can''t be changed to a child';
  end if;
  return new;
end $$;
revoke all on function public.guard_board_role_change() from public, anon, authenticated;
create trigger family_members_board_role before update of role on public.family_members
  for each row execute function public.guard_board_role_change();

-- journal openness is fixed on each entry when it is written (re-opening a journal doesn't reveal entries
-- written while it was closed)
alter table public.board_memories add column parents_may_see boolean not null default false;

create or replace function public.board_member_sees_memory(mem public.board_memories, m uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare me public.family_members%rowtype;
begin
  select * into me from public.family_members where id = m and family_id = mem.family_id and archived_at is null;
  if not found then return false; end if;
  if mem.audience = 'family' or mem.author = m then return true; end if;
  return me.role = 'parent' and mem.parents_may_see;
end $$;

-- ---------------------------------------------------------------- 4. reading parents see a chat only from when the child joined it

-- the time from which parent m may read chat t (null = not at all)
create or replace function public.board_observe_since(t uuid, m uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select min(p.added_at) from public.board_threads th
    join public.family_members me on me.id = m and me.family_id = th.family_id and me.role = 'parent' and me.archived_at is null
    join public.board_thread_people p on p.thread_id = th.id
    join public.family_members c on c.id = p.member_id and c.role = 'child' and c.archived_at is null
    join public.board_settings s on s.member_id = c.id and s.parents_can_read
  where th.id = t and th.archived_at is null and th.kind <> 'family'
$$;
revoke all on function public.board_observe_since(uuid, uuid) from public, anon, authenticated;

-- can I see this message (participants: all of it; reading parents: from when the child joined)
create or replace function public.board_sees_message(msg public.board_messages)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.board_member_sees_thread(msg.thread_id, public.my_member_id())
    or msg.created_at >= public.board_observe_since(msg.thread_id, public.my_member_id())
$$;
create or replace function public.board_can_see_message(msg uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public.board_sees_message(x) from public.board_messages x where id = msg), false)
$$;
create or replace function public.board_can_see_media(md public.board_media)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when md.memory_id is not null then public.board_can_see_memory(md.memory_id)
    when md.thread_id is not null then public.board_member_sees_thread(md.thread_id, public.my_member_id())
      or md.created_at >= public.board_observe_since(md.thread_id, public.my_member_id())
    else public.is_family_member(md.family_id) end
$$;
revoke all on function public.board_sees_message(public.board_messages) from public, anon;
grant execute on function public.board_sees_message(public.board_messages) to authenticated;

-- ---------------------------------------------------------------- 3. every read starts with "my family" (fast, and no scanning other families)

drop policy board_threads_read on public.board_threads;
create policy board_threads_read on public.board_threads for select to authenticated
  using (family_id = (select public.my_family_id()) and public.board_can_see_thread(id));
drop policy board_threads_change on public.board_threads;
create policy board_threads_change on public.board_threads for update to authenticated
  using (family_id = (select public.my_family_id()) and public.board_can_post(id))
  with check (family_id = (select public.my_family_id()) and public.board_can_post(id));
drop policy board_thread_people_read on public.board_thread_people;
create policy board_thread_people_read on public.board_thread_people for select to authenticated
  using (family_id = (select public.my_family_id()) and public.board_can_see_thread(thread_id));
drop policy board_thread_state_read on public.board_thread_state;
create policy board_thread_state_read on public.board_thread_state for select to authenticated
  using (family_id = (select public.my_family_id()) and public.board_can_see_thread(thread_id));

drop policy board_messages_read on public.board_messages;
create policy board_messages_read on public.board_messages for select to authenticated
  using (family_id = (select public.my_family_id()) and public.board_sees_message(board_messages));
drop policy board_messages_add on public.board_messages;
create policy board_messages_add on public.board_messages for insert to authenticated
  with check (family_id = (select public.my_family_id()) and public.board_can_post(thread_id));
drop policy board_messages_change on public.board_messages;
create policy board_messages_change on public.board_messages for update to authenticated
  using (family_id = (select public.my_family_id()) and public.board_sees_message(board_messages))
  with check (family_id = (select public.my_family_id()) and public.board_sees_message(board_messages));

drop policy board_reactions_read on public.board_reactions;
create policy board_reactions_read on public.board_reactions for select to authenticated
  using (family_id = (select public.my_family_id()) and public.board_can_see_message(message_id));
drop policy board_acks_read on public.board_acks;
create policy board_acks_read on public.board_acks for select to authenticated
  using (family_id = (select public.my_family_id()) and public.board_can_see_message(message_id));
drop policy board_polls_read on public.board_polls;
create policy board_polls_read on public.board_polls for select to authenticated
  using (family_id = (select public.my_family_id()) and public.board_can_see_message(message_id));
drop policy board_polls_change on public.board_polls;
create policy board_polls_change on public.board_polls for update to authenticated
  using (family_id = (select public.my_family_id()) and public.board_can_post_message(message_id))
  with check (family_id = (select public.my_family_id()) and public.board_can_post_message(message_id));
drop policy board_poll_options_read on public.board_poll_options;
create policy board_poll_options_read on public.board_poll_options for select to authenticated
  using (family_id = (select public.my_family_id()) and public.board_can_see_message(message_id));
drop policy board_poll_votes_read on public.board_poll_votes;
create policy board_poll_votes_read on public.board_poll_votes for select to authenticated
  using (family_id = (select public.my_family_id()) and public.board_can_see_message(message_id));

-- 5. a removed message's place disappears with it
drop policy board_locations_read on public.board_locations;
create policy board_locations_read on public.board_locations for select to authenticated
  using (family_id = (select public.my_family_id()) and expires_at > now() and public.board_can_see_message(message_id)
    and exists (select 1 from public.board_messages m where m.id = message_id and m.deleted_at is null));

drop policy board_media_read on public.board_media;
create policy board_media_read on public.board_media for select to authenticated
  using (family_id = (select public.my_family_id()) and public.board_can_see_media(board_media));
drop policy board_media_change on public.board_media;
create policy board_media_change on public.board_media for update to authenticated
  using (family_id = (select public.my_family_id()) and public.board_can_see_media(board_media)
    and (owner = (select public.my_member_id()) or public.is_family_parent(family_id)))
  with check (family_id = (select public.my_family_id()) and public.board_can_see_media(board_media)
    and (owner = (select public.my_member_id()) or public.is_family_parent(family_id)));

drop policy board_memories_read on public.board_memories;
create policy board_memories_read on public.board_memories for select to authenticated
  using (family_id = (select public.my_family_id()) and public.board_sees_memory(board_memories));
drop policy board_memories_change on public.board_memories;
create policy board_memories_change on public.board_memories for update to authenticated
  using (family_id = (select public.my_family_id()) and (author = (select public.my_member_id())
    or (public.is_family_parent(family_id) and public.board_sees_memory(board_memories))))
  with check (family_id = (select public.my_family_id()) and (author = (select public.my_member_id())
    or (public.is_family_parent(family_id) and public.board_sees_memory(board_memories))));

-- search: only my family, in every part
create or replace function public.board_search(p_q text)
returns table (kind text, id uuid, ref uuid, title text, snippet text, at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with q as (select '%' || replace(replace(replace(left(btrim(p_q), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
                    public.my_family_id() as fid)
  select * from (
    (select 'message'::text, m.id, m.thread_id, ''::text, left(m.body, 200), m.created_at
      from public.board_messages m, q where m.family_id = q.fid and m.deleted_at is null and m.body ilike q.pat
      order by m.created_at desc limit 30)
    union all
    (select 'list_item', i.id, i.list_id, l.title, i.text, i.created_at
      from public.board_list_items i join public.board_lists l on l.id = i.list_id, q
      where i.family_id = q.fid and l.archived_at is null and (i.text ilike q.pat or l.title ilike q.pat) limit 30)
    union all
    (select 'note', n.id, null::uuid, '', left(n.body, 200), n.updated_at
      from public.board_notes n, q where n.family_id = q.fid and n.deleted_at is null and n.body ilike q.pat limit 30)
    union all
    (select 'memory', x.id, null::uuid, x.title, left(x.body, 200), x.happened_on::timestamptz
      from public.board_memories x, q where x.family_id = q.fid and x.deleted_at is null and (x.title ilike q.pat or x.body ilike q.pat) limit 30)
    union all
    (select 'goal', g.id, null::uuid, g.title, coalesce(g.unit, ''), g.created_at
      from public.board_goals g, q where g.family_id = q.fid and g.archived_at is null and g.title ilike q.pat limit 30)
  ) r where char_length(btrim(p_q)) >= 2
$$;

-- ---------------------------------------------------------------- 2 and 8. only people in a group change it

create or replace function public.board_set_group_people(p_thread uuid, p_people uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); th public.board_threads%rowtype; ppl uuid[]; x uuid;
begin
  select * into th from public.board_threads where id = p_thread and kind = 'group' and archived_at is null;
  if not found or not public.board_member_sees_thread(p_thread, me)
     or not (th.created_by = me or public.is_family_parent(th.family_id)) then
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
  perform public.board_clear_alerts(p_thread);
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
  perform public.board_clear_alerts(p_thread);
end $$;

create or replace function public.guard_board_thread()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id();
begin
  if (select auth.uid()) is null or public.board_sys() then return new; end if;
  if new.kind <> old.kind or new.family_id <> old.family_id or new.direct_key is distinct from old.direct_key
     or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    raise exception 'That change is not allowed';
  end if;
  if old.kind <> 'group' then raise exception 'Only group chats can be renamed or closed'; end if;
  if not public.board_member_sees_thread(old.id, me) or not (old.created_by = me or public.is_family_parent(old.family_id)) then
    raise exception 'That change is not allowed';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 7. waiting alerts never outlive what they show

-- unsent chat alerts for people who can no longer see the chat
create or replace function public.board_clear_alerts(p_thread uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.notifications n
  where n.pushed_at is null and (n.group_key = 'msg:' || p_thread or n.link like '/m/board?thread=' || p_thread || '%')
    and not public.board_member_sees_thread(p_thread, n.member_id)
$$;
-- unsent alerts about one message (it was removed or changed)
create or replace function public.board_clear_message_alerts(p_thread uuid, p_message uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.notifications n
  where n.pushed_at is null and (n.link = '/m/board?thread=' || p_thread || '&message=' || p_message or n.group_key = 'msg:' || p_thread)
$$;
create or replace function public.board_forget_place(p_message uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.board_locations where message_id = p_message
$$;
revoke all on function public.board_clear_alerts(uuid), public.board_clear_message_alerts(uuid, uuid), public.board_forget_place(uuid)
  from public, anon, authenticated;

create or replace function public.after_board_message_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.deleted_at is not null and old.deleted_at is null) or new.body is distinct from old.body then
    perform public.board_clear_message_alerts(new.thread_id, new.id);
  end if;
  if new.deleted_at is not null and old.deleted_at is null and new.kind = 'location' then
    perform public.board_forget_place(new.id);
  end if;
  return null;
end $$;
revoke all on function public.after_board_message_change() from public, anon, authenticated;
create trigger board_messages_after_change after update of deleted_at, body on public.board_messages
  for each row execute function public.after_board_message_change();

-- a child's switches changing: clear alerts for chats they can no longer see
create or replace function public.after_board_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t uuid;
begin
  if new.chat is distinct from old.chat or new.private_chats is distinct from old.private_chats then
    for t in select id from public.board_threads where family_id = new.family_id loop
      perform public.board_clear_alerts(t);
    end loop;
  end if;
  return null;
end $$;
revoke all on function public.after_board_settings() from public, anon, authenticated;
create trigger board_settings_after after update on public.board_settings
  for each row execute function public.after_board_settings();

-- ---------------------------------------------------------------- 9. no taking a vote back after a poll closes

create or replace function public.guard_board_vote_remove()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and exists (select 1 from public.board_polls where message_id = old.message_id and closed_at is not null) then
    raise exception 'This poll has closed';
  end if;
  return old;
end $$;
revoke all on function public.guard_board_vote_remove() from public, anon, authenticated;
create trigger board_poll_votes_remove_guard before delete on public.board_poll_votes
  for each row execute function public.guard_board_vote_remove();

-- ---------------------------------------------------------------- 10. children's switches also apply to the files themselves

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
    if p_write then
      return public.board_member_sees_thread(x, me) and (public.board_allowed(me, 'photos') or public.board_allowed(me, 'voice'));
    end if;
    return public.board_can_see_thread(x);
  elsif parts[3] = 'm' and array_length(parts, 1) = 5 and parts[4] ~ uuid_re and parts[5] <> '' then
    select * into mem from public.board_memories where id = parts[4]::uuid and family_id = fid;
    if not found then return false; end if;
    return public.board_member_sees_memory(mem, me)
      and (not p_write or ((mem.author = me or public.is_family_parent(fid)) and public.board_allowed(me, 'photos')));
  elsif parts[3] = 'a' and array_length(parts, 1) = 4 and parts[4] <> '' then
    return not p_write or public.board_allowed(me, 'photos');
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------- 11. journal questions after 9pm

create or replace function public.queue_journal_prompts()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; p record; n integer := 0; lt timestamp; due timestamp;
begin
  for r in
    select s.member_id, s.journal_time, s.family_id, coalesce(f.timezone, 'Europe/London') as tz
    from public.board_settings s
      join public.family_members m on m.id = s.member_id and m.role = 'child' and m.archived_at is null and m.user_id is not null
      join public.families f on f.id = s.family_id
    where s.journal_prompts
  loop
    lt := now() at time zone r.tz;
    -- today's time, or yesterday's if it was late last night
    due := lt::date + r.journal_time;
    if due > lt then due := due - interval '1 day'; end if;
    if lt > due + interval '3 hours' then continue; end if;
    if exists (select 1 from public.board_prompt_sends where member_id = r.member_id and day = due::date) then continue; end if;
    select q.id, q.text into p from public.board_prompts q
      where q.archived_at is null and (q.family_id is null or q.family_id = r.family_id)
      order by (select max(day) from public.board_prompt_sends x where x.member_id = r.member_id and x.prompt_id = q.id) nulls first,
        (q.family_id is null), random()
      limit 1;
    if p.id is null then continue; end if;
    insert into public.board_prompt_sends (member_id, day, prompt_id) values (r.member_id, due::date, p.id) on conflict do nothing;
    if found then
      perform public.board_notify(r.member_id, 'prompt', 'Today''s question', p.text, '/m/board?tab=journal&prompt=' || p.id, null);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- lower-confidence items, also fixed

-- the default is worked out once, when someone joins (not "immutable": it depends on today's date)
create or replace function public.board_default_parents_read(p_role text, p_birthday date)
returns boolean language sql stable set search_path = '' as $$
  select p_role = 'child' and (p_birthday is null or p_birthday > (current_date - interval '13 years')::date)
$$;

-- parents set children's switches and their own; never another grown-up's
create or replace function public.guard_board_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); my_role text; their_role text;
begin
  if (select auth.uid()) is null then new.updated_at := now(); return new; end if;
  if new.member_id <> old.member_id or new.family_id <> old.family_id then raise exception 'That change is not allowed'; end if;
  select role into my_role from public.family_members where id = me and family_id = new.family_id;
  select role into their_role from public.family_members where id = new.member_id;
  if new.member_id <> me and not (my_role = 'parent' and their_role = 'child') then
    raise exception 'That change is not allowed';
  end if;
  if my_role is distinct from 'parent' then
    if new.chat <> old.chat or new.private_chats <> old.private_chats or new.photos <> old.photos or new.voice <> old.voice
       or new.location <> old.location or new.parents_can_read <> old.parents_can_read
       or new.journal_prompts <> old.journal_prompts or new.journal_time <> old.journal_time
       or new.journal_parents_see <> old.journal_parents_see then
      raise exception 'Only a parent can change that';
    end if;
    if their_role = 'child' and (new.quiet_from is distinct from old.quiet_from or new.quiet_to is distinct from old.quiet_to) then
      raise exception 'Only a parent can change that';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- a file belongs to whoever uploaded it; only they can record it. Parents can remove a child's private
-- journal entry but not rewrite it. Journal openness is stamped when written.
create or replace function public.board_stamp_extra()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); up uuid;
begin
  if tg_table_name = 'board_media' then
    select o.owner into up from storage.objects o where o.bucket_id = 'board-media' and o.name = new.path;
    if up is distinct from (select auth.uid()) then raise exception 'That change is not allowed'; end if;
  elsif tg_table_name = 'board_memories' then
    if tg_op = 'INSERT' then
      new.parents_may_see := new.audience = 'private' and exists (
        select 1 from public.family_members c join public.board_settings s on s.member_id = c.id
        where c.id = me and c.role = 'child' and s.journal_parents_see);
    else
      if new.parents_may_see <> old.parents_may_see then raise exception 'That change is not allowed'; end if;
      if old.author is distinct from me and (new.title <> old.title or new.body <> old.body or new.happened_on <> old.happened_on
         or new.people <> old.people) and old.audience = 'private' then
        raise exception 'Only the person who wrote it can change it';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.board_stamp_extra() from public, anon, authenticated;
create trigger board_media_owner before insert on public.board_media for each row execute function public.board_stamp_extra();
create trigger board_memories_extra before insert or update on public.board_memories for each row execute function public.board_stamp_extra();
