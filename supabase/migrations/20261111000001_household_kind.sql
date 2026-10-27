-- Who lives here: just me, a couple, flatmates or a family. It sets which modules start switched on and the words
-- the app uses ("household" rather than "family", "organiser" rather than "parent"). Parents change it in Settings.
alter table public.families
  add column household_kind text not null default 'family' check (household_kind in ('solo', 'couple', 'flatmates', 'family'));
grant update (household_kind) on public.families to authenticated;

-- Switching a module or an extra on or off saves with an "insert, or update if it's there" call, which names every
-- column; without these the save was refused. Moving a row to another household is still blocked by the policy
-- (a parent of both is impossible), and renaming a row's key only touches your own household's switches.
grant update (family_id, module_key) on public.family_modules to authenticated;
