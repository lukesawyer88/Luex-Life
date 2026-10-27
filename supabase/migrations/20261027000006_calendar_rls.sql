-- Family Calendar, part 5 of 7 (rls). See part 1 for the rules.

-- ---------------------------------------------------------------- RLS

alter table public.cal_places enable row level security;
alter table public.cal_feeds enable row level security;
alter table public.cal_events enable row level security;
alter table public.cal_event_log enable row level security;
alter table public.cal_comments enable row level security;
alter table public.cal_files enable row level security;
alter table public.cal_terms enable row level security;
alter table public.cal_day_notes enable row level security;
alter table public.chores enable row level security;
alter table public.chore_done enable row level security;
alter table public.routines enable row level security;
alter table public.routine_steps enable row level security;
alter table public.routine_runs enable row level security;
alter table public.routine_ticks enable row level security;
alter table public.wish_lists enable row level security;
alter table public.wish_items enable row level security;
alter table public.wish_claims enable row level security;
alter table public.cal_shares enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_sends enable row level security;

-- places: everyone reads; adults add and change; parents remove
create policy places_read on public.cal_places for select to authenticated using (public.is_family_member(family_id));
create policy places_add on public.cal_places for insert to authenticated with check (public.is_family_adult(family_id));
create policy places_change on public.cal_places for update to authenticated using (public.is_family_adult(family_id)) with check (public.is_family_adult(family_id));
create policy places_remove on public.cal_places for delete to authenticated using (public.is_family_parent(family_id));

-- imports: parents only (the link is private)
create policy feeds_read on public.cal_feeds for select to authenticated using (public.is_family_parent(family_id) and (visibility = 'all' or created_by_member = (select public.my_member_id()) or (select public.my_member_id()) = any(viewers)));
create policy feeds_add on public.cal_feeds for insert to authenticated with check (public.is_family_parent(family_id));
create policy feeds_change on public.cal_feeds for update to authenticated
  using (public.is_family_parent(family_id) and (visibility = 'all' or created_by_member = (select public.my_member_id()) or (select public.my_member_id()) = any(viewers)))
  with check (public.is_family_parent(family_id) and (visibility = 'all' or created_by_member = (select public.my_member_id()) or (select public.my_member_id()) = any(viewers)));
create policy feeds_remove on public.cal_feeds for delete to authenticated using (public.is_family_parent(family_id) and (visibility = 'all' or created_by_member = (select public.my_member_id()) or (select public.my_member_id()) = any(viewers)));

-- events: you see everyone's events except ones a parent has kept to chosen people
create policy events_read on public.cal_events for select to authenticated using (
  public.is_family_member(family_id)
  and (visibility = 'all' or created_by_member = (select public.my_member_id()) or (select public.my_member_id()) = any(viewers))
  and (recurrence_of is null or public.can_see_event(recurrence_of)));
create policy events_add on public.cal_events for insert to authenticated with check (
  public.is_family_member(family_id)
  and (visibility = 'all' or created_by_member = (select public.my_member_id()) or (select public.my_member_id()) = any(viewers)));
-- parents change anything they can see; everyone else only what they added
create policy events_change on public.cal_events for update to authenticated
  using (public.is_family_member(family_id)
    and (visibility = 'all' or created_by_member = (select public.my_member_id()) or (select public.my_member_id()) = any(viewers))
    and (public.is_family_parent(family_id) or created_by_member = (select public.my_member_id())))
  with check (public.is_family_member(family_id)
    and (visibility = 'all' or created_by_member = (select public.my_member_id()) or (select public.my_member_id()) = any(viewers))
    and (public.is_family_parent(family_id) or created_by_member = (select public.my_member_id())));

create policy event_log_read on public.cal_event_log for select to authenticated using (public.can_see_event(event_id));

create policy comments_read on public.cal_comments for select to authenticated using (public.can_see_event(event_id));
create policy comments_add on public.cal_comments for insert to authenticated with check (public.can_see_event(event_id) and public.is_family_member(family_id));
create policy comments_remove on public.cal_comments for update to authenticated
  using (public.can_see_event(event_id) and (member_id = (select public.my_member_id()) or public.is_family_parent(family_id)))
  with check (public.can_see_event(event_id) and (member_id = (select public.my_member_id()) or public.is_family_parent(family_id)));

create policy files_read on public.cal_files for select to authenticated using (public.can_see_event(event_id));
create policy files_add on public.cal_files for insert to authenticated with check (public.can_see_event(event_id) and public.is_family_member(family_id));
create policy files_remove on public.cal_files for delete to authenticated
  using (public.can_see_event(event_id) and (created_by_member = (select public.my_member_id()) or public.is_family_parent(family_id)));

create policy terms_read on public.cal_terms for select to authenticated using (public.is_family_member(family_id));
create policy terms_add on public.cal_terms for insert to authenticated with check (public.is_family_parent(family_id));
create policy terms_change on public.cal_terms for update to authenticated using (public.is_family_parent(family_id)) with check (public.is_family_parent(family_id));
create policy terms_remove on public.cal_terms for delete to authenticated using (public.is_family_parent(family_id));

create policy notes_read on public.cal_day_notes for select to authenticated using (public.is_family_member(family_id));
create policy notes_add on public.cal_day_notes for insert to authenticated with check (public.is_family_adult(family_id));
create policy notes_change on public.cal_day_notes for update to authenticated using (public.is_family_adult(family_id)) with check (public.is_family_adult(family_id));
create policy notes_remove on public.cal_day_notes for delete to authenticated using (public.is_family_adult(family_id));

create policy chores_read on public.chores for select to authenticated using (public.is_family_member(family_id));
create policy chores_add on public.chores for insert to authenticated with check (public.is_family_parent(family_id));
create policy chores_change on public.chores for update to authenticated using (public.is_family_parent(family_id)) with check (public.is_family_parent(family_id));
create policy chores_remove on public.chores for delete to authenticated using (public.is_family_parent(family_id));

create policy chore_done_read on public.chore_done for select to authenticated using (public.is_family_member(family_id));
create policy chore_done_add on public.chore_done for insert to authenticated with check (public.is_family_member(family_id));
create policy chore_done_confirm on public.chore_done for update to authenticated using (public.is_family_parent(family_id)) with check (public.is_family_parent(family_id));
-- untick: a parent any time; anyone else only their own tick that hasn't been confirmed by a parent
create policy chore_done_remove on public.chore_done for delete to authenticated using (
  public.is_family_parent(family_id)
  or (public.is_family_member(family_id) and done_by = (select public.my_member_id()) and (confirmed_by is null or confirmed_by = (select public.my_member_id()))));

create policy routines_read on public.routines for select to authenticated using (public.is_family_member(family_id));
create policy routines_add on public.routines for insert to authenticated with check (public.is_family_parent(family_id));
create policy routines_change on public.routines for update to authenticated using (public.is_family_parent(family_id)) with check (public.is_family_parent(family_id));
create policy routines_remove on public.routines for delete to authenticated using (public.is_family_parent(family_id));

create policy steps_read on public.routine_steps for select to authenticated using (public.is_family_member(family_id));
create policy steps_add on public.routine_steps for insert to authenticated with check (public.is_family_parent(family_id));
create policy steps_change on public.routine_steps for update to authenticated using (public.is_family_parent(family_id)) with check (public.is_family_parent(family_id));
create policy steps_remove on public.routine_steps for delete to authenticated using (public.is_family_parent(family_id));

create policy runs_read on public.routine_runs for select to authenticated using (public.is_family_member(family_id));
create policy runs_add on public.routine_runs for insert to authenticated with check (public.is_family_member(family_id) and public.can_do_routine(routine_id));
create policy runs_change on public.routine_runs for update to authenticated
  using (public.can_do_routine(routine_id)) with check (public.can_do_routine(routine_id));
create policy runs_remove on public.routine_runs for delete to authenticated using (public.is_family_parent(family_id));

create policy ticks_read on public.routine_ticks for select to authenticated using (public.is_family_member(family_id));
create policy ticks_add on public.routine_ticks for insert to authenticated with check (public.is_family_member(family_id) and public.can_do_routine(routine_id));
create policy ticks_remove on public.routine_ticks for delete to authenticated using (public.can_do_routine(routine_id));

create policy wish_lists_read on public.wish_lists for select to authenticated using (public.is_family_member(family_id));
create policy wish_lists_add on public.wish_lists for insert to authenticated with check (
  public.is_family_member(family_id) and (owner_member = (select public.my_member_id()) or public.is_family_parent(family_id)));
create policy wish_lists_remove on public.wish_lists for delete to authenticated using (public.can_edit_wish_list(id));

create policy wish_items_read on public.wish_items for select to authenticated using (public.is_family_member(family_id));
create policy wish_items_add on public.wish_items for insert to authenticated with check (public.is_family_member(family_id) and public.can_edit_wish_list(list_id));
create policy wish_items_change on public.wish_items for update to authenticated
  using (public.can_edit_wish_list(list_id)) with check (public.can_edit_wish_list(list_id));

-- the heart of the surprise: the list's owner can never read, add or change claims on it
create policy wish_claims_read on public.wish_claims for select to authenticated using (
  public.is_family_member(family_id) and not public.owns_wish_list(list_id));
create policy wish_claims_add on public.wish_claims for insert to authenticated with check (
  public.is_family_member(family_id) and not public.owns_wish_list(list_id));
create policy wish_claims_change on public.wish_claims for update to authenticated
  using (claimed_by = (select public.my_member_id()) and not public.owns_wish_list(list_id))
  with check (claimed_by = (select public.my_member_id()) and not public.owns_wish_list(list_id));
create policy wish_claims_remove on public.wish_claims for delete to authenticated using (
  not public.owns_wish_list(list_id) and (claimed_by = (select public.my_member_id()) or public.is_family_parent(family_id)));

create or replace function public.guard_share_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.revoked_at is not null or new.revoked_at is null then raise exception 'That change is not allowed'; end if;
  new.revoked_at := now();
  return new;
end $$;
create trigger cal_shares_guard before update of revoked_at on public.cal_shares for each row execute function public.guard_share_change();

create policy shares_read on public.cal_shares for select to authenticated using (public.is_family_parent(family_id));
create policy shares_change on public.cal_shares for update to authenticated using (public.is_family_parent(family_id)) with check (public.is_family_parent(family_id));

create policy prefs_read on public.notification_prefs for select to authenticated using (member_id = (select public.my_member_id()));
create policy prefs_add on public.notification_prefs for insert to authenticated with check (member_id = (select public.my_member_id()) and family_id = public.my_family_id());
create policy prefs_change on public.notification_prefs for update to authenticated
  using (member_id = (select public.my_member_id())) with check (member_id = (select public.my_member_id()) and family_id = public.my_family_id());

create policy notifications_read on public.notifications for select to authenticated using (member_id = (select public.my_member_id()));
create policy notifications_mark on public.notifications for update to authenticated
  using (member_id = (select public.my_member_id())) with check (member_id = (select public.my_member_id()));

create policy push_read on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_remove on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
-- reminder_sends: no policies (service only)

