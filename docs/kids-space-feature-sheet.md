# Luex Life – Kids' Space feature sheet

Agreed 27 Oct 2026. Module 9 (everyone; second release). Built under "just build, and we'll sort the logistics out after it's all built", so it follows the simple-first rules with no separate research round; open questions are listed at the end.

## Decisions
1. Simple on purpose: three things for each child, nothing else.
2. Children's own logins and calendars already exist (Family settings and the Calendar), so Kids' Space doesn't repeat them.
3. Screen time is the household's rules plus "can I have more time?". Luex can't switch a device off (Apple and Google don't allow it), and the page says so to grown-ups.
4. Nothing is connected to device controls, games or outside apps.
5. Who sees what: a child sees their own rules and asks; parents set rules and answer asks; the whole household sees milestones and "all about me".
6. Push notifications only.

## Built
1. Screen time rules: parents add ready-made rules (1 hour on school days, homework first, screens off by 7pm…) or write their own, per child.
2. "Can I have more time?": a child asks for 15 minutes, 30 minutes or an hour, with an optional reason. Every parent is told and can say yes or no from Home or Kids' Space; the child is told the answer. One ask at a time; an unanswered ask lapses after 3 hours; at most 10 a day.
3. Growing up: milestones (with ready-made ideas) and heights, each with the child's age worked out from their birthday, and how much they've grown since last time. Grown-ups add for any child, a child for themselves; parents can change any, others only their own.
4. All about me: favourite colour, food, animal, game, best friend, what they're good at, what they're learning, what they want to be. The child or a parent fills it in; everyone in the household reads it.
5. A Home card for parents when a child is waiting for an answer.

## Not built (could be added later)
1. A drawing pad and "fridge door" of drawings (the Board's album can hold photos of drawings).
2. Games.
3. Photos on milestones (the Board's memories hold photos).
4. Timers that count down the extra time.

## Questions to settle after the build
1. Should brothers and sisters see each other's screen time rules?
2. Should grandparents (and other grown-ups) be able to answer "more time" asks, or only parents?
5. The Board's journal (hidden under More features) also has milestones. Keep milestones here only?
3. Do you want a drawing pad for younger children?
4. Safeguarding adviser: the same review as for children's chats (on the to-do list).

## Build status (27 Oct 2026)
Built, tested and live (27 Oct 2026): database changes applied, reminders scheduled, live checks passed (rolled back), page and Home card switched on.

Checks: 47 Kids' Space database checks (every other module's checks still passing), 69 one-screen checks (two parents, a child and a grandparent at phone, tablet and laptop size), 17 journey tests (rules, Mia asking for more time, a parent saying yes from Home, Mia seeing the answer, a milestone and a height with her age, Mia filling in all about me, Gran reading it but not changing it).

Security review (Fable 5.1) fixes: another household can no longer check who our children are; an ask can't be answered after it runs out (3 hours); a second parent answering is told "Already answered"; two people filling in "all about me" at once no longer shows the wrong message; grown-ups who aren't parents don't see an empty asks section; no milestones before a child's birthday; repeated asks are grouped into one message.
