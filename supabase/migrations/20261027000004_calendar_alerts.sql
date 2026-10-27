-- Family Calendar, part 3 of 7 (alerts). See part 1 for the rules.

-- ---------------------------------------------------------------- notifications and push

create table public.notification_prefs (
  member_id uuid primary key references public.family_members (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  changes text not null default 'mine' check (changes in ('all', 'mine', 'off')),
  reminders boolean not null default true,
  weekly boolean not null default true,
  wishlists boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  kind text not null check (kind in ('changes', 'reminder', 'leave', 'wishlist', 'weekly', 'chore')),
  title text not null check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 300),
  link text check (char_length(link) <= 200),
  group_key text check (char_length(group_key) <= 120),
  count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  send_after timestamptz not null default now(),
  pushed_at timestamptz,
  read_at timestamptz
);
create index notifications_member_idx on public.notifications (member_id, created_at desc);
create index notifications_unsent_idx on public.notifications (send_after) where pushed_at is null;
create unique index notifications_open_group on public.notifications (member_id, group_key)
  where pushed_at is null and group_key is not null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  member_id uuid not null references public.family_members (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~* '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);

-- what the push service has already sent (service only)
create table public.reminder_sends (
  event_id uuid not null references public.cal_events (id) on delete cascade,
  occurrence_at timestamptz not null,
  kind text not null,
  minutes integer not null,
  sent_at timestamptz not null default now(),
  primary key (event_id, occurrence_at, kind, minutes)
);

-- add or grow a waiting notification for one person; grouped ones are sent once things go quiet
create or replace function public.notify(p_member uuid, p_kind text, p_title text, p_body text, p_link text,
  p_group text, p_delay interval)
returns void language plpgsql security definer set search_path = '' as $$
declare fid uuid;
begin
  select family_id into fid from public.family_members where id = p_member and archived_at is null and user_id is not null;
  if fid is null then return; end if;
  if p_group is not null then
    update public.notifications
      set count = count + 1, title = p_title, body = p_body, link = coalesce(p_link, link), updated_at = now(),
          send_after = least(created_at + interval '30 minutes', now() + p_delay)
      where member_id = p_member and group_key = p_group and pushed_at is null;
    if found then return; end if;
  end if;
  insert into public.notifications (family_id, member_id, kind, title, body, link, group_key, send_after)
    values (fid, p_member, p_kind, left(p_title, 120), left(coalesce(p_body, ''), 300), p_link, p_group, now() + p_delay);
end $$;

-- ---------------------------------------------------------------- event log + change alerts

-- waiting alerts about an event go away for anyone who can no longer see it
create or replace function public.clear_hidden_alerts(ev public.cal_events)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notifications n
    where n.link = '/m/calendar?event=' || ev.id and coalesce(public.member_sees_event(ev, n.member_id), false) = false;
end $$;
revoke all on function public.clear_hidden_alerts(public.cal_events) from public, anon, authenticated;

create or replace function public.after_event_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.my_member_id();
  act text;
  flds text[] := '{}';
  who text;
  r record;
  pref text;
  n integer;
begin
  if tg_op = 'INSERT' then
    act := 'added';
  else
    if new.deleted_at is not null and old.deleted_at is null then act := 'deleted';
    elsif new.deleted_at is null and old.deleted_at is not null then act := 'restored';
    else
      if new.title is distinct from old.title then flds := flds || 'title'::text; end if;
      if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.all_day is distinct from old.all_day then flds := flds || 'time'::text; end if;
      if new.rrule is distinct from old.rrule or new.exdates is distinct from old.exdates then flds := flds || 'repeat'::text; end if;
      if new.people is distinct from old.people then flds := flds || 'people'::text; end if;
      if new.place_id is distinct from old.place_id or new.location is distinct from old.location then flds := flds || 'place'::text; end if;
      if new.driver is distinct from old.driver then flds := flds || 'driver'::text; end if;
      if new.notes is distinct from old.notes or new.booking_ref is distinct from old.booking_ref or new.link is distinct from old.link then flds := flds || 'details'::text; end if;
      if new.type is distinct from old.type then flds := flds || 'type'::text; end if;
      if new.visibility is distinct from old.visibility or new.viewers is distinct from old.viewers then flds := flds || 'who sees it'::text; end if;
      if new.reminders is distinct from old.reminders then flds := flds || 'reminders'::text; end if;
      if new.done_at is distinct from old.done_at and new.done_at is not null then act := 'done'; end if;
      if act is null and coalesce(array_length(flds, 1), 0) = 0 then return new; end if;
      act := coalesce(act, 'changed');
    end if;
  end if;

  insert into public.cal_event_log (family_id, event_id, member_id, action, fields) values (new.family_id, new.id, me, act, flds);

  if tg_op = 'UPDATE' and (new.visibility is distinct from old.visibility or new.viewers is distinct from old.viewers) then
    -- changed single dates follow the series (their guard copies the audience again)
    if new.recurrence_of is null then
      update public.cal_events set updated_at = now() where recurrence_of = new.id;
    end if;
    perform public.clear_hidden_alerts(new);
  end if;

  -- alerts only for changes people make (not imports), and not for ticking off a reminder
  if me is null or act = 'done' then return new; end if;
  select display_name into who from public.family_members where id = me;
  for r in
    select m.id, coalesce(p.changes, 'mine') as changes
    from public.family_members m left join public.notification_prefs p on p.member_id = m.id
    where m.family_id = new.family_id and m.archived_at is null and m.user_id is not null and m.id <> me
  loop
    pref := r.changes;
    if pref = 'off' then continue; end if;
    if not public.member_sees_event(new, r.id) then continue; end if;
    if pref = 'mine' and not (r.id = any(new.people) or new.driver = r.id or cardinality(new.people) = 0) then continue; end if;
    select count into n from public.notifications where member_id = r.id and group_key = 'changes:' || me and pushed_at is null;
    perform public.notify(r.id, 'changes',
      who || ' updated the calendar',
      case when n is null then initcap(act) || ': ' || new.title
           else (n + 1)::text || ' changes. Latest: ' || act || ' ' || new.title end,
      '/m/calendar?event=' || new.id, 'changes:' || me, interval '5 minutes');
  end loop;
  return new;
end $$;

create trigger cal_events_after after insert or update on public.cal_events
  for each row execute function public.after_event_change();

-- a feed's people and audience apply to every event it brought in
create or replace function public.after_feed_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.people is distinct from old.people or new.visibility is distinct from old.visibility
     or new.viewers is distinct from old.viewers or new.type is distinct from old.type then
    perform set_config('luex.feedsync', 'on', true);
    update public.cal_events set people = new.people, visibility = new.visibility, viewers = new.viewers,
      type = new.type, created_by_member = new.created_by_member, updated_at = now()
      where feed_id = new.id;
    perform set_config('luex.feedsync', 'off', true);
  end if;
  return new;
end $$;
create trigger cal_feeds_after after update on public.cal_feeds for each row execute function public.after_feed_change();

