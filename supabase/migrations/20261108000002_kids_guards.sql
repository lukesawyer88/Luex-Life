-- Kids' Space, part 2 of 2 (guards and messages).

create or replace function public.stamp_kid_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); parent boolean; n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  -- our own lapsing of old asks (below) is not a person's change
  if pg_trigger_depth() > 1 then return new; end if;
  if new.family_id is distinct from public.my_family_id() then raise exception 'That change is not allowed'; end if;
  if tg_op = 'UPDATE' and (new.family_id <> old.family_id or new.child_id <> old.child_id) then raise exception 'That change is not allowed'; end if;
  if tg_op = 'INSERT' and not public.kid_in_family(new.family_id, new.child_id) then raise exception 'Pick a child in this household'; end if;
  parent := public.is_family_parent(new.family_id);

  if tg_table_name = 'kid_rules' then
    if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); new.deleted_at := null;
    else
      if old.deleted_at is not null then raise exception 'That change is not allowed'; end if;
      if new.deleted_at is not null then new.deleted_at := now(); end if;
    end if;

  elsif tg_table_name = 'kid_asks' then
    if tg_op = 'INSERT' then
      -- an unanswered ask lapses after 3 hours, so a new one can be made
      update public.kid_asks set status = 'lapsed' where child_id = new.child_id and status = 'asked' and created_at < now() - interval '3 hours';
      select count(*) into n from public.kid_asks where child_id = new.child_id and created_at > now() - interval '1 day';
      if n >= 10 then raise exception 'That''s a lot of asks today. Try again tomorrow'; end if;
      new.status := 'asked'; new.answered_by := null; new.answered_at := null; new.created_at := now();
    else
      if old.status <> 'asked' or new.status not in ('yes', 'no') then raise exception 'That change is not allowed'; end if;
      new.answered_by := me; new.answered_at := now();
    end if;

  elsif tg_table_name = 'kid_milestones' then
    if new.on_date > (now() at time zone 'utc')::date + 1 then raise exception 'Pick a day that has happened'; end if;
    if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); new.deleted_at := null;
    else
      -- parents change any; everyone else only what they added
      if not parent and old.created_by is distinct from me then raise exception 'That change is not allowed'; end if;
      if old.deleted_at is not null then raise exception 'That change is not allowed'; end if;
      if new.deleted_at is not null then new.deleted_at := now(); end if;
    end if;

  elsif tg_table_name = 'kid_about' then
    new.updated_by := me; new.updated_at := now();
  end if;
  return new;
end $$;
revoke all on function public.stamp_kid_row() from public, anon, authenticated;
create trigger kid_rules_stamp before insert or update on public.kid_rules for each row execute function public.stamp_kid_row();
create trigger kid_asks_stamp before insert or update on public.kid_asks for each row execute function public.stamp_kid_row();
create trigger kid_milestones_stamp before insert or update on public.kid_milestones for each row execute function public.stamp_kid_row();
create trigger kid_about_stamp before insert or update on public.kid_about for each row execute function public.stamp_kid_row();

-- an ask tells the parents; an answer tells the child
create or replace function public.after_kid_ask()
returns trigger language plpgsql security definer set search_path = '' as $$
declare kid text; p uuid;
begin
  if (select auth.uid()) is null then return null; end if;
  select display_name into kid from public.family_members where id = new.child_id;
  if tg_op = 'INSERT' then
    for p in select id from public.family_members where family_id = new.family_id and role = 'parent' and archived_at is null and user_id is not null loop
      perform public.notify(p, 'kids', kid || ' asks for ' || new.minutes || ' more minutes',
        case when new.reason = '' then 'Screen time' else new.reason end, '/m/kids?tab=screen&child=' || new.child_id, null, interval '0');
    end loop;
  elsif new.status is distinct from old.status and new.status in ('yes', 'no') then
    perform public.notify(new.child_id, 'kids',
      case when new.status = 'yes' then 'Yes, ' || new.minutes || ' more minutes' else 'Not this time' end,
      'Screen time', '/m/kids?tab=screen', null, interval '0');
  end if;
  return null;
end $$;
revoke all on function public.after_kid_ask() from public, anon, authenticated;
create trigger kid_asks_after after insert or update on public.kid_asks for each row execute function public.after_kid_ask();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.kid_rules, public.kid_asks, public.kid_milestones, public.kid_about;
  end if;
end $$;
