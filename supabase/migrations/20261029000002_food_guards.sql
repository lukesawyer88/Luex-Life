-- Food, part 2 of 3 (guards, notifications, files, live updates). See part 1 for the rules.

create or replace function public.food_role(f uuid)
returns text language sql stable security definer set search_path = '' as $$
  select role from public.family_members where family_id = f and user_id = (select auth.uid()) and archived_at is null limit 1
$$;
revoke all on function public.food_role(uuid) from public, anon, authenticated;

-- remembers each item the family buys (aisle, unit, how often): kept by the database, not the app
create or replace function public.food_remember_item(f uuid, p_name text, p_aisle text, p_unit text)
returns text language plpgsql security definer set search_path = '' as $$
declare k text := lower(btrim(regexp_replace(p_name, '\s+', ' ', 'g'))); a text;
begin
  perform set_config('luex.foodsys', 'on', true);
  insert into public.food_known_items (family_id, name, name_key, aisle, unit, used_count, last_used)
    values (f, btrim(p_name), k, p_aisle, p_unit, 1, now())
    on conflict (family_id, name_key) do update
      set used_count = public.food_known_items.used_count + 1, last_used = now(),
          aisle = coalesce(excluded.aisle, public.food_known_items.aisle),
          unit = coalesce(excluded.unit, public.food_known_items.unit)
    returning aisle into a;
  perform set_config('luex.foodsys', 'off', true);
  return a;
end $$;
revoke all on function public.food_remember_item(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.stamp_food_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); r text; parent boolean; adult boolean; others boolean;
begin
  if (select auth.uid()) is null then return new; end if;
  if new.family_id is distinct from public.my_family_id() then raise exception 'That change is not allowed'; end if;
  if tg_op = 'UPDATE' and new.family_id <> old.family_id then raise exception 'That change is not allowed'; end if;
  r := public.food_role(new.family_id);
  parent := r = 'parent'; adult := r in ('parent', 'member');

  case tg_table_name
    when 'food_settings' then
      if new.member_id <> me then raise exception 'That change is not allowed'; end if;
      if new.calories_on and not adult then raise exception 'Calorie tracking is for grown-ups'; end if;
      new.updated_at := now();

    when 'food_diary' then
      if tg_op = 'INSERT' then new.member_id := me; new.created_at := now(); end if;
      if not adult or not coalesce((select calories_on from public.food_settings where member_id = me), false) then
        raise exception 'Switch calorie tracking on first';
      end if;

    when 'food_avoid' then
      new.created_by := me; new.created_at := now();
      if not public.members_in_family(new.family_id, array[new.member_id]) then raise exception 'That person is not in this family'; end if;

    when 'food_collections' then
      if tg_op = 'INSERT' then new.created_by := me; new.created_at := now();
      elsif new.created_by is distinct from old.created_by then raise exception 'That change is not allowed'; end if;

    when 'food_recipes' then
      if tg_op = 'INSERT' then
        new.created_by := me; new.created_at := now(); new.times_made := 0; new.last_made := null; new.archived_at := null;
      else
        if new.created_by is distinct from old.created_by or new.created_at <> old.created_at then raise exception 'That change is not allowed'; end if;
        -- others may only record "made it" (one more time, today or earlier)
        if not parent and old.created_by is distinct from me then
          if new.title <> old.title or new.description <> old.description or new.photo_path is distinct from old.photo_path
             or new.source_url is distinct from old.source_url or new.servings <> old.servings
             or new.prep_min is distinct from old.prep_min or new.cook_min is distinct from old.cook_min
             or new.ingredients <> old.ingredients or new.steps <> old.steps or new.tags <> old.tags
             or new.allergens <> old.allergens or new.collections <> old.collections
             or new.nutrition is distinct from old.nutrition or new.notes <> old.notes
             or new.timeline is distinct from old.timeline or new.archived_at is distinct from old.archived_at then
            raise exception 'Only the person who added this recipe, or a parent, can change it';
          end if;
        end if;
        if new.times_made <> old.times_made and new.times_made <> old.times_made + 1 then raise exception 'That change is not allowed'; end if;
        if new.last_made > current_date + 1 then raise exception 'That change is not allowed'; end if;
      end if;
      if new.photo_path is not null and new.photo_path not like new.family_id::text || '/food/%' then raise exception 'That change is not allowed'; end if;
      if exists (select 1 from unnest(new.collections) c where not exists (
          select 1 from public.food_collections x where x.id = c and x.family_id = new.family_id)) then
        raise exception 'That change is not allowed';
      end if;
      new.updated_at := now();

    when 'food_ratings' then
      if tg_op = 'INSERT' then new.member_id := me; new.created_at := now(); end if;
      if not exists (select 1 from public.food_recipes where id = new.recipe_id and family_id = new.family_id) then
        raise exception 'That change is not allowed';
      end if;

    when 'food_plan' then
      if tg_op = 'INSERT' then
        new.created_by := me; new.created_at := now(); new.cal_event_id := null;
        if not adult then new.status := 'requested'; new.requested_by := me; new.cook := null;
        elsif new.status = 'requested' then new.requested_by := me;
        else new.status := 'planned'; new.requested_by := null;
        end if;
      else
        if new.created_by is distinct from old.created_by or new.requested_by is distinct from old.requested_by
           or new.created_at <> old.created_at then
          raise exception 'That change is not allowed';
        end if;
        if not adult then
          if old.created_by is distinct from me or old.status <> 'requested' or new.status <> old.status
             or new.cook is distinct from old.cook or new.cal_event_id is distinct from old.cal_event_id then
            raise exception 'Ask a grown-up to change the meal plan';
          end if;
        elsif new.status <> old.status and old.status = 'requested' and not parent then
          raise exception 'Only a parent can say yes or no to a request';
        end if;
      end if;
      if new.recipe_id is not null and not exists (select 1 from public.food_recipes where id = new.recipe_id and family_id = new.family_id) then
        raise exception 'That change is not allowed';
      end if;
      if new.leftover_of is not null and not exists (select 1 from public.food_plan where id = new.leftover_of and family_id = new.family_id) then
        raise exception 'That change is not allowed';
      end if;
      if new.takeaway_id is not null and not exists (select 1 from public.food_takeaways where id = new.takeaway_id and family_id = new.family_id) then
        raise exception 'That change is not allowed';
      end if;
      if new.cal_event_id is not null and not exists (select 1 from public.cal_events where id = new.cal_event_id and family_id = new.family_id) then
        raise exception 'That change is not allowed';
      end if;
      if not public.members_in_family(new.family_id, array_remove(new.people || new.cook, null)) then
        raise exception 'Those people are not in this family';
      end if;
      new.updated_at := now();

    when 'food_lunches' then
      new.updated_by := me; new.updated_at := now();
      if tg_op = 'UPDATE' and (new.member_id <> old.member_id or new.day <> old.day) then raise exception 'That change is not allowed'; end if;
      if not public.members_in_family(new.family_id, array[new.member_id]) then raise exception 'That person is not in this family'; end if;

    when 'food_lists' then
      if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); new.archived_at := null;
      elsif new.created_by is distinct from old.created_by then raise exception 'That change is not allowed'; end if;

    when 'food_aisles' then
      null;

    when 'food_known_items' then
      if coalesce(current_setting('luex.foodsys', true), 'off') = 'on' then return new; end if;
      if new.name_key <> old.name_key or new.name <> old.name or new.used_count <> old.used_count
         or new.last_used <> old.last_used or new.barcode is distinct from old.barcode then
        raise exception 'That change is not allowed';
      end if;

    when 'food_list_items' then
      if tg_op = 'INSERT' then
        new.added_by := me; new.created_at := now(); new.done_at := null; new.done_by := null;
        if not exists (select 1 from public.food_lists where id = new.list_id and family_id = new.family_id) then
          raise exception 'That change is not allowed';
        end if;
        if exists (select 1 from unnest(new.recipe_ids) x where not exists (
            select 1 from public.food_recipes rr where rr.id = x and rr.family_id = new.family_id)) then
          raise exception 'That change is not allowed';
        end if;
        -- the aisle this family used last time
        if new.aisle is null then new.aisle := public.food_remember_item(new.family_id, new.name, null, new.unit);
        else perform public.food_remember_item(new.family_id, new.name, new.aisle, new.unit); end if;
      else
        if new.list_id <> old.list_id or new.added_by is distinct from old.added_by or new.created_at <> old.created_at
           or new.recipe_ids <> old.recipe_ids then
          raise exception 'That change is not allowed';
        end if;
        if not adult and old.added_by is distinct from me and (new.name <> old.name or new.quantity is distinct from old.quantity
           or new.unit is distinct from old.unit or new.note <> old.note or new.assignee is distinct from old.assignee
           or new.photo_path is distinct from old.photo_path) then
          raise exception 'Only a grown-up can change someone else''s item';
        end if;
        if new.done_at is distinct from old.done_at then
          if new.done_at is null then new.done_by := null; else new.done_at := now(); new.done_by := me; end if;
        end if;
        -- moving an item to another aisle teaches the family's list where it goes
        if new.aisle is distinct from old.aisle and new.aisle is not null then
          perform set_config('luex.foodsys', 'on', true);
          update public.food_known_items set aisle = new.aisle
            where family_id = new.family_id and name_key = lower(btrim(regexp_replace(new.name, '\s+', ' ', 'g')));
          perform set_config('luex.foodsys', 'off', true);
        end if;
      end if;
      if new.photo_path is not null and new.photo_path not like new.family_id::text || '/food/%' then raise exception 'That change is not allowed'; end if;
      if new.assignee is not null and not public.members_in_family(new.family_id, array[new.assignee]) then
        raise exception 'That person is not in this family';
      end if;

    when 'food_stock' then
      if tg_op = 'INSERT' then new.added_by := me; new.created_at := now(); new.used_up_at := null;
      elsif new.added_by is distinct from old.added_by or new.barcode is distinct from old.barcode
         or new.from_recipe is distinct from old.from_recipe then
        raise exception 'That change is not allowed';
      end if;
      if new.from_recipe is not null and not exists (select 1 from public.food_recipes where id = new.from_recipe and family_id = new.family_id) then
        raise exception 'That change is not allowed';
      end if;
      new.updated_at := now();

    when 'food_takeaways' then
      if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); new.archived_at := null; end if;

    when 'food_takeaway_orders' then
      new.updated_at := now();
      if tg_op = 'UPDATE' and (new.member_id <> old.member_id or new.takeaway_id <> old.takeaway_id) then
        raise exception 'That change is not allowed';
      end if;
      if not exists (select 1 from public.food_takeaways where id = new.takeaway_id and family_id = new.family_id)
         or not public.members_in_family(new.family_id, array[new.member_id]) then
        raise exception 'That change is not allowed';
      end if;

    when 'food_spend' then
      if tg_op = 'INSERT' then new.added_by := me; new.created_at := now(); end if;

    else null;
  end case;
  return new;
end $$;
revoke all on function public.stamp_food_row() from public, anon, authenticated;

create trigger food_settings_stamp before insert or update on public.food_settings for each row execute function public.stamp_food_row();
create trigger food_diary_stamp before insert or update on public.food_diary for each row execute function public.stamp_food_row();
create trigger food_avoid_stamp before insert on public.food_avoid for each row execute function public.stamp_food_row();
create trigger food_collections_stamp before insert or update on public.food_collections for each row execute function public.stamp_food_row();
create trigger food_recipes_stamp before insert or update on public.food_recipes for each row execute function public.stamp_food_row();
create trigger food_ratings_stamp before insert or update on public.food_ratings for each row execute function public.stamp_food_row();
create trigger food_plan_stamp before insert or update on public.food_plan for each row execute function public.stamp_food_row();
create trigger food_lunches_stamp before insert or update on public.food_lunches for each row execute function public.stamp_food_row();
create trigger food_lists_stamp before insert or update on public.food_lists for each row execute function public.stamp_food_row();
create trigger food_aisles_stamp before insert or update on public.food_aisles for each row execute function public.stamp_food_row();
create trigger food_known_items_stamp before update on public.food_known_items for each row execute function public.stamp_food_row();
create trigger food_list_items_stamp before insert or update on public.food_list_items for each row execute function public.stamp_food_row();
create trigger food_stock_stamp before insert or update on public.food_stock for each row execute function public.stamp_food_row();
create trigger food_takeaways_stamp before insert or update on public.food_takeaways for each row execute function public.stamp_food_row();
create trigger food_takeaway_orders_stamp before insert or update on public.food_takeaway_orders for each row execute function public.stamp_food_row();
create trigger food_spend_stamp before insert or update on public.food_spend for each row execute function public.stamp_food_row();

-- ---------------------------------------------------------------- dinner requests: parents hear about them, children hear back

create or replace function public.after_food_plan()
returns trigger language plpgsql security definer set search_path = '' as $$
declare who text; what text; r record;
begin
  what := coalesce(nullif(new.title, ''), (select title from public.food_recipes where id = new.recipe_id), 'a meal');
  if tg_op = 'INSERT' and new.status = 'requested' then
    select display_name into who from public.family_members where id = new.requested_by;
    for r in select id from public.family_members
      where family_id = new.family_id and role = 'parent' and archived_at is null and user_id is not null and id <> new.requested_by
    loop
      perform public.notify(r.id, 'food', who || ' would like ' || what, to_char(new.day, 'FMDay FMDD FMMonth') || ' · tap to say yes or no',
        '/m/food?plan=' || new.id, 'food:req:' || new.family_id, interval '1 minute');
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'requested' and new.status <> 'requested' and new.requested_by is not null then
    perform public.notify(new.requested_by, 'food',
      case when new.status = 'planned' then 'Yes! ' || what || ' is on the plan' else 'Not this time: ' || what end,
      to_char(new.day, 'FMDay FMDD FMMonth'), '/m/food?plan=' || new.id, null, interval '0');
  end if;
  return null;
end $$;
revoke all on function public.after_food_plan() from public, anon, authenticated;
create trigger food_plan_after after insert or update of status on public.food_plan for each row execute function public.after_food_plan();

-- ---------------------------------------------------------------- use-by alerts (run by the schedule each morning)

create or replace function public.queue_food_alerts()
returns integer language plpgsql security definer set search_path = '' as $$
declare f record; r record; names text; n integer := 0; c integer; today date;
begin
  for f in select id, coalesce(timezone, 'Europe/London') as tz from public.families where archived_at is null loop
    today := (now() at time zone f.tz)::date;
    -- once a day, from 08:00 family time
    if (now() at time zone f.tz)::time < '08:00' then continue; end if;
    select string_agg(s.name, ', ' order by s.use_by, s.name), count(*) into names, c
      from public.food_stock s
      where s.family_id = f.id and s.used_up_at is null and s.use_by between today and today + 1
        and not exists (select 1 from public.food_alert_sends x where x.stock_id = s.id and x.day = today);
    if coalesce(c, 0) = 0 then continue; end if;
    insert into public.food_alert_sends (stock_id, day)
      select s.id, today from public.food_stock s
      where s.family_id = f.id and s.used_up_at is null and s.use_by between today and today + 1
      on conflict do nothing;
    for r in select id from public.family_members
      where family_id = f.id and role in ('parent', 'member') and archived_at is null and user_id is not null
    loop
      perform public.notify(r.id, 'food', case when c = 1 then 'Use soon' else c || ' things to use soon' end,
        left(names, 300), '/m/food?tab=stock', null, interval '0');
    end loop;
    n := n + 1;
  end loop;
  return n;
end $$;
create or replace function public.food_tidy_alert_sends()
returns void language sql security definer set search_path = '' as $$
  delete from public.food_alert_sends where day < current_date - 7
$$;
create or replace function public.food_tidy_import_log()
returns void language sql security definer set search_path = '' as $$
  delete from public.food_import_log where at < now() - interval '2 days'
$$;
revoke all on function public.queue_food_alerts(), public.food_tidy_alert_sends(), public.food_tidy_import_log() from public, anon, authenticated;

-- ---------------------------------------------------------------- files (private bucket)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-files', 'food-files', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- <family>/food/<anything>: the family reads; family members add (children only if photos are on for them)
create or replace function public.food_file_ok(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_name, '/');
  uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if parts[1] is null or parts[1] !~ uuid_re or parts[2] is distinct from 'food' or array_length(parts, 1) < 3 then return false; end if;
  if parts[1]::uuid is distinct from public.my_family_id() then return false; end if;
  return not p_write or public.board_allowed(public.my_member_id(), 'photos');
end $$;
create or replace function public.food_file_can_remove(p_name text, p_owner uuid, p_owner_id text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.food_file_ok(p_name, false) then return false; end if;
  return p_owner = (select auth.uid()) or p_owner_id = (select auth.uid())::text
    or public.is_family_parent(split_part(p_name, '/', 1)::uuid);
end $$;
revoke all on function public.food_file_ok(text, boolean), public.food_file_can_remove(text, uuid, text) from public, anon;
grant execute on function public.food_file_ok(text, boolean), public.food_file_can_remove(text, uuid, text) to authenticated;

create policy food_files_read on storage.objects for select to authenticated
  using (bucket_id = 'food-files' and public.food_file_ok(name, false));
create policy food_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'food-files' and public.food_file_ok(name, true));
create policy food_files_remove on storage.objects for delete to authenticated
  using (bucket_id = 'food-files' and public.food_file_can_remove(name, owner, owner_id));

-- ---------------------------------------------------------------- live updates (plain uuid keys only)

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.food_list_items, public.food_lists, public.food_plan,
      public.food_stock, public.food_recipes, public.food_lunches;
  end if;
end $$;
