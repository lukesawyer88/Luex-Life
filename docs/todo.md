# Luex Life – to-do list

Updated 27 Oct 2026.

## Before launch
1. **App Store and Google Play apps.** Wrap the same app with Capacitor near the end. Do one early trial wrap after a few more modules to catch surprises (phone layout, camera, sign-in inside an app).
2. **Store accounts.** Apple developer account (about £79 a year) and Google Play (about £20 once). Start about a month before launch: approval and first review can take days to a couple of weeks. The owner signs up himself.
3. **iPhone builds.** Apple only builds on a Mac: use a cloud build service through GitHub if there's no Mac.
4. **Notifications in the store apps.** Switch push from web push to Apple's and Google's own systems (a change to `push-sender`, not a rewrite).
5. **Decide how families pay.** Paying inside the store apps costs 15% (30% for big sellers); paying on the website has different rules in the UK, EU and US. Check the current rules and decide before launch. Same question for Luex Work.
6. **Paid weather plan.** Open-Meteo's free plan is for testing only (about €5–20 a month).
7. **Paid Supabase plan** before real families join (backups, no pausing).
8. **Email sending service** for invites (still copy-and-send) and later for email alerts.
9. **Supabase Auth settings** (site address, sign-in emails) once the Cloudflare address is final.
10. **Make the app smaller to download** (about 1 MB now: split it so each module loads when opened).
11. **Test on real phones** (iPhone and Android): touch, notifications, camera, offline.
12. **Stronger-model security review** of the whole app before real families join.

## Waiting on something
1. **Forward an email to add an event** – needs an email address on the Luex domain (luexgroup.com is still on Wix).
2. **Sign-in through Luex Work and the £5 link.**
3. **Pocket Money and Rewards** – stars are earned in the Calendar now; spending them comes with that module.
4. **Two-way calendar sync** (import-only for now).

## Notes for whoever builds next
1. A database tool rule cancels any migration step that combines certain delete statements with other changes. Keep each delete in its own small function (see `clear_hidden_alerts`, `trim_devices`, `release_device`, `tidy_old_*`).
2. Server secrets live in `luex_private.settings` (never in code, chat or the repo). The push keys are made by `push-sender` on its first run; the app reads the public half with `push_public_key()`.

## Ultra niche (reference only, not built)
See `docs/calendar-feature-sheet.md`.
