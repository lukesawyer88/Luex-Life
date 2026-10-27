# Luex Life – Home Care feature sheet

Agreed 27 Oct 2026. Module 10 of 15 (everyone; second release). Research: HomeZada, Centriq, Tody, Sweepy, BinDays and council bin apps.

## Owner's decisions
1. Simple on purpose: keep the house running without having to remember everything.
2. Nothing is connected to councils, suppliers or smart meters; things are typed in once.
3. Decided the recommended way (owner said "do what you think is best"):
   - Cleaning stays in the Calendar's Chores (they already rotate between people and pay stars and pocket money); Home Care links to them rather than copying them.
   - Bins go on a rota between grown-ups, with "swap this one" in a tap; children are on it only if a parent adds them.
   - Children can see bin day and add things that need fixing.
4. It doesn't repeat other modules: warranties, receipts and manuals are in Documents; tradespeople are in Contacts; bills are in Money.
5. Push notifications only, as for the rest of the app.

## Built (must have)
1. Bin days: each bin once ("Black bin, every other Tuesday"); Luex works out the dates, reminds whoever's turn it is at 7pm the night before, and shows "Bins tonight" on Home. Move one collection (bank holidays) or swap who's doing it.
2. Yearly and seasonal jobs: a ready-made list to switch on (boiler service, smoke alarms, chimney, gutters, radiators and more), each with its own "every so many months", a reminder a week before and on the day, and the next date set when ticked.
3. Things to fix: anyone adds one, with a photo and where it is; who's sorting it and the tradesperson from Contacts; ticked when fixed.
4. Cleaning: a link to the Chores in the Calendar.

## Built (small extras)
1. Meter readings: gas, electric and water (or any meter), typed in with an optional photo, as a list to read out when the supplier asks.

## Not built (could be added later)
1. A moving-house checklist.
2. Pausing reminders while you're away.

## Left out on purpose
1. A full inventory of everything you own (heavy to fill in; warranties are in Documents).
2. Renovation projects and budgets (Money).
3. Points and games for cleaning (Rewards does stars).
4. Council bin lookups and smart meters (no outside connections).

## Complaints and fixes
1. Useful features behind paid upgrades – all included.
2. A pile of overdue jobs that feels like nagging – a missed job just shows as due; nothing piles up.
3. Bin reminders that don't arrive – Luex's own reminder, the night before, to the person whose turn it is.
4. Bins, boiler and repairs in different places – one page, shared with the household.

## Build status (27 Oct 2026)
Built and tested; not live yet (waiting for the owner's yes to apply the database changes, then the page and Home card are added).

Checks: 53 Home Care database checks (every other module's checks still passing), 84 one-screen checks (two parents, a child and a grandparent at phone, tablet and laptop size), 22 journey tests (two bins and a rota, swapping and moving a collection, ready-made jobs and ticking the boiler service, a child adding a dripping tap with a photo, a grown-up sorting it and ticking it fixed, a meter reading, the Cleaning link, the Home card). An independent security review found no way for the wrong person to see things, and 9 smaller problems, all fixed and tested: a collection moved after its first reminder is reminded again; a rota person without a login means the grown-ups are reminded; switching on ready-made jobs no longer sends "due next week" straight away; the rota function can't be called directly; a job ticked as done long ago gets a date still to come; a grown-up can change a rota a parent put a child on; no double message when adding a job for someone; old bin changes can't remind on a wrong day; photos taken off or replaced are tidied nightly.

Also found while testing (fixed and live): notification links landed on a page's first tab instead of the one they were for (Board, Money, Rewards, Food, School, Documents).
