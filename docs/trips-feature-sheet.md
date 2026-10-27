# Luex Life – Trips and Holidays feature sheet

Agreed 27 Oct 2026. Module 11 (everyone; second release). Owner said "just build, and we'll sort the logistics out after it's all built", so this follows the simple-first rules with no separate research round; open questions are listed at the end.

## Decisions
1. Simple on purpose: plan a trip, pack, and don't forget anything before you go.
2. A trip is an ordinary Calendar "trip or holiday" event: the dates, who's going, where and the countdown live there (one place for dates). Trips adds packing, before-we-go jobs, the plans and ideas for days out.
3. Nothing is connected to airlines, hotels or booking sites: plans are typed in (what, when, reference, where).
4. Everyone who can see the trip's Calendar event sees the trip (a private event keeps the trip private). Grown-ups plan; everyone packs and ticks their own things; children add and tick their own packing.
5. Push notifications only.

## Built
1. Trips: name, where, dates, who's going and an emoji; on the Calendar with a countdown.
2. Packing: each person's own list and a shared list, with ready-made lists to add in one tap (essentials, beach, cold weather, baby and toddler, gadgets).
3. Before we go: ready-made jobs (passports, travel insurance, pets, plants, post, bins, chargers, currency), ticked by any grown-up.
4. Plans: travel, places to stay, car hire and activities, each with when, reference and where.
5. Passport check: a warning when a traveller's passport in Documents runs out within six months of coming home (seen only by those who can see the passport).
6. "Two days to go" message at 6pm, to whoever's going, with what's still to pack or do.
7. Ideas for days out: anyone (children too) adds an idea, with where and a link; ticked when done.
8. A countdown card on Home for the next trip.

## Not built (could be added later)
1. Sharing a trip with people outside the household.
2. Holiday spending (Money handles budgets).
3. Saving tickets and boarding passes as files (Documents can hold them).
4. Day-by-day itinerary planning.

## Questions to settle after the build
1. Settled: parents choose on each trip whether children see the plans (on by default).
2. Settled: parents choose when the reminder comes (off, or 1 to 3 days before; 2 by default).

## Build status (27 Oct 2026)
Built, tested and live (27 Oct 2026): database changes applied, reminders scheduled, live checks passed (rolled back), page and Home card switched on.

Checks: 39 Trips database checks (every other module's checks still passing), 60 one-screen checks (two parents, a child and a grandparent at phone, tablet and laptop size), 18 journey tests (adding a trip that goes on the Calendar with a countdown, the passport warning, packing for each person with a ready-made beach list, the before-we-go jobs, a flight with its time and reference, a child ticking and adding their own packing, ideas for days out, the Home card).

Security review (Fable 5.1) fixes: a trip can only sit on a Calendar event a grown-up added (so a child can't change or remove it through their own event); a trip disappears with its Calendar event, or if the event stops being a trip; removed items stay removed; "Change" shows only to a parent or whoever added the event (the Calendar's own rule), and a clash with someone else's Calendar edit says so instead of overwriting it.

Parents' choices added and live (27 Oct 2026): "Children can see the plans" and the reminder timing on each trip. 44 database checks, 20 journey tests.
