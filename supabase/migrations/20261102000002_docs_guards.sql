-- Documents and Papers, part 2 of 3 (guards, the starter folders, expiry reminders, the files).

-- a page must be a real file in the right folder: <family>/docs/s/<file> (household) or <family>/docs/p/<owner>/<file> ("just mine")
-- and each page belongs to one paper only (removing a paper deletes its pages)
create or replace function public.doc_pages_ok(f uuid, priv uuid, doc uuid, pages text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select cardinality(pages) = (select count(distinct p) from unnest(pages) p)
    and not exists (
    select 1 from unnest(pages) p
    where p !~ ('^' || f::text || case when priv is null then '/docs/s/' else '/docs/p/' || priv::text || '/' end
                || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|pdf)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'doc-files' and o.name = p)
       or exists (select 1 from public.documents d where d.id <> doc and d.deleted_at is null and p = any (d.pages)))
$$;
revoke all on function public.doc_pages_ok(uuid, uuid, uuid, text[]) from public, anon, authenticated;

create or replace function public.stamp_doc_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id(); parent boolean;
begin
  if (select auth.uid()) is null then return new; end if;
  if new.family_id is distinct from public.my_family_id() then raise exception 'That change is not allowed'; end if;
  if tg_op = 'UPDATE' and new.family_id <> old.family_id then raise exception 'That change is not allowed'; end if;
  if tg_table_name = 'doc_folders' then return new; end if;

  parent := public.is_family_parent(new.family_id);
  if tg_op = 'INSERT' then
    -- grown-ups who aren't parents only keep their own papers
    if new.private_to is not null and new.private_to <> me then raise exception 'You can only keep papers private to yourself'; end if;
    if not parent then new.private_to := me; end if;
    new.created_by := me; new.created_at := now(); new.deleted_at := null;
  else
    if new.private_to is distinct from old.private_to or new.created_by is distinct from old.created_by then
      raise exception 'That change is not allowed';
    end if;
    if new.deleted_at is not null and old.deleted_at is null then new.deleted_at := now(); end if;
  end if;
  new.updated_at := now();
  if new.folder_id is not null and not exists (select 1 from public.doc_folders where id = new.folder_id and family_id = new.family_id) then
    raise exception 'That change is not allowed';
  end if;
  -- checked when it changes (someone who has since left keeps their old papers editable)
  if new.person_id is not null and (tg_op = 'INSERT' or new.person_id is distinct from old.person_id) then
    if not public.members_in_family(new.family_id, array[new.person_id]) then raise exception 'Pick someone in this household'; end if;
    -- a private paper can only be about yourself
    if new.private_to is not null and new.person_id <> new.private_to then raise exception 'Private papers can only be about you'; end if;
  end if;
  if new.deleted_at is not null and tg_op = 'UPDATE' and old.deleted_at is not null then raise exception 'That change is not allowed'; end if;
  if (tg_op = 'INSERT' or new.pages is distinct from old.pages) and not public.doc_pages_ok(new.family_id, new.private_to, new.id, new.pages) then
    raise exception 'Add the photo again';
  end if;
  return new;
end $$;
revoke all on function public.stamp_doc_row() from public, anon, authenticated;
create trigger doc_folders_stamp before insert or update on public.doc_folders for each row execute function public.stamp_doc_row();
create trigger documents_stamp before insert or update on public.documents for each row execute function public.stamp_doc_row();

-- removing a paper (the app deletes its pages; the row goes for good the next night)
create or replace function public.doc_remove(p_doc uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.documents set deleted_at = now(), updated_at = now()
  where id = p_doc and deleted_at is null and public.doc_ok(family_id, private_to);
  if not found then raise exception 'That change is not allowed'; end if;
end $$;
revoke all on function public.doc_remove(uuid) from public, anon;
grant execute on function public.doc_remove(uuid) to authenticated;

-- the first visit: everyday folders
create or replace function public.doc_setup()
returns void language plpgsql security definer set search_path = '' as $$
declare f uuid := public.my_family_id(); x record;
begin
  if f is null or not public.is_family_adult(f) then raise exception 'That change is not allowed'; end if;
  if exists (select 1 from public.doc_folders where family_id = f) then return; end if;
  for x in select * from (values
    ('ID and passports', '🛂', 1), ('House', '🏠', 2), ('Car', '🚗', 3), ('Insurance', '🛡️', 4), ('Money and bank', '💷', 5),
    ('Health', '🩺', 6), ('School', '🎒', 7), ('Work', '💼', 8), ('Pets', '🐾', 9), ('Other', '📁', 10)
  ) as t(name, emoji, pos) loop
    insert into public.doc_folders (family_id, name, emoji, position) values (f, x.name, x.emoji, x.pos);
  end loop;
end $$;
revoke all on function public.doc_setup() from public, anon;
grant execute on function public.doc_setup() to authenticated;

-- ---------------------------------------------------------------- expiry reminders (once per document and date, from 8am family time)

create or replace function public.queue_doc_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare f record; d record; v uuid; today date; n integer := 0; who text;
begin
  for f in select id, coalesce(timezone, 'Europe/London') as tz from public.families where archived_at is null loop
    if (now() at time zone f.tz)::time < '08:00' then continue; end if;
    today := (now() at time zone f.tz)::date;
    for d in select * from public.documents where family_id = f.id and deleted_at is null and expires_on is not null
               and expires_on between today and today + remind_days loop
      -- the first reminder is keyed by the date it runs out; a last one a week before (when the first came earlier)
      insert into public.doc_sends (document_id, for_date) values (d.id, d.expires_on) on conflict do nothing;
      if not found then
        if d.remind_days <= 7 or d.expires_on - today > 7 then continue; end if;
        insert into public.doc_sends (document_id, for_date) values (d.id, d.expires_on - 7) on conflict do nothing;
        if not found then continue; end if;
      elsif d.expires_on - today <= 7 then
        insert into public.doc_sends (document_id, for_date) values (d.id, d.expires_on - 7) on conflict do nothing;
      end if;
      select display_name into who from public.family_members where id = d.person_id;
      for v in select id from public.family_members where family_id = f.id and archived_at is null and user_id is not null
                 and ((d.private_to is null and role = 'parent') or id = d.private_to) loop
        perform public.notify(v, 'docs', 'Runs out soon: ' || d.title || coalesce(' (' || who || ')', ''),
          'On ' || to_char(d.expires_on, 'FMDD FMMonth YYYY') || '. Time to renew', '/m/documents?doc=' || d.id, null, interval '0');
      end loop;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.queue_doc_reminders() from public, anon, authenticated;

create or replace function public.doc_tidy_sends()
returns void language sql security definer set search_path = '' as $$
  delete from public.doc_sends where for_date < current_date - 30
$$;

-- removed papers are deleted for good the next night (their pages were deleted when removed)
create or replace function public.doc_tidy_removed()
returns void language sql security definer set search_path = '' as $$
  delete from public.documents where deleted_at < now() - interval '1 day'
$$;
revoke all on function public.doc_tidy_removed() from public, anon, authenticated;
revoke all on function public.doc_tidy_sends() from public, anon, authenticated;

-- ---------------------------------------------------------------- the files (private bucket)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('doc-files', 'doc-files', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- <family>/docs/s/<file>: parents; <family>/docs/p/<owner>/<file>: that grown-up only
create or replace function public.doc_file_ok(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_name, '/');
  uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  f uuid;
begin
  if parts[1] is null or parts[1] !~ uuid_re or parts[2] is distinct from 'docs' then return false; end if;
  f := parts[1]::uuid;
  if f is distinct from public.my_family_id() or not public.is_family_adult(f) then return false; end if;
  if p_write and public.food_bytes_used(f) >= public.board_allowance() then return false; end if;
  if p_name ~ '/\.|//' then return false; end if;
  if parts[3] = 's' and array_length(parts, 1) = 4 and parts[4] <> '' then return public.is_family_parent(f); end if;
  if parts[3] = 'p' and array_length(parts, 1) = 5 and parts[4] = public.my_member_id()::text and parts[5] <> '' then return true; end if;
  return false;
end $$;
revoke all on function public.doc_file_ok(text, boolean) from public, anon;
grant execute on function public.doc_file_ok(text, boolean) to authenticated;

-- the family's space: every module's files together
create or replace function public.food_bytes_used(f uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint from storage.objects o
  where o.bucket_id in ('board-media', 'food-files', 'money-files', 'reward-files', 'school-files', 'doc-files') and o.name like f::text || '/%'
$$;
revoke all on function public.food_bytes_used(uuid) from public, anon, authenticated;

create policy doc_files_read on storage.objects for select to authenticated
  using (bucket_id = 'doc-files' and public.doc_file_ok(name, false));
create policy doc_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'doc-files' and public.doc_file_ok(name, true));
create policy doc_files_remove on storage.objects for delete to authenticated
  using (bucket_id = 'doc-files' and public.doc_file_ok(name, false));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.documents;
  end if;
end $$;
