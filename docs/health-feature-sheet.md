# Luex Life – Family Health feature sheet

Agreed 27 Oct 2026. Module 10 (parents only; second release). Built under "just build, and we'll sort the logistics out after it's all built", so it follows the simple-first rules with no separate research round; open questions are listed at the end.

## Decisions
1. Simple on purpose, and dates only: never medical records, results, diagnoses or reasons for appointments.
2. Appointments are ordinary Calendar "appointment" events (one place for dates); Health lists them and can add one.
3. Medicine reminders are what the parent types from the label or the doctor. Luex never suggests a dose, and says so on the page.
4. Only parents see and change Health (other grown-ups and children don't see it at all).
5. Nothing is connected to the NHS, GP systems or pharmacies.
6. Push notifications only.

## Built
1. Medicine: what, for whom, how much (as typed), up to six times a day, from and until (quick 3, 5 and 7 days, or ongoing), and which parents get the reminder.
2. Today's doses in time order, each with a "Give" tick that shows who gave it and when, so nobody gives it twice. Unticking asks first.
3. A reminder at each dose time (unless it's already ticked), once. It says only "Medicine time for Tom", because it can show on a locked phone.
4. Check-ups and jabs: what's due when for each person (the reminder says "A check-up is due for Tom", not which) (ready-made ideas: dentist every 6 months, eye test every 2 years, flu jab every year, a one-off booster…), a reminder from 8am on the day it's due, and "Done", which moves repeating ones on (dentist done today, next one in 6 months).
5. Appointments: the Calendar's upcoming appointments, and a quick form that adds one to the Calendar, seen only by the parents and the people it's for.
6. A Home card for parents with medicine due around now, tickable right there.

## Not built (could be added later)
1. Wellbeing check-ins (how everyone's feeling). Left out for now: it's sensitive and needs children to use Health, which is parents-only.
2. A vaccination history (Health keeps what's due, not records).
3. Allergies (Food keeps "avoid" tags; Contacts and Emergency keeps the emergency card).
4. Repeat prescriptions running out.

## Questions to settle after the build
1. Should other grown-ups (a grandparent who helps, or flatmates) get Health for their own medicine?
2. Do you want wellbeing check-ins, and if so, who sees a child's answers?
3. Should check-ups due show in Documents' Renewals list too?

## Build status (27 Oct 2026)
Built and tested; not live yet.

Checks: 33 Health database checks (every other module's checks still passing), 38 one-screen checks (two parents at phone, tablet and laptop size; a child and a grandparent can't open it), 10 journey tests (adding Calpol for Tom for three days, ticking a dose given from Home, the other parent seeing who gave it, a dentist check-up moving on six months when done, an appointment going on the Calendar).

Security review (Fable 5.1) fixes: a reminder can still be changed or stopped after a parent on it leaves (they drop off it); lock-screen messages no longer name the medicine or the check-up; doses just before midnight are reminded; the Home card checks every minute; appointment times are right on clock-change days (the same fix went into Hosting); people who have left aren't reminded about; blank or repeated times are refused; clearer messages for wrong dates; appointments made here are private to parents and the person; a repeating check-up can only be finished by moving it on.
