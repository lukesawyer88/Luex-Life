-- The app no longer sends updated_at for module switches; the database stamps it itself.
create or replace function public.touch_module_row()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger family_modules_touch before insert or update on public.family_modules
  for each row execute function public.touch_module_row();

revoke update (updated_at) on public.family_modules from authenticated;
