# Luex Life – Family Calendar feature sheet

Agreed 27 Oct 2026. Module 2 of 15. Research: Cozi, Skylight, Hearth, TimeTree, FamilyWall, OurHome, Google, Apple, Outlook, Homey, Brili, Giftster, Elfster, GiftList.

## Owner's decisions
1. Build every must-have and every niche item. Ultra niche is kept below as a reference list only.
2. Fix every complaint in the complaints list.
3. One calendar screen; chores, routines, reminders and wish lists are tabs inside it.
4. Push notifications only for now (no email or SMS).
5. Calendar sync is import-only at first (two-way later).
6. Wish list security reviewed with Opus 5.5.
7. When a parent adds something, they choose who sees it: everyone, or chosen people. The people an event is for do not see it automatically (surprise parties).
8. Chore tick lives in the calendar; points and the reward shop live in Pocket Money and Rewards (module 6).
9. No assistant for photo-to-event: people attach the photo themselves.
10. Travel time is typed once per place; the app works out "leave by".
11. Weather uses Open-Meteo's free plan for testing; a paid plan is needed before launch.
12. Forward-an-email-to-add is waiting on an email address on the Luex domain.

## Must have
1. One shared calendar with day, week, month and list views.
2. Colour and icon for each event type, with a key; zoomed-out month shows icon dots.
3. Per-person colour and profile picture; filter by person.
4. Add an event in three taps or fewer.
5. Full repeat rules: daily, weekdays, weekly, every N weeks, monthly, every 3 months, yearly, custom; end date or count; change this one, this and after, or all.
6. Reminders per event at several lead times, and a Reminders tab.
7. Who added and who changed each event, a change history, and change alerts (grouped so they don't spam).
8. Roles: parents edit anything they can see; adults and children edit only what they added.
9. Birthdays appear automatically from profiles, with age.
10. Chores with a person, day and repeat; child ticks, parent can confirm; children see today's chores.
11. Daily routines as tickable lists in order.
12. Cleaning rota that rotates between people by itself.
13. School terms and holidays as coloured bands.
14. Wish lists on each birthday and Christmas; claim items; the owner never sees who claimed what; parents get one summary notification when a list changes.
15. Search.
16. Readable text at every zoom.
17. Phone, tablet and big-screen layouts; the page never scrolls.
18. Readable offline.
19. Weekly summary push.
20. No paywall on basics.

## Niche
1. Import Google, Apple and Outlook calendars (import-only first).
2. Attach a photo of a letter, a ticket or a file to an event.
3. Forward an email to add an event (waiting on domain email).
4. Events and tickets: booking reference, link, files.
5. Journey time and "leave by" alerts.
6. Clash warnings (same person, or same driver, at the same time).
7. Who's taking them (driver) on any event.
8. Stars for chores and routines (spent in module 6).
9. Timers inside routines, with "finished early" time.
10. Photos or icons for routine steps.
11. Comments and photos on each event.
12. Private events: parents choose who sees.
13. Kid-friendly "my day" view.
14. Wall display mode for a kitchen tablet.
15. Weather on each day.
16. Print the week.
17. Babysitter view: read-only, time-limited link.
18. Read-only link for people outside the family.
19. Countdowns and seasonal touches (Christmas countdown).
20. Handover notes for a day.

## Ultra niche (reference only, not built)
1. Court-ready co-parenting records.
2. Voice assistants (Alexa, Siri).
3. Smart-home triggers.
4. Location tracking of family members.
5. Several households in one account.
6. Time-zone-aware shift patterns.
7. Moon phases, religious or lunar calendars.
8. Watches and wearables.
9. Detailed time-blocking of tasks.
10. Public fixture subscriptions beyond a simple import link.

## Complaints and fixes
1. Children delete shared events (Cozi) – only parents edit others' events.
2. Edits wiped by "somebody made changes" (Cozi) – each save sends only the changed fields; real clashes ask which to keep.
3. Paid plan only covers one person (Cozi) – one price covers the family.
4. Ads (Cozi, TimeTree) – no ads.
5. Hard-to-read month view (Cozi) – colour plus icon, large text.
6. Reminders not arriving or too many (Cozi) – push with per-person settings.
7. Search behind a paywall (Cozi) – search is free.
8. Limited repeat options (TimeTree) – full repeat rules.
9. Hardware plus subscription (Skylight, Hearth) – software only, any old tablet can be the wall screen.
10. Slow support (Skylight) – a support route before launch (business task).
11. Sync failures (Skylight) – import shows when it last worked and why it failed.
12. Silent edits (Google) – change alerts with who and when.
13. Apple-only (Apple) – web app on every device.
14. Too many options (Homey, Brili) – sensible defaults, settings optional.
15. Kids tick without doing (Brili) – parent confirm per chore.
16. Wish list apps show who bought what, or need accounts (Giftster, Elfster) – claims hidden from the list owner.

## Gaps owned by other modules
1. Pocket money, stars spending, reward shop – Pocket Money and Rewards.
2. Meals and shopping lists – Food.
3. School timetable and clubs – School and Activities (feeds the calendar).
4. Appointments and vaccinations – Family Health (dates only).
5. MOT, insurance, renewals – Cars and Renewals.
6. Holiday plans – Trips and Holidays.
7. Bookings – Bookings and Hosting.
8. Emergency cards – Contacts and Emergency.
9. Messages and photos – Family Board.
10. Gift budgets – Household Money.

## Build status (27 Oct 2026)
Built and live. Every must-have and niche item is in, except forwarding an email to add an event (waiting on a domain email address).

Checks: 158 database security checks (locally, against an identical copy of the live rules), 11 live checks, 20 journey tests (parent, child, grandparent), 90 one-screen checks at phone, tablet and laptop size, 14 unit tests. Two independent security reviews found 13 problems; all fixed before go-live.

Running on the server: push notifications (every minute: reminders, "leave now", grouped change alerts, wish list summaries, Sunday 18:00 weekly summary) and calendar import (every 10 minutes, plus "Sync now").

Still to check on real phones: notifications arriving, camera uploads, offline opening, kitchen-screen mode.
