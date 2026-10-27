# Luex Life – decisions so far (26 Oct 2026)

1. Luex Life is a family and household app, **separate from Luex Work**, with its own repo and database. Code is borrowed by copying.
2. Pricing idea: about £7 a month per family; **£5 for families who sign up through Luex Work** (always, it's Luex promoting a service). Open to lower.
3. Sign-up route (not built yet): a button in a Luex Work module emails a single-use link, valid about 7 days. Anyone logged in to Work can use it, whatever email they log in with (not always a work email). Employers see nothing from Life.
4. Families without that route sign up with any email at the full price. Partners and children join by invite from a parent.
5. A person's login belongs to them, not their employer; the email can be changed.
6. **15 modules** (see `src/modules/registry.ts`). Parked: Pets, Relatives and Carers. Cut: Fitness. Calendar carries chores, routines, reminders and wish lists. Photos and memories live on the Family Board.
7. Calendar zoomed out shows coloured dots with an **icon as well as a colour** (colour-blind safe), at most about 8 types, with a key.
8. Wish lists: each person has one on their birthday and at Christmas; parents get one summary notification, not one per edit; others can mark a gift as bought without the owner seeing.
9. Contacts and Emergency is its own module: simple cards for what to do and who to call, with a babysitter view. It never replaces 999 or 112.
10. Launch in waves: a small starter set first (marked wave 1 in the registry), the rest after launch.
11. Hosting: GitHub → Cloudflare Pages. Database and logins: Supabase (free while building; a paid plan before real families join).
