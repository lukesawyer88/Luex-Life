-- Family Board, part 3 of 5 (guards and notifications). See part 1 for the rules.
-- Guards stamp who did what and refuse changes the screens never offer. Changes the database makes
-- itself (reaction counts, sending a shared place) set luex.boardsys = 'on' for the moment they run.

create or replace function public.board_sys() returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('luex.boardsys', true), 'off') = 'on'
$$;

-- ---------------------------------------------------------------- quiet hours and Board alerts

-- when person m's quiet hours end, if they are in them now (family time)
create or replace function public.board_quiet_until(m uuid)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare s public.board_settings%rowtype; tz text; lt timestamp; t time; d date;
begin
  select * into s from public.board_settings where member_id = m;
  if not found or s.quiet_from is null then return null; end if;
  select f.timezone into tz from public.families f where f.id = s.family_id;
  lt := now() at time zone coalesce(tz, 'Europe/London');
  t := lt::time; d := lt::date;
  if s.quiet_from < s.quiet_to then
    if t >= s.quiet_from and t < s.quiet_to then return (d + s.quiet_to) at time zone tz; end if;
  else
    if t >= s.quiet_from then return (d + 1 + s.quiet_to) at time zone tz; end if;
    if t < s.quiet_to then return (d + s.quiet_to) at time zone tz; end if;
  end if;
  return null;
end $$;

create or replace function public.board_notify(m uuid, p_kind text, p_title text, p_body text, p_link text, p_group text)
returns void language plpgsql security definer set search_path = '' as $$
declare q timestamptz := public.board_quiet_until(m);
begin
  perform public.notify(m, p_kind, p_title, p_body, p_link, p_group,
    case when p_group is null then interval '0' else interval '30 seconds' end);
  if q is not null then
    update public.notifications set send_after = greatest(send_after, q)
      where member_id = m and pushed_at is null
        and (group_key = p_group or (p_group is null and group_key is null and created_at >= now()));
  end if;
end $$;
revoke all on function public.board_quiet_until(uuid), public.board_notify(uuid, text, text, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- settings

create or replace function public.guard_board_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); my_role text; their_role text;
begin
  if (select auth.uid()) is null then new.updated_at := now(); return new; end if;
  if new.member_id <> old.member_id or new.family_id <> old.family_id then raise exception 'That change is not allowed'; end if;
  select role into my_role from public.family_members where id = me and family_id = new.family_id;
  select role into their_role from public.family_members where id = new.member_id;
  if my_role is distinct from 'parent' then
    -- not a parent: only your own alerts, and your own quiet hours if you're a grown-up
    if new.member_id <> me then raise exception 'That change is not allowed'; end if;
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
create trigger board_settings_guard before update on public.board_settings for each row execute function public.guard_board_settings();

-- ---------------------------------------------------------------- chats

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
  if not (old.created_by = me or public.is_family_parent(old.family_id)) then raise exception 'That change is not allowed'; end if;
  return new;
end $$;
create trigger board_threads_guard before update on public.board_threads for each row execute function public.guard_board_thread();

-- ---------------------------------------------------------------- messages

create or replace function public.guard_board_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); th public.board_threads%rowtype; parent boolean; ok boolean;
begin
  if tg_op = 'INSERT' then
    if me is null then raise exception 'That change is not allowed'; end if;
    select * into th from public.board_threads where id = new.thread_id;
    if not found or th.family_id <> new.family_id or not public.board_member_sees_thread(new.thread_id, me) then
      raise exception 'That change is not allowed';
    end if;
    new.author := me; new.created_at := now(); new.activity_at := now();
    new.pinned_at := null; new.pinned_by := null; new.edited_at := null; new.deleted_at := null; new.deleted_by := null;
    -- polls and shared places are made by their own functions only
    if new.kind in ('poll', 'location') and not public.board_sys() then raise exception 'That change is not allowed'; end if;
    if new.kind in ('photo', 'voice', 'location', 'location_request') then
      if not public.board_allowed(me, case new.kind when 'photo' then 'photos' when 'voice' then 'voice' else 'location' end) then
        raise exception 'A parent has switched that off for you';
      end if;
    end if;
    if new.kind = 'announcement' and not (th.kind = 'family' and public.is_family_parent(new.family_id)) then
      raise exception 'Only parents can post announcements, in the family chat';
    end if;
    if new.kind = 'kudos' then
      if th.kind <> 'family' or new.kudos_to is null or new.kudos_to = me
         or not public.members_in_family(new.family_id, array[new.kudos_to]) then
        raise exception 'That change is not allowed';
      end if;
    elsif new.kudos_to is not null then raise exception 'That change is not allowed';
    end if;
    if new.kind = 'location_request' then
      if new.ask_member is null or new.ask_member = me or not public.board_member_sees_thread(new.thread_id, new.ask_member) then
        raise exception 'That person is not in this chat';
      end if;
    elsif new.ask_member is not null then raise exception 'That change is not allowed';
    end if;
    if new.kind = 'sticker' then
      if new.sticker is null then raise exception 'Choose a sticker'; end if;
    elsif new.sticker is not null then raise exception 'That change is not allowed';
    end if;
    if new.kind in ('text', 'announcement', 'kudos') and btrim(new.body) = '' then raise exception 'Type a message first'; end if;
    if new.reply_to is not null and not exists (select 1 from public.board_messages where id = new.reply_to and thread_id = new.thread_id) then
      raise exception 'That change is not allowed';
    end if;
    -- tags: only people who are in this chat
    new.mentions := coalesce(array(select distinct x from unnest(new.mentions) x
      where x <> me and public.board_member_sees_thread(new.thread_id, x)), '{}');
    return new;
  end if;

  -- UPDATE
  if public.board_sys() or (select auth.uid()) is null then return new; end if;
  if new.thread_id <> old.thread_id or new.family_id <> old.family_id or new.author is distinct from old.author
     or new.kind <> old.kind or new.reply_to is distinct from old.reply_to or new.kudos_to is distinct from old.kudos_to
     or new.ask_member is distinct from old.ask_member or new.client_id is distinct from old.client_id
     or new.sticker is distinct from old.sticker or new.created_at <> old.created_at then
    raise exception 'That change is not allowed';
  end if;
  parent := public.is_family_parent(old.family_id);
  if new.body is distinct from old.body or new.mentions is distinct from old.mentions then
    if old.author is distinct from me or old.deleted_at is not null or old.kind not in ('text', 'announcement', 'kudos')
       or btrim(new.body) = '' then
      raise exception 'You can only edit your own messages';
    end if;
    new.edited_at := now();
    new.mentions := coalesce(array(select distinct x from unnest(new.mentions) x
      where x <> me and public.board_member_sees_thread(new.thread_id, x)), '{}');
  end if;
  if new.pinned_at is distinct from old.pinned_at then
    if not public.board_member_sees_thread(old.thread_id, me) or old.deleted_at is not null then
      raise exception 'That change is not allowed';
    end if;
    if new.pinned_at is null then new.pinned_by := null; else new.pinned_at := now(); new.pinned_by := me; end if;
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    if new.deleted_at is not null then
      if old.deleted_at is not null then new.deleted_at := old.deleted_at;
      elsif old.author = me or parent then new.deleted_at := now(); new.deleted_by := me; new.pinned_at := null; new.pinned_by := null;
      else raise exception 'You can only remove your own messages';
      end if;
    else
      -- undo: whoever removed it, or a parent
      if not (old.deleted_by = me or parent) then raise exception 'That change is not allowed'; end if;
      new.deleted_by := null;
    end if;
  end if;
  return new;
end $$;
create trigger board_messages_guard before insert or update on public.board_messages
  for each row execute function public.guard_board_message();

-- a short line about a message, for notifications
create or replace function public.board_preview(msg public.board_messages)
returns text language sql stable security definer set search_path = '' as $$
  select left(case msg.kind
    when 'photo' then '📷 ' || coalesce(nullif(msg.body, ''), 'Photo')
    when 'voice' then '🎤 Voice note'
    when 'poll' then '📊 ' || msg.body
    when 'location' then '📍 Shared where they are'
    when 'location_request' then '📍 Asked where you are'
    when 'sticker' then 'Sent a sticker'
    else msg.body end, 200)
$$;

create or replace function public.after_board_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare th public.board_threads%rowtype; who text; r record; n integer; title text; preview text; tag boolean;
begin
  perform set_config('luex.boardsys', 'on', true);
  update public.board_threads set last_message_at = now() where id = new.thread_id;
  perform set_config('luex.boardsys', 'off', true);

  -- the sender has read their own message
  insert into public.board_thread_state (thread_id, member_id, family_id, last_read_at)
    values (new.thread_id, new.author, new.family_id, now())
    on conflict (thread_id, member_id) do update set last_read_at = now();

  select * into th from public.board_threads where id = new.thread_id;
  select display_name into who from public.family_members where id = new.author;
  title := case th.kind when 'family' then 'Family chat' when 'group' then th.title else who end;
  preview := public.board_preview(new);

  for r in
    select m.id, coalesce(s.alerts, 'all') as alerts, coalesce(st.muted, false) as muted
    from public.family_members m
      left join public.board_settings s on s.member_id = m.id
      left join public.board_thread_state st on st.thread_id = new.thread_id and st.member_id = m.id
    where m.family_id = new.family_id and m.archived_at is null and m.user_id is not null and m.id <> new.author
  loop
    if r.alerts = 'off' or not public.board_member_sees_thread(new.thread_id, r.id) then continue; end if;
    tag := r.id = any(new.mentions) or r.id = new.kudos_to or r.id = new.ask_member;
    if new.kind = 'announcement' then
      perform public.board_notify(r.id, 'announcement', 'Announcement from ' || who, left(new.body, 300),
        '/m/board?thread=' || new.thread_id || '&message=' || new.id, null);
    elsif new.kind = 'location_request' and tag then
      perform public.board_notify(r.id, 'location', who || ' asked where you are', 'Tap to share your location once',
        '/m/board?thread=' || new.thread_id || '&message=' || new.id, null);
    elsif new.kind = 'kudos' and tag then
      perform public.board_notify(r.id, 'kudos', who || ' gave you a shout-out', left(new.body, 300),
        '/m/board?thread=' || new.thread_id || '&message=' || new.id, null);
    elsif tag then
      perform public.board_notify(r.id, 'mention', who || ' mentioned you', preview,
        '/m/board?thread=' || new.thread_id || '&message=' || new.id, null);
    elsif r.alerts = 'all' and not r.muted then
      select count into n from public.notifications where member_id = r.id and group_key = 'msg:' || new.thread_id and pushed_at is null;
      perform public.board_notify(r.id, 'message', title,
        case when n is null then (case when th.kind = 'direct' then preview else who || ': ' || preview end)
             else (n + 1)::text || ' new messages. Latest from ' || who || ': ' || preview end,
        '/m/board?thread=' || new.thread_id, 'msg:' || new.thread_id);
    end if;
  end loop;
  return new;
end $$;
create trigger board_messages_after after insert on public.board_messages
  for each row execute function public.after_board_message();

-- reactions, votes and "Got it": stamp the person, then nudge the message so screens refresh
create or replace function public.guard_board_reply_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); msg public.board_messages%rowtype;
begin
  if tg_table_name = 'board_poll_votes' then
    select message_id into new.message_id from public.board_poll_options where id = new.option_id;
    if new.message_id is null then raise exception 'That change is not allowed'; end if;
    if exists (select 1 from public.board_polls where message_id = new.message_id and closed_at is not null) then
      raise exception 'This poll has closed';
    end if;
  end if;
  select * into msg from public.board_messages where id = new.message_id;
  if not found or msg.deleted_at is not null or not public.board_member_sees_thread(msg.thread_id, me) then
    raise exception 'That change is not allowed';
  end if;
  new.member_id := me; new.family_id := msg.family_id;
  if tg_table_name = 'board_acks' and msg.kind <> 'announcement' then raise exception 'That change is not allowed'; end if;
  return new;
end $$;
create trigger board_reactions_guard before insert on public.board_reactions for each row execute function public.guard_board_reply_row();
create trigger board_acks_guard before insert on public.board_acks for each row execute function public.guard_board_reply_row();
create trigger board_poll_votes_guard before insert on public.board_poll_votes for each row execute function public.guard_board_reply_row();

-- single-answer polls: a new vote replaces your old one
create or replace function public.board_drop_other_votes(p_poll uuid, p_member uuid, p_keep uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.board_poll_votes where message_id = p_poll and member_id = p_member and option_id <> p_keep
$$;
revoke all on function public.board_drop_other_votes(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.after_board_reply_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare mid uuid := case when tg_op = 'DELETE' then old.message_id else new.message_id end;
begin
  if tg_op = 'INSERT' and tg_table_name = 'board_poll_votes'
     and not (select multi from public.board_polls where message_id = new.message_id) then
    perform public.board_drop_other_votes(new.message_id, new.member_id, new.option_id);
  end if;
  perform set_config('luex.boardsys', 'on', true);
  update public.board_messages set activity_at = now() where id = mid;
  perform set_config('luex.boardsys', 'off', true);
  return null;
end $$;
create trigger board_reactions_after after insert or delete on public.board_reactions for each row execute function public.after_board_reply_row();
create trigger board_acks_after after insert on public.board_acks for each row execute function public.after_board_reply_row();
create trigger board_poll_votes_after after insert or delete on public.board_poll_votes for each row execute function public.after_board_reply_row();

create or replace function public.guard_board_poll()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); author uuid;
begin
  if public.board_sys() or (select auth.uid()) is null then return new; end if;
  if new.message_id <> old.message_id or new.family_id <> old.family_id or new.question <> old.question
     or new.kind <> old.kind or new.multi <> old.multi then raise exception 'That change is not allowed'; end if;
  select m.author into author from public.board_messages m where m.id = old.message_id;
  if not (author = me or public.is_family_parent(old.family_id)) then raise exception 'Only the person who asked, or a parent, can do that'; end if;
  if new.closed_at is distinct from old.closed_at then new.closed_at := case when new.closed_at is null then null else now() end; end if;
  if new.event_id is not null and new.event_id is distinct from old.event_id
     and not exists (select 1 from public.cal_events where id = new.event_id and family_id = old.family_id) then
    raise exception 'That change is not allowed';
  end if;
  return new;
end $$;
create trigger board_polls_guard before update on public.board_polls for each row execute function public.guard_board_poll();

-- ---------------------------------------------------------------- media

create or replace function public.guard_board_media()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); f text := new.family_id::text; sz bigint; mem public.board_memories%rowtype;
begin
  if tg_op = 'INSERT' then
    if me is null then raise exception 'That change is not allowed'; end if;
    new.owner := me; new.created_at := now(); new.deleted_at := null;
    if new.kind in ('photo', 'video', 'drawing') and not public.board_allowed(me, 'photos') then
      raise exception 'A parent has switched photos off for you';
    end if;
    if new.kind = 'voice' and not public.board_allowed(me, 'voice') then raise exception 'A parent has switched voice notes off for you'; end if;
    if new.kind = 'video' and (new.duration_s is null or new.duration_s > 180) then raise exception 'Videos can be up to 3 minutes long'; end if;
    if new.thread_id is not null then
      if new.path not like f || '/board/t/' || new.thread_id::text || '/%' or new.album_id is not null
         or not exists (select 1 from public.board_threads where id = new.thread_id and family_id = new.family_id)
         or not public.board_member_sees_thread(new.thread_id, me) then
        raise exception 'That change is not allowed';
      end if;
      if new.message_id is not null and not exists (select 1 from public.board_messages
          where id = new.message_id and thread_id = new.thread_id and author = me) then
        raise exception 'That change is not allowed';
      end if;
    elsif new.memory_id is not null then
      select * into mem from public.board_memories where id = new.memory_id and family_id = new.family_id;
      if not found or new.path not like f || '/board/m/' || new.memory_id::text || '/%'
         or not (mem.author = me or (public.is_family_parent(new.family_id) and public.board_member_sees_memory(mem, me))) then
        raise exception 'That change is not allowed';
      end if;
    elsif new.path not like f || '/board/a/%' then
      raise exception 'That change is not allowed';
    end if;
    if new.album_id is not null and not exists (select 1 from public.board_albums where id = new.album_id and family_id = new.family_id) then
      raise exception 'That change is not allowed';
    end if;
    -- the size comes from the stored file itself, not from the app
    select (o.metadata ->> 'size')::bigint into sz from storage.objects o where o.bucket_id = 'board-media' and o.name = new.path;
    if not found then raise exception 'Upload the file first'; end if;
    new.bytes := coalesce(sz, 0);
  else
    if new.family_id <> old.family_id or new.owner is distinct from old.owner or new.path <> old.path
       or new.thread_id is distinct from old.thread_id or new.message_id is distinct from old.message_id
       or new.memory_id is distinct from old.memory_id or new.kind <> old.kind or new.bytes <> old.bytes then
      raise exception 'That change is not allowed';
    end if;
    if new.album_id is distinct from old.album_id and (old.thread_id is not null
       or (new.album_id is not null and not exists (select 1 from public.board_albums where id = new.album_id and family_id = new.family_id))) then
      raise exception 'That change is not allowed';
    end if;
    if new.deleted_at is distinct from old.deleted_at and new.deleted_at is not null then new.deleted_at := now(); end if;
  end if;
  if not public.members_in_family(new.family_id, new.people) then raise exception 'Those people are not in this family'; end if;
  return new;
end $$;
create trigger board_media_guard before insert or update on public.board_media for each row execute function public.guard_board_media();

-- ---------------------------------------------------------------- memories

create or replace function public.guard_board_memory()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id();
begin
  if tg_op = 'INSERT' then
    new.author := me; new.created_at := now(); new.updated_at := now(); new.deleted_at := null;
    if new.prompt_id is not null then
      select text into new.prompt_text from public.board_prompts
        where id = new.prompt_id and (family_id is null or family_id = new.family_id);
      if not found then raise exception 'That change is not allowed'; end if;
    else new.prompt_text := null;
    end if;
    if new.milestone_for is not null and not public.members_in_family(new.family_id, array[new.milestone_for]) then
      raise exception 'That person is not in this family';
    end if;
  else
    if new.family_id <> old.family_id or new.author is distinct from old.author or new.kind <> old.kind
       or new.milestone_for is distinct from old.milestone_for or new.prompt_id is distinct from old.prompt_id
       or new.prompt_text is distinct from old.prompt_text or new.created_at <> old.created_at then
      raise exception 'That change is not allowed';
    end if;
    -- only the writer can open up or close a private entry
    if new.audience <> old.audience and old.author is distinct from me then raise exception 'Only the person who wrote it can change who sees it'; end if;
    new.updated_at := now();
    if new.deleted_at is not null and old.deleted_at is null then new.deleted_at := now(); end if;
  end if;
  if not public.members_in_family(new.family_id, new.people) then raise exception 'Those people are not in this family'; end if;
  return new;
end $$;
create trigger board_memories_guard before insert or update on public.board_memories for each row execute function public.guard_board_memory();

-- tagged people hear about it (only if they can see it)
create or replace function public.after_board_memory()
returns trigger language plpgsql security definer set search_path = '' as $$
declare who text; p uuid;
begin
  if new.deleted_at is not null then return null; end if;
  select display_name into who from public.family_members where id = new.author;
  for p in select x from unnest(new.people) x
    where x is distinct from new.author and (tg_op = 'INSERT' or not (x = any(old.people)))
  loop
    if public.board_member_sees_memory(new, p) and coalesce((select alerts from public.board_settings where member_id = p), 'all') <> 'off' then
      perform public.board_notify(p, 'memory', who || ' tagged you in a memory',
        coalesce(nullif(new.title, ''), left(new.body, 200)), '/m/board?memory=' || new.id, null);
    end if;
  end loop;
  return null;
end $$;
create trigger board_memories_after after insert or update of people on public.board_memories
  for each row execute function public.after_board_memory();

-- ---------------------------------------------------------------- albums, lists, notes, goals, prompts, shares

create or replace function public.stamp_board_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); adult boolean; parent boolean; owner_ok boolean; g public.board_goals%rowtype;
begin
  if (select auth.uid()) is null then return new; end if;
  if not public.is_family_member(new.family_id) then raise exception 'That change is not allowed'; end if;
  if tg_op = 'UPDATE' and new.family_id <> old.family_id then raise exception 'That change is not allowed'; end if;
  adult := public.is_family_adult(new.family_id);
  parent := public.is_family_parent(new.family_id);
  case tg_table_name
    when 'board_albums' then
      if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); new.archived_at := null;
      elsif new.kind <> old.kind or new.created_by is distinct from old.created_by then raise exception 'That change is not allowed'; end if;

    when 'board_lists' then
      if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); new.archived_at := null;
      else
        if new.kind <> old.kind or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
          raise exception 'That change is not allowed';
        end if;
        -- children change only lists they made (they can still tick and add to any list)
        if not adult and old.created_by is distinct from me and (new.title <> old.title or new.emoji is distinct from old.emoji
           or new.is_template <> old.is_template or new.archived_at is distinct from old.archived_at) then
          raise exception 'Only a grown-up can change this list';
        end if;
      end if;
      new.updated_at := now();

    when 'board_list_items' then
      if tg_op = 'INSERT' then
        new.created_by := me; new.created_at := now(); new.done_at := null; new.done_by := null;
        if not exists (select 1 from public.board_lists where id = new.list_id and family_id = new.family_id) then
          raise exception 'That change is not allowed';
        end if;
      else
        if new.list_id <> old.list_id or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
          raise exception 'That change is not allowed';
        end if;
        if not adult and old.created_by is distinct from me and (new.text <> old.text or new.assignee is distinct from old.assignee) then
          raise exception 'Only a grown-up can change someone else''s item';
        end if;
        if new.done_at is distinct from old.done_at then
          if new.done_at is null then new.done_by := null; else new.done_at := now(); new.done_by := me; end if;
        end if;
      end if;
      if new.assignee is not null and not public.members_in_family(new.family_id, array[new.assignee]) then
        raise exception 'That person is not in this family';
      end if;

    when 'board_notes' then
      if tg_op = 'INSERT' then new.author := me; new.created_at := now(); new.deleted_at := null;
      elsif new.author is distinct from old.author or new.created_at <> old.created_at then raise exception 'That change is not allowed';
      elsif new.deleted_at is not null and old.deleted_at is null then new.deleted_at := now();
      end if;
      new.updated_at := now();

    when 'board_goals' then
      if tg_op = 'INSERT' then
        new.created_by := me; new.created_at := now(); new.done_at := null; new.done_by := null; new.archived_at := null;
      else
        if new.created_by is distinct from old.created_by or new.created_at <> old.created_at then raise exception 'That change is not allowed'; end if;
        if not adult and (new.title <> old.title or new.emoji is distinct from old.emoji or new.target is distinct from old.target
           or new.unit is distinct from old.unit or new.due_on is distinct from old.due_on or new.people <> old.people
           or new.stars <> old.stars or new.done_at is distinct from old.done_at or new.archived_at is distinct from old.archived_at) then
          raise exception 'Only a grown-up can change that';
        end if;
        if not adult and old.done_at is not null and new.progress <> old.progress then raise exception 'This goal is finished'; end if;
        if new.done_at is distinct from old.done_at then
          if new.done_at is null then new.done_by := null; else new.done_at := now(); new.done_by := me; end if;
        end if;
      end if;
      if not public.members_in_family(new.family_id, new.people) then raise exception 'Those people are not in this family'; end if;
      new.updated_at := now();

    when 'board_goal_steps' then
      select * into g from public.board_goals where id = new.goal_id and family_id = new.family_id;
      if not found then raise exception 'That change is not allowed'; end if;
      if tg_op = 'INSERT' then new.done_at := null; new.done_by := null;
      else
        if new.goal_id <> old.goal_id then raise exception 'That change is not allowed'; end if;
        if not adult and (new.text <> old.text or new.position <> old.position) then raise exception 'Only a grown-up can change that'; end if;
        if not adult and g.done_at is not null then raise exception 'This goal is finished'; end if;
        if new.done_at is distinct from old.done_at then
          if new.done_at is null then new.done_by := null; else new.done_at := now(); new.done_by := me; end if;
        end if;
      end if;

    when 'board_prompts' then
      if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); new.archived_at := null; end if;

    else
      null;
  end case;
  return new;
end $$;

create trigger board_albums_stamp before insert or update on public.board_albums for each row execute function public.stamp_board_row();
create trigger board_lists_stamp before insert or update on public.board_lists for each row execute function public.stamp_board_row();
create trigger board_list_items_stamp before insert or update on public.board_list_items for each row execute function public.stamp_board_row();
create trigger board_notes_stamp before insert or update on public.board_notes for each row execute function public.stamp_board_row();
create trigger board_goals_stamp before insert or update on public.board_goals for each row execute function public.stamp_board_row();
create trigger board_goal_steps_stamp before insert or update on public.board_goal_steps for each row execute function public.stamp_board_row();
create trigger board_prompts_stamp before insert or update on public.board_prompts for each row execute function public.stamp_board_row();

-- goal finished: tell the people it was for (or everyone)
create or replace function public.after_board_goal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.done_at is null or old.done_at is not null then return null; end if;
  for r in select m.id from public.family_members m
    where m.family_id = new.family_id and m.archived_at is null and m.user_id is not null
      and m.id is distinct from new.done_by and (cardinality(new.people) = 0 or m.id = any(new.people))
  loop
    if coalesce((select alerts from public.board_settings where member_id = r.id), 'all') <> 'off' then
      perform public.board_notify(r.id, 'goal', 'Goal reached! ' || coalesce(new.emoji || ' ', '') || new.title,
        case when new.stars > 0 then new.stars || ' stars each' else 'Well done, everyone' end, '/m/board?goal=' || new.id, null);
    end if;
  end loop;
  return null;
end $$;
create trigger board_goals_after after update of done_at on public.board_goals for each row execute function public.after_board_goal();

create or replace function public.guard_board_share()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if old.revoked_at is not null then raise exception 'This link has already been stopped'; end if;
  if new.revoked_at is not null then new.revoked_at := now(); end if;
  return new;
end $$;
create trigger board_album_shares_guard before update of revoked_at on public.board_album_shares
  for each row execute function public.guard_board_share();

revoke all on function public.board_sys(), public.guard_board_settings(), public.guard_board_thread(),
  public.guard_board_message(), public.board_preview(public.board_messages), public.after_board_message(),
  public.guard_board_reply_row(), public.after_board_reply_row(), public.guard_board_poll(), public.guard_board_media(),
  public.guard_board_memory(), public.after_board_memory(), public.stamp_board_row(), public.after_board_goal(),
  public.guard_board_share()
  from public, anon, authenticated;
