# Luex Life server functions

Three Supabase Edge Functions (Deno). Both run with the full-access (service) key, so each one checks who may see what itself.

## push-sender
Runs every minute from the database schedule (`luex-push`). Each run it:
1. Makes reminder notifications that are due (all-day: "at the time" = 07:00 on the day, "1 day before" = 18:00 the day before).
2. Makes "Leave now for …" notifications (start time minus journey time minus 5 minutes) for whoever is taking them, otherwise for the people it's for, otherwise for whoever added it.
3. On Sunday at 18:00 family time, makes "Your week ahead" for everyone with weekly summaries on.
4. Sends every waiting notification to each person's devices (Web Push). Devices that have gone away are removed.

It never notifies anyone who can't see the event (private events and their changed dates included), and it respects each person's notification settings. `reminder_sends` stops anything being sent twice.

## import-feeds
Brings in Google, Apple and Outlook calendars from their secret iCal (.ics) links. This is import only.
- **From the schedule** (`luex-import`, every 10 minutes): refreshes active feeds that haven't been synced for 25 minutes, up to 30 per run.
- **From the app**: a parent's "Sync now" calls `supabase.functions.invoke("import-feeds", { body: { feedId } })`. The feed is read through row-level security as that parent, so only a parent who can see the import can sync it. It returns `{ ok, count, error }` and allows one sync a minute.

Safety: the function only fetches https links. It refuses private, internal and cloud-metadata addresses, re-checks each redirect (3 at most), and stops at 10 seconds or 5 MB. Feed links are never logged.

## album-share
Shows one Family Board album to relatives without a login. The app calls `supabase.functions.invoke("album-share", { body: { token } })` from the public page `/a/<token>`. The database checks the token (`public.shared_album`: unrevoked, unexpired, album not archived) and lists the album's photos; the function then signs each file address for one hour. Only album photos are ever shown (never chat or memory photos). Tokens are never logged. Deploy with `verify_jwt` off (visitors have no login).

## Secrets (set on both functions)
| Name | What |
|---|---|
| `CRON_SECRET` | Long random value (32+ characters). Store the same value in Vault: `select vault.create_secret('<value>', 'cron_secret');` |
| `VAPID_PUBLIC_KEY` | Push public key (the same one as `VITE_VAPID_PUBLIC_KEY` in the app) |
| `VAPID_PRIVATE_KEY` | Push private key (never in the repo) |
| `VAPID_SUBJECT` | `mailto:hello@luexgroup.com` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase.

## Deploy
1. Deploy both functions with **verify_jwt off**. The schedule's call has no user sign-in. `push-sender` checks `x-cron-secret`; `import-feeds` checks either that or the caller's sign-in through row-level security.
2. Set the secrets above.
3. Create the Vault secret, then apply `supabase/migrations/20261027000003_schedules.sql`.

## Checks
`npx -y tsx --tsconfig supabase/functions/_shared/tsconfig.check.json supabase/functions/_shared/ics.check.ts` tests the .ics reader and the repeat maths.
