-- Family Board, part 2 of 5 (who can see what). See part 1 for the rules.

-- ---------------------------------------------------------------- settings rows for everyone

-- under-13s (or no birthday): parents can read their chats by default; teenagers: off until a parent chooses
create or replace function public.board_default_parents_read(p_role text, p_birthday date)
returns boolean language sql immutable set search_path = '' as $$
  select p_role = 'child' and (p_birthday is null or p_birthday > (current_date - interval '13 years')::date)
$$;

create or replace function public.board_settings_for_new_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.board_settings (member_id, family_id, parents_can_read)
    values (new.id, new.family_id, public.board_default_parents_read(new.role, new.birthday))
    on conflict (member_id) do nothing;
  return new;
end $$;
revoke all on function public.board_settings_for_new_member() from public, anon, authenticated;
create trigger family_members_board_settings after insert on public.family_members
  for each row execute function public.board_settings_for_new_member();

insert into public.board_settings (member_id, family_id, parents_can_read)
  select id, family_id, public.board_default_parents_read(role, birthday) from public.family_members
  on conflict (member_id) do nothing;

-- ---------------------------------------------------------------- who is in a chat

-- does person m take part in chat t (can read it and write in it)?
create or replace function public.board_member_sees_thread(t uuid, m uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare th public.board_threads%rowtype; mem public.family_members%rowtype; s public.board_settings%rowtype;
begin
  if t is null or m is null then return false; end if;
  select * into th from public.board_threads where id = t and archived_at is null;
  if not found then return false; end if;
  select * into mem from public.family_members where id = m and family_id = th.family_id and archived_at is null;
  if not found then return false; end if;
  select * into s from public.board_settings where member_id = m;
  if mem.role = 'child' and not coalesce(s.chat, true) then return false; end if;
  if th.kind = 'family' then return true; end if;
  if not exists (select 1 from public.board_thread_people where thread_id = t and member_id = m) then return false; end if;
  return not (mem.role = 'child' and not coalesce(s.private_chats, true));
end $$;

-- can parent m read chat t because a child in it lets parents read their chats? (read-only)
create or replace function public.board_parent_observes(t uuid, m uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select true from public.board_threads th
      join public.family_members me on me.id = m and me.family_id = th.family_id and me.role = 'parent' and me.archived_at is null
    where th.id = t and th.archived_at is null and th.kind <> 'family'
      and exists (select 1 from public.board_thread_people p
        join public.family_members c on c.id = p.member_id and c.role = 'child' and c.archived_at is null
        join public.board_settings s on s.member_id = c.id and s.parents_can_read
        where p.thread_id = t)
    limit 1), false)
$$;

create or replace function public.board_can_see_thread(t uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.board_member_sees_thread(t, public.my_member_id()) or public.board_parent_observes(t, public.my_member_id())
$$;

create or replace function public.board_can_post(t uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.board_member_sees_thread(t, public.my_member_id())
$$;

create or replace function public.board_can_see_message(msg uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public.board_can_see_thread(thread_id) from public.board_messages where id = msg), false)
$$;

create or replace function public.board_can_post_message(msg uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select deleted_at is null and public.board_can_post(thread_id) from public.board_messages where id = msg), false)
$$;

-- ---------------------------------------------------------------- memories

create or replace function public.board_member_sees_memory(mem public.board_memories, m uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare me public.family_members%rowtype;
begin
  select * into me from public.family_members where id = m and family_id = mem.family_id and archived_at is null;
  if not found then return false; end if;
  if mem.audience = 'family' or mem.author = m then return true; end if;
  -- private: parents see a child's private entries when that child's journal is open to parents
  return me.role = 'parent' and exists (
    select 1 from public.family_members c join public.board_settings s on s.member_id = c.id
    where c.id = mem.author and c.role = 'child' and s.journal_parents_see);
end $$;

-- for row security: the row itself is passed in, so it works while the row is still being saved
create or replace function public.board_sees_memory(mem public.board_memories)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.board_member_sees_memory(mem, public.my_member_id())
$$;

create or replace function public.board_can_see_memory(mid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public.board_member_sees_memory(x, public.my_member_id()) from public.board_memories x where id = mid), false)
$$;

-- a child's switch (adults always true)
create or replace function public.board_allowed(m uuid, what text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare r text; s public.board_settings%rowtype;
begin
  select role into r from public.family_members where id = m;
  if r is distinct from 'child' then return true; end if;
  select * into s from public.board_settings where member_id = m;
  if not found then return true; end if;
  return case what when 'photos' then s.photos when 'voice' then s.voice when 'location' then s.location
    when 'private_chats' then s.private_chats when 'chat' then s.chat else false end;
end $$;

-- the media a person can see
create or replace function public.board_can_see_media(md public.board_media)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when md.memory_id is not null then public.board_can_see_memory(md.memory_id)
    when md.thread_id is not null then public.board_can_see_thread(md.thread_id)
    else public.is_family_member(md.family_id) end
$$;

revoke all on function public.board_member_sees_thread(uuid, uuid), public.board_parent_observes(uuid, uuid),
  public.board_member_sees_memory(public.board_memories, uuid), public.board_allowed(uuid, text),
  public.board_default_parents_read(text, date)
  from public, anon, authenticated;
revoke all on function public.board_can_see_thread(uuid), public.board_can_post(uuid), public.board_can_see_message(uuid),
  public.board_can_post_message(uuid), public.board_can_see_memory(uuid), public.board_can_see_media(public.board_media),
  public.board_sees_memory(public.board_memories)
  from public, anon;
grant execute on function public.board_can_see_thread(uuid), public.board_can_post(uuid), public.board_can_see_message(uuid),
  public.board_can_post_message(uuid), public.board_can_see_memory(uuid), public.board_can_see_media(public.board_media),
  public.board_sees_memory(public.board_memories)
  to authenticated;

-- ---------------------------------------------------------------- policies (one per command)

-- settings: your own row; parents see and set everyone's in their family
create policy board_settings_read on public.board_settings for select to authenticated
  using (member_id = (select public.my_member_id()) or public.is_family_parent(family_id));
create policy board_settings_change on public.board_settings for update to authenticated
  using (member_id = (select public.my_member_id()) or public.is_family_parent(family_id))
  with check (member_id = (select public.my_member_id()) or public.is_family_parent(family_id));

-- chats: made through the start-a-chat functions; groups renamed by their starter or a parent
create policy board_threads_read on public.board_threads for select to authenticated
  using (public.board_can_see_thread(id));
create policy board_threads_change on public.board_threads for update to authenticated
  using (public.board_can_see_thread(id)) with check (public.board_can_see_thread(id));

create policy board_thread_people_read on public.board_thread_people for select to authenticated
  using (public.board_can_see_thread(thread_id));

-- read positions: anyone in the chat (that is "seen by"); changed through board_mark_read / board_set_mute
create policy board_thread_state_read on public.board_thread_state for select to authenticated
  using (public.board_can_see_thread(thread_id));

-- messages
create policy board_messages_read on public.board_messages for select to authenticated
  using (public.board_can_see_thread(thread_id));
create policy board_messages_add on public.board_messages for insert to authenticated
  with check (public.board_can_post(thread_id));
create policy board_messages_change on public.board_messages for update to authenticated
  using (public.board_can_see_thread(thread_id)) with check (public.board_can_see_thread(thread_id));

create policy board_reactions_read on public.board_reactions for select to authenticated
  using (public.board_can_see_message(message_id));
create policy board_reactions_add on public.board_reactions for insert to authenticated
  with check (member_id = (select public.my_member_id()) and public.board_can_post_message(message_id));
create policy board_reactions_remove on public.board_reactions for delete to authenticated
  using (member_id = (select public.my_member_id()));

create policy board_acks_read on public.board_acks for select to authenticated
  using (public.board_can_see_message(message_id));
create policy board_acks_add on public.board_acks for insert to authenticated
  with check (member_id = (select public.my_member_id()) and public.board_can_post_message(message_id));

create policy board_polls_read on public.board_polls for select to authenticated
  using (public.board_can_see_message(message_id));
create policy board_polls_change on public.board_polls for update to authenticated
  using (public.board_can_see_message(message_id)) with check (public.board_can_see_message(message_id));
create policy board_poll_options_read on public.board_poll_options for select to authenticated
  using (public.board_can_see_message(message_id));
create policy board_poll_votes_read on public.board_poll_votes for select to authenticated
  using (public.board_can_see_message(message_id));
create policy board_poll_votes_add on public.board_poll_votes for insert to authenticated
  with check (member_id = (select public.my_member_id()) and public.board_can_post_message(message_id));
create policy board_poll_votes_remove on public.board_poll_votes for delete to authenticated
  using (member_id = (select public.my_member_id()));

-- shared places disappear after an hour
create policy board_locations_read on public.board_locations for select to authenticated
  using (expires_at > now() and public.board_can_see_thread(thread_id));

-- albums: everyone in the family
create policy board_albums_read on public.board_albums for select to authenticated
  using (public.is_family_member(family_id));
create policy board_albums_add on public.board_albums for insert to authenticated
  with check (public.is_family_member(family_id));
create policy board_albums_change on public.board_albums for update to authenticated
  using (public.is_family_parent(family_id) or created_by = (select public.my_member_id()))
  with check (public.is_family_parent(family_id) or created_by = (select public.my_member_id()));

create policy board_media_read on public.board_media for select to authenticated
  using (public.board_can_see_media(board_media));
create policy board_media_add on public.board_media for insert to authenticated
  with check (public.is_family_member(family_id));
create policy board_media_change on public.board_media for update to authenticated
  using (public.board_can_see_media(board_media) and (owner = (select public.my_member_id()) or public.is_family_parent(family_id)))
  with check (public.board_can_see_media(board_media) and (owner = (select public.my_member_id()) or public.is_family_parent(family_id)));

create policy board_album_shares_read on public.board_album_shares for select to authenticated
  using (public.is_family_adult(family_id));
create policy board_album_shares_change on public.board_album_shares for update to authenticated
  using (public.is_family_parent(family_id) or created_by = (select public.my_member_id()))
  with check (public.is_family_parent(family_id) or created_by = (select public.my_member_id()));

create policy board_memories_read on public.board_memories for select to authenticated
  using (public.board_sees_memory(board_memories));
create policy board_memories_add on public.board_memories for insert to authenticated
  with check (public.is_family_member(family_id));
create policy board_memories_change on public.board_memories for update to authenticated
  using (author = (select public.my_member_id()) or (public.is_family_parent(family_id) and public.board_sees_memory(board_memories)))
  with check (author = (select public.my_member_id()) or (public.is_family_parent(family_id) and public.board_sees_memory(board_memories)));

-- lists: everyone sees every list
create policy board_lists_read on public.board_lists for select to authenticated using (public.is_family_member(family_id));
create policy board_lists_add on public.board_lists for insert to authenticated with check (public.is_family_member(family_id));
create policy board_lists_change on public.board_lists for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy board_lists_remove on public.board_lists for delete to authenticated
  using (public.is_family_parent(family_id) or created_by = (select public.my_member_id()));

create policy board_list_items_read on public.board_list_items for select to authenticated using (public.is_family_member(family_id));
create policy board_list_items_add on public.board_list_items for insert to authenticated with check (public.is_family_member(family_id));
create policy board_list_items_change on public.board_list_items for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy board_list_items_remove on public.board_list_items for delete to authenticated
  using (public.is_family_adult(family_id) or created_by = (select public.my_member_id()));

-- notes: everyone reads and adds; the writer or a parent changes them
create policy board_notes_read on public.board_notes for select to authenticated using (public.is_family_member(family_id));
create policy board_notes_add on public.board_notes for insert to authenticated with check (public.is_family_member(family_id));
create policy board_notes_change on public.board_notes for update to authenticated
  using (public.is_family_parent(family_id) or author = (select public.my_member_id()))
  with check (public.is_family_parent(family_id) or author = (select public.my_member_id()));

-- goals: grown-ups set them up; everyone helps (the guard limits what children change)
create policy board_goals_read on public.board_goals for select to authenticated using (public.is_family_member(family_id));
create policy board_goals_add on public.board_goals for insert to authenticated with check (public.is_family_adult(family_id));
create policy board_goals_change on public.board_goals for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy board_goal_steps_read on public.board_goal_steps for select to authenticated using (public.is_family_member(family_id));
create policy board_goal_steps_add on public.board_goal_steps for insert to authenticated with check (public.is_family_adult(family_id));
create policy board_goal_steps_change on public.board_goal_steps for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy board_goal_steps_remove on public.board_goal_steps for delete to authenticated using (public.is_family_adult(family_id));

-- journal questions: Luex's own plus the family's; parents add their own
create policy board_prompts_read on public.board_prompts for select to authenticated
  using (family_id is null or public.is_family_member(family_id));
create policy board_prompts_add on public.board_prompts for insert to authenticated
  with check (family_id is not null and public.is_family_parent(family_id));
create policy board_prompts_change on public.board_prompts for update to authenticated
  using (family_id is not null and public.is_family_parent(family_id))
  with check (family_id is not null and public.is_family_parent(family_id));

-- ---------------------------------------------------------------- grants (exactly what the app needs)

grant select on public.board_settings, public.board_threads, public.board_thread_people, public.board_thread_state,
  public.board_messages, public.board_reactions, public.board_acks, public.board_polls, public.board_poll_options,
  public.board_poll_votes, public.board_locations, public.board_albums, public.board_memories, public.board_media,
  public.board_lists, public.board_list_items, public.board_notes, public.board_goals,
  public.board_goal_steps, public.board_prompts to authenticated;
grant select (id, family_id, album_id, label, expires_at, revoked_at, last_used_at, created_by, created_at)
  on public.board_album_shares to authenticated;

grant update (chat, private_chats, photos, voice, location, parents_can_read, journal_prompts, journal_time,
  journal_parents_see, quiet_from, quiet_to, alerts) on public.board_settings to authenticated;
grant update (title, emoji, archived_at) on public.board_threads to authenticated;

grant insert (family_id, thread_id, kind, body, reply_to, mentions, kudos_to, ask_member, sticker, client_id)
  on public.board_messages to authenticated;
grant update (body, mentions, pinned_at, deleted_at) on public.board_messages to authenticated;

grant insert (message_id, member_id, family_id, emoji) on public.board_reactions to authenticated;
grant delete on public.board_reactions to authenticated;
grant insert (message_id, member_id, family_id) on public.board_acks to authenticated;
grant update (closed_at, event_id) on public.board_polls to authenticated;
grant insert (option_id, message_id, member_id, family_id) on public.board_poll_votes to authenticated;
grant delete on public.board_poll_votes to authenticated;

grant insert (family_id, title, kind) on public.board_albums to authenticated;
grant update (title, archived_at) on public.board_albums to authenticated;
grant insert (family_id, thread_id, message_id, album_id, memory_id, path, thumb_path, kind, mime, width, height, duration_s,
  caption, people, taken_at) on public.board_media to authenticated;
grant update (caption, people, album_id, taken_at, deleted_at) on public.board_media to authenticated;
grant update (revoked_at) on public.board_album_shares to authenticated;

grant insert (family_id, kind, title, body, happened_on, people, milestone_for, prompt_id, audience)
  on public.board_memories to authenticated;
grant update (title, body, happened_on, people, audience, deleted_at) on public.board_memories to authenticated;

grant insert (family_id, title, emoji, kind, is_template, position) on public.board_lists to authenticated;
grant update (title, emoji, position, is_template, archived_at) on public.board_lists to authenticated;
grant delete on public.board_lists to authenticated;
grant insert (list_id, family_id, text, assignee, position) on public.board_list_items to authenticated;
grant update (text, assignee, position, done_at) on public.board_list_items to authenticated;
grant delete on public.board_list_items to authenticated;

grant insert (family_id, body, colour, pinned) on public.board_notes to authenticated;
grant update (body, colour, pinned, deleted_at) on public.board_notes to authenticated;

grant insert (family_id, title, emoji, target, unit, progress, due_on, people, stars) on public.board_goals to authenticated;
grant update (title, emoji, target, unit, progress, due_on, people, stars, done_at, archived_at) on public.board_goals to authenticated;
grant insert (goal_id, family_id, text, position) on public.board_goal_steps to authenticated;
grant update (text, position, done_at) on public.board_goal_steps to authenticated;
grant delete on public.board_goal_steps to authenticated;

grant insert (family_id, text) on public.board_prompts to authenticated;
grant update (archived_at) on public.board_prompts to authenticated;
