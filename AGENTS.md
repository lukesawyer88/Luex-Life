# Luex Life – rules for anyone building here

Luex Life is the family and household app from Luex. It is a **separate app with its own repo and its own Supabase database** from Luex Work (the business app). Nothing here may depend on Work: borrow by copying code, never by linking.

- **Owner's rules (26 Oct 2026):**
  - The whole app fits on one screen on phones, tablets and desktop. The page itself never scrolls; only a window inside it may.
  - The "drunk grandma test": if a drunk grandma couldn't use a screen, make it simpler.
  - Plain-English, sentence-case copy. British spelling. Lists shown to the owner are numbered lists.
  - Same design as Luex Work (black sidebar, white frame, grey-blue records window, cream detail window). Colours live in `src/styles.css` only.
  - Make exactly the change asked, only where asked. Don't start the next job unprompted.
- **Stack:** Vite + React 19 + TypeScript (strict) + Tailwind v4 + shadcn/ui parts (`src/components/ui`) + TanStack Router and Query + Supabase. A plain single-page app: Cloudflare Pages serves `dist/`. Server jobs live only in Supabase Edge Functions (`supabase/functions`: push-sender, import-feeds) run by pg_cron. The store apps (App Store, Google Play) will wrap this same app with Capacitor near launch.
- **Code goes through GitHub.** Merge to `main` yourself; Cloudflare builds from it. Never rewrite pushed history.
- **Supabase project:** `luex-life`, ref `pjttemdnnnnlfijvoeip` (eu-west-1). Never touch the "Luex App" (Work) project.
- **No live database changes without the owner's yes.** Every change is a migration file in `supabase/migrations` (and applied to the live project only when approved).
- **Access is enforced in the database, not only by hiding buttons.** Row-level security on every table. New tables and functions get no access by default: every migration revokes everything and grants exactly what's needed, with one policy per command. Functions are `security definer` with `set search_path = ''` and check who is calling.
- **After ANY change to access, run both test files** (`supabase/tests/access_test.sql` and `supabase/tests/app_calls_test.sql`) against the live project with the SQL tool. Each ends with an error that carries the report and rolls itself back; all passed = "REPORT: ALL n CHECKS PASSED". Add checks for everything new.
- **Roles:** `parent` (admin; sees bills and papers), `member` (adult relative or babysitter), `child`. A person can be a profile without a login (managed by a parent). Logins join only through invites. A family always keeps one parent who can log in.
- **Modules:** the 15 agreed modules live in `src/modules/registry.ts`. Adding or building a module changes the registry entry and adds its own page and tables; it never changes the shell. Which modules are parent-only is set there (`audience`) and must also be enforced in each module's tables when they are built.
- **Children's data:** keep it minimal. Pictures are private and compressed. Health is dates only, never records. Get an adviser's view before building Family Health and Kids' Space.
- **AI:** the only AI in Luex is the Luex assistant. Any other AI feature must be agreed with the owner first. No AI credits spent without asking.
- **Built:** Family Calendar (module 2) with web push notifications and calendar import. Test files: `supabase/tests/access_test.sql`, `app_calls_test.sql`, `calendar_test.sql` (run all three after any access change).
- **Not built yet (agreed, waiting):** see `docs/todo.md`.
