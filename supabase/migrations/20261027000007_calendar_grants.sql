-- Family Calendar, part 6 of 7 (grants). See part 1 for the rules.

-- ---------------------------------------------------------------- grants (nothing by default)

revoke all on public.cal_places, public.cal_feeds, public.cal_events, public.cal_event_log, public.cal_comments,
  public.cal_files, public.cal_terms, public.cal_day_notes, public.chores, public.chore_done, public.routines,
  public.routine_steps, public.routine_runs, public.routine_ticks, public.wish_lists, public.wish_items,
  public.wish_claims, public.cal_shares, public.notification_prefs, public.notifications,
  public.push_subscriptions, public.reminder_sends from anon, authenticated;

grant select, delete on public.cal_places to authenticated;
grant insert (family_id, name, address, travel_minutes) on public.cal_places to authenticated;
grant update (name, address, travel_minutes) on public.cal_places to authenticated;

grant select (id, family_id, name, url, type, people, visibility, viewers, active, last_synced_at, last_error, event_count, created_by_member, created_at), delete
  on public.cal_feeds to authenticated;
grant insert (family_id, name, url, type, people, visibility, viewers) on public.cal_feeds to authenticated;
grant update (name, url, type, people, visibility, viewers, active) on public.cal_feeds to authenticated;

grant select on public.cal_events to authenticated;
grant insert (family_id, title, type, all_day, starts_at, ends_at, rrule, exdates, recurrence_of, recurrence_date,
  people, visibility, viewers, driver, place_id, location, travel_minutes, reminders, notes, booking_ref, link, countdown, done_at)
  on public.cal_events to authenticated;
grant update (title, type, all_day, starts_at, ends_at, rrule, exdates, people, visibility, viewers, driver, place_id,
  location, travel_minutes, reminders, notes, booking_ref, link, countdown, done_at, deleted_at)
  on public.cal_events to authenticated;

grant select on public.cal_event_log to authenticated;

grant select on public.cal_comments to authenticated;
grant insert (family_id, event_id, body, photo_path) on public.cal_comments to authenticated;
grant update (deleted_at) on public.cal_comments to authenticated;

grant select, delete on public.cal_files to authenticated;
grant insert (family_id, event_id, path, name, mime, size_bytes) on public.cal_files to authenticated;

grant select, delete on public.cal_terms to authenticated;
grant insert (family_id, name, kind, label, starts_on, ends_on) on public.cal_terms to authenticated;
grant update (name, kind, label, starts_on, ends_on) on public.cal_terms to authenticated;

grant select, delete on public.cal_day_notes to authenticated;
grant insert (family_id, day, body) on public.cal_day_notes to authenticated;
grant update (body) on public.cal_day_notes to authenticated;

grant select, delete on public.chores to authenticated;
grant insert (family_id, title, icon, rrule, starts_on, mode, people, part_of_day, needs_confirm, stars, notes, is_cleaning, active) on public.chores to authenticated;
grant update (title, icon, rrule, starts_on, mode, people, part_of_day, needs_confirm, stars, notes, is_cleaning, active) on public.chores to authenticated;

grant select, delete on public.chore_done to authenticated;
grant insert (family_id, chore_id, due_on, for_member) on public.chore_done to authenticated;
grant update (confirmed_at) on public.chore_done to authenticated;

grant select, delete on public.routines to authenticated;
grant insert (family_id, member_id, name, icon, start_time, days, reward, stars, position, active) on public.routines to authenticated;
grant update (member_id, name, icon, start_time, days, reward, stars, position, active) on public.routines to authenticated;

grant select, delete on public.routine_steps to authenticated;
grant insert (family_id, routine_id, position, title, icon, photo_path, minutes) on public.routine_steps to authenticated;
grant update (position, title, icon, photo_path, minutes) on public.routine_steps to authenticated;

grant select, delete on public.routine_runs to authenticated;
grant insert (family_id, routine_id, run_on) on public.routine_runs to authenticated;
grant update (finished_at) on public.routine_runs to authenticated;

grant select, delete on public.routine_ticks to authenticated;
grant insert (family_id, routine_id, step_id, done_on) on public.routine_ticks to authenticated;

grant select, delete on public.wish_lists to authenticated;
grant insert (family_id, owner_member, occasion, year) on public.wish_lists to authenticated;

grant select on public.wish_items to authenticated;
grant insert (family_id, list_id, title, link, price, notes, priority, position) on public.wish_items to authenticated;
grant update (title, link, price, notes, priority, position, removed_at) on public.wish_items to authenticated;

grant select, delete on public.wish_claims to authenticated;
grant insert (item_id) on public.wish_claims to authenticated;
grant update (bought) on public.wish_claims to authenticated;

-- the share token hash is never readable from the app
grant select (id, family_id, name, kind, people, show_notes, expires_at, revoked_at, last_used_at, created_by_member, created_at)
  on public.cal_shares to authenticated;
grant update (revoked_at) on public.cal_shares to authenticated;

grant select on public.notification_prefs to authenticated;
grant insert (member_id, family_id, changes, reminders, weekly, wishlists) on public.notification_prefs to authenticated;
grant update (changes, reminders, weekly, wishlists) on public.notification_prefs to authenticated;

grant select (id, family_id, member_id, kind, title, body, link, count, created_at, updated_at, read_at) on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

grant select (id, family_id, member_id, user_id, endpoint, user_agent, created_at), delete on public.push_subscriptions to authenticated;

