# Luex Life – Rewards and Pocket Money feature sheet

Agreed 27 Oct 2026. Module 6 of 15 (everyone). Research: NatWest Rooster Money, GoHenry, Homey, S'moresUp, Joon, Chores & Allowance Bot, Habitica, Streaks, Habitify, Everyday, StickK.

## Owner's decisions
1. Luex Life organises anyone's life: a single adult, a couple, flatmates or a family. Nothing depends on a bank, card or outside app; everything is typed in or ticked.
2. Build every must-have and every niche item. Ultra niche is a reference list only.
3. Fix every complaint in the complaints list.
4. One module, three ways, chosen per household: for me (personal habits and rewards), for us (shared rewards), for the children (pocket money, stars, reward shop). A household without children never sees pocket money.
5. Decided with the owner's go-ahead (Claude's recommendations): the module is called "Rewards and Pocket Money"; habits live here (repeating), Board keeps goals (one-off targets); stars already earned in the Calendar and Board count from day one; children see only their own balance; grown-ups who aren't parents can give gift money to a child, which waits for a parent's OK.
6. Not part of this build: renaming "parent" and "family" across the app (a separate job if wanted).
7. Push notifications only, as for the rest of the app.

## Must have
1. Stars for everyone, adults included: from Calendar chores and routines, Board goals and habits, with a history of where each came from.
2. Habits: tick when done; gentle streaks (best run and this week, no shame screen).
3. A reward list for each person ("treat I'm saving towards") with a star price and progress.
4. Shared rewards: a couple, flatmates or a family put stars towards one thing together.
5. Pocket money (only when the household has children): each child's balance kept as a record (the money stays with the parents), regular pay that pays itself, money for chores once confirmed, spending recorded.
6. Reward shop for children: a child asks, a parent approves.
7. Spend, save and give pots and savings goals with a picture, for children.
8. Each person's own screen: big numbers, what's close, what they can afford now.
9. Push notifications: goal reached, waiting for approval, pocket money paid, streak at risk; each person chooses.
10. Totals flow into Household Money (pocket money this month).
11. History by day and export (CSV and PDF).
12. No ads, no fees per person, grandparent-proof.
13. Works without a signal: ticks and records send later.

## Niche (agreed)
1. Skip days for habits (ill, holiday) that don't break the streak.
2. Habits that count, not just tick (8 glasses of water).
3. Weekly targets (3 times a week, any days).
4. A treat jar for adults (a record of money put aside for treats).
5. Bonuses and deductions for children (deductions off unless switched on).
6. Interest on children's savings paid by the parents, and matching (e.g. 50p per £1 saved).
7. Up-for-grabs jobs anyone can claim (money or stars); works for flatmates too.
8. Photo proof on a chore or job, deleted once confirmed.
9. Gift money for children from relatives, recorded.
10. Swap stars for money at a rate the household sets.
11. A Calendar wish-list item becomes a goal in one tap.
12. Advances for children, paid back from future pocket money automatically.
13. Pause for holidays.
14. Teen mode: a monthly allowance, fewer approvals.
15. Accountability buddy: share a habit with one person who sees ticks and can cheer.
16. Tooth fairy and birthday money log.
17. A weekly bonus when all of a child's chores for the week are done.
18. Short money tips matched to age (plain words, no AI).

## Ultra niche (reference only, not built)
1. Real prepaid card for children (needs a bank partner).
2. Commitment pledges (StickK-style).
3. Steps and workouts from Apple Health or Google Fit (outside app; optional extra later at most).
4. Pretend investing for teenagers.
5. Giving to charity through a plain link.
6. Swapping or lending stars between people.
7. Printable star charts and vouchers.
8. Virtual pet or avatar.
9. Leaderboards.
10. Rewards that unlock screen time on a device (not allowed by Apple or Google).

## Complaints and fixes
1. Monthly fees (GoHenry, Habitify, Joon, Rooster card) – included.
2. Must be updated by hand (Rooster free tracker) – pocket money pays itself; chores feed in.
3. Key features behind a paywall or limits (Rooster, S'moresUp, Joon, Everyday, Homey) – everything included, no limits.
4. Ticks not saving, crashes on photos (Habitica, Homey) – tested on every screen; ticks wait for a signal.
5. No way to skip a day (Habitica) – skip days.
6. Broken streaks feel like failure (Everyday) – gentle streaks.
7. Cluttered (Habitica) – one simple screen.
8. Needs the internet for solo use (Habitica, Allowance Bot) – works without a signal.
9. Too many notifications (Homey) – one per event, grouped, each person chooses.
10. Confusing parent and child set-up; one shared login (Homey, Allowance Bot) – own logins and roles.
11. Children tick without doing – parent confirm and optional photo proof.
12. Small, low-contrast text (Homey) – big text.

## Gaps owned by other modules
1. Chores and routines – Calendar (they earn here).
2. Goals – Board (they earn here).
3. Real savings and household money – Household Money.
4. Wish lists – Calendar.
5. Health tracking – Family Health.
6. Games – Kids' Space.

## Honest risks
1. Habit trackers are crowded (Streaks is polished at a one-off price); ours wins by being joined up, not on its own.
2. Self-rewards rely on honesty.
3. No card for children (a gap against GoHenry and Rooster).
4. Parents must hand over or move the real money themselves.

## Build status (27 Oct 2026)
Built and tested on a copy; not live yet (waiting for the owner's yes).

Checks: 92 Rewards database checks (Calendar 94, Board 153, Food 65, Money 58, access 51 and app calls 13 still passing), 84 one-screen checks (two parents, a child and a grandparent at phone, tablet and laptop size), 20 Rewards journey tests (plus Calendar, Board, Food and Money journeys still passing), 7 streak unit tests. An independent security review found 11 problems (two requests at once could spend the same stars twice; a grown-up who isn't a parent could pay a child any amount through a job or award stars through Board goals; un-ticking after spending left balances below nothing; deductions possible while switched off; a child could make a parent's habit easier; small star swaps rounded up; parents could open other grown-ups' photos; made-up photo paths passed; parents saw shared rewards they weren't in); all fixed and tested. Grown-ups' own treat jars are their own record, so they can add any amount (intended).

Also fixed while testing: the app saved the list of switched-off modules and the Calendar's star totals in a form that broke after a page reload without a signal; both now save safely, and Rewards balances can be read without a signal.

Known limits:
1. Only goals marked done by a parent pay stars.
2. Proof photos are removed by the checker's phone after confirming; if that phone loses its signal at that moment the photo stays in storage.
3. The weekly bonus only counts daily chores and weekly chores on set days, done by each person (not rotating or "anyone" chores).
4. A savings goal's progress is the child's whole save pot, so several goals show the same amount saved.
