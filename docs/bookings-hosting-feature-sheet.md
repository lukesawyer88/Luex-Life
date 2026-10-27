# Luex Life – Bookings and Hosting feature sheet

Agreed 27 Oct 2026. Module 12 (everyone; second release). Built under "just build, and we'll sort the logistics out after it's all built", so it follows the simple-first rules with no separate research round; open questions are listed at the end.

## Decisions
1. Simple on purpose: who's coming, what to get, who's doing what, and the booking reference to hand.
2. Hosting a party, a dinner or a visit is an ordinary Calendar "party or visit" event: the date, time and place live there (one place for dates). Hosting adds the guest list and two lists (to get, to do).
3. Bookings stores nothing new: any Calendar event with a booking reference (a restaurant, lessons, the car wash) shows in the Bookings tab with the reference to copy.
4. Nothing is connected to booking sites, invitations apps or payment.
5. Everyone who can see the Calendar event sees the plan (a private event keeps it private). Grown-ups plan; children see the plan and tick jobs given to them.
6. Push notifications only.

## Built
1. Plans: name, day, from and until, where, and who's hosting; on the Calendar.
2. Guests: name, how many people, coming / maybe / invited / can't come, and anything they can't eat. The food to think about is gathered in one box.
3. To get: a shopping list for the party.
4. To do: jobs, each optionally given to someone, who is told straight away.
5. A message the evening before (6pm) to the hosts: how many are coming and what's still to get or do.
6. Bookings: every upcoming Calendar event with a booking reference, with a copy button and a link to the event.
7. A Home card for a party or visit in the next week.

## Not built (could be added later)
1. Sending invitations or collecting replies from guests outside the household.
2. Moving the "to get" list into the Food shopping list.
3. Party budgets (Money handles budgets).
4. Turning an existing Calendar party into a plan (for now, plan it from here), or dropping a plan but keeping the event.

## Questions to settle after the build
1. Should "to get" items go straight onto the Food shopping list instead of a separate list?
2. Should the evening-before message also go to anyone given a job that isn't done?
3. Is a week ahead the right time for the Home card to appear?

## Build status (27 Oct 2026)
Built and tested; not live yet.

Checks: 32 Hosting database checks (every other module's checks still passing), 60 one-screen checks (two parents, a child and a grandparent at phone, tablet and laptop size), 14 journey tests (planning a party that goes on the Calendar, a guest with numbers and dietary needs, the food summary, a shopping item, a job given to Mia who is told, Mia ticking it, a grandparent not offered Change, a booked table with its reference, the Home card).

Security review (Fable 5.1): the Trips fixes hold for Hosting. Also fixed: a job only goes to someone who can sign in and see the plan; only jobs (not things to get) are given to people; plans can't sit on repeating Calendar events (use a single date); repeating bookings (weekly lessons) show with their next date; changing who has a job doesn't send a burst of messages; children listed on the Calendar event stay on it when the hosts change.
