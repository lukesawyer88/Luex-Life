-- Contacts and Emergency, part 2 of 3 (guards, babysitter links, the twice-a-year check).

create or replace function public.stamp_em_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_member_id();
begin
  if (select auth.uid()) is null then return new; end if;
  if new.family_id is distinct from public.my_family_id() then raise exception 'That change is not allowed'; end if;
  if tg_op = 'UPDATE' and new.family_id <> old.family_id then raise exception 'That change is not allowed'; end if;

  if tg_table_name = 'em_contacts' then
    if tg_op = 'INSERT' then new.created_by := me; new.created_at := now(); new.deleted_at := null;
    elsif new.created_by is distinct from old.created_by then raise exception 'That change is not allowed';
    elsif new.deleted_at is not null and old.deleted_at is null then new.deleted_at := now(); end if;
    new.updated_at := now();
  elsif tg_table_name = 'em_cards' then
    if tg_op = 'UPDATE' and (new.member_id is distinct from old.member_id) then raise exception 'That change is not allowed'; end if;
    if tg_op = 'INSERT' then new.deleted_at := null; end if;
    -- only pets' cards are removed (a person's card is just emptied)
    if new.deleted_at is not null and new.member_id is not null then raise exception 'That change is not allowed'; end if;
    if tg_op = 'UPDATE' and new.deleted_at is not null and old.deleted_at is null then new.deleted_at := now(); end if;
    if new.member_id is not null and not exists (select 1 from public.family_members where id = new.member_id and family_id = new.family_id) then
      raise exception 'Pick someone in this household';
    end if;
    new.updated_by := me; new.updated_at := now();
  elsif tg_table_name = 'em_conditions' then
    if tg_op = 'UPDATE' and new.card_id <> old.card_id then raise exception 'That change is not allowed'; end if;
    if not exists (select 1 from public.em_cards where id = new.card_id and family_id = new.family_id) then raise exception 'That change is not allowed'; end if;
    update public.em_cards set updated_at = now(), updated_by = me where id = new.card_id;
  elsif tg_table_name = 'em_home' then
    new.updated_by := me; new.updated_at := now();
  end if;
  return new;
end $$;
revoke all on function public.stamp_em_row() from public, anon, authenticated;
create trigger em_contacts_stamp before insert or update on public.em_contacts for each row execute function public.stamp_em_row();
create trigger em_cards_stamp before insert or update on public.em_cards for each row execute function public.stamp_em_row();
create trigger em_conditions_stamp before insert or update on public.em_conditions for each row execute function public.stamp_em_row();
create trigger em_home_stamp before insert or update on public.em_home for each row execute function public.stamp_em_row();

-- ---------------------------------------------------------------- babysitter links

create or replace function public.em_create_share(p_name text, p_days integer)
returns text language plpgsql security definer set search_path = '' as $$
declare fid uuid := public.my_family_id(); tok text;
begin
  if fid is null or not public.is_family_parent(fid) then raise exception 'Only a parent can share this'; end if;
  if p_days is null or p_days < 1 or p_days > 31 then raise exception 'Choose how long the link lasts (up to a month)'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 60 then raise exception 'Give the link a name'; end if;
  if (select count(*) from public.em_shares where family_id = fid and revoked_at is null and expires_at > now()) >= 10 then
    raise exception 'Too many open links. Stop some first';
  end if;
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.em_shares (family_id, name, token_hash, expires_at, created_by)
    values (fid, trim(p_name), encode(extensions.digest(tok, 'sha256'), 'hex'), now() + make_interval(days => p_days), public.my_member_id());
  return tok;
end $$;
revoke all on function public.em_create_share(text, integer) from public, anon;
grant execute on function public.em_create_share(text, integer) to authenticated;

-- what a babysitter link shows (no sign-in): the children's and pets' cards, who to call, the home essentials and bedtimes.
-- Grown-ups' cards are never in it; the Wi-Fi only when ticked; hidden conditions never.
create or replace function public.em_shared(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.em_shares%rowtype; f public.families%rowtype; h public.em_home%rowtype;
begin
  select * into s from public.em_shares
    where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and revoked_at is null and expires_at > now();
  if not found then return null; end if;
  select * into f from public.families where id = s.family_id;
  -- the family must still exist and the parent who made the link must still be a parent in it
  if f.archived_at is not null or not exists (select 1 from public.family_members where id = s.created_by
       and family_id = f.id and role = 'parent' and archived_at is null) then
    return null;
  end if;
  update public.em_shares set last_used_at = now() where id = s.id;
  select * into h from public.em_home where family_id = f.id;
  return jsonb_build_object(
    'family', f.name,
    'name', s.name,
    'expires_at', s.expires_at,
    'home', jsonb_build_object(
      'address', h.address, 'stopcock', h.stopcock, 'fuse_box', h.fuse_box, 'gas_meter', h.gas_meter,
      'first_aid', h.first_aid, 'spare_key', h.spare_key, 'meet_point', h.meet_point, 'plan', h.plan, 'bedtimes', h.bedtimes,
      'wifi_name', case when h.wifi_in_link then h.wifi_name end, 'wifi_password', case when h.wifi_in_link then h.wifi_password end),
    'call', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'phone', c.phone, 'phone2', c.phone2, 'notes', c.notes) order by c.call_order)
      from public.em_contacts c where c.family_id = f.id and c.deleted_at is null and c.call_order is not null), '[]'::jsonb),
    'cards', coalesce((select jsonb_agg(jsonb_build_object(
        'name', coalesce(m.display_name, k.pet_name), 'pet', k.member_id is null, 'colour', m.colour, 'birthday', m.birthday,
        'allergies', k.allergies, 'medicines', k.medicines, 'blood_group', k.blood_group, 'doctor', k.doctor, 'doctor_phone', k.doctor_phone,
        'microchip', k.microchip, 'insurer', k.insurer, 'notes', k.notes,
        'conditions', case when x.shared then x.conditions end)
        order by k.member_id is null, m.display_name, k.pet_name)
      from public.em_cards k
      left join public.family_members m on m.id = k.member_id
      left join public.em_conditions x on x.card_id = k.id
      where k.family_id = f.id and k.deleted_at is null
        and (k.member_id is null or (m.role = 'child' and m.archived_at is null))), '[]'::jsonb)
  );
end $$;
revoke all on function public.em_shared(text) from public;
grant execute on function public.em_shared(text) to anon, authenticated;

-- ---------------------------------------------------------------- the twice-a-year check (April and October)

create or replace function public.em_checkup()
returns integer language plpgsql security definer set search_path = '' as $$
declare v uuid; n integer := 0;
begin
  for v in select m.id from public.family_members m join public.families f on f.id = m.family_id
           where f.archived_at is null and m.archived_at is null and m.user_id is not null and m.role in ('parent', 'member') loop
    perform public.notify(v, 'emergency', 'Are your emergency details still right?',
      'Two minutes: check who to call, medicines and allergies', '/m/contacts', null, interval '0');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.em_checkup() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.em_contacts, public.em_cards, public.em_home;
  end if;
end $$;
