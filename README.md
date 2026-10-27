# Luex Life

One simple place to run your family's week. Separate from Luex Work; see `AGENTS.md` for the rules and `docs/decisions.md` for what has been decided.

## Run it

```
npm install
npm run dev        # http://localhost:5173
npm run build      # type-checks, then builds to dist/
npm test           # unit tests
```

`.env` holds the Supabase project address and its **publishable** key. Both are public by design; the data is protected by row-level security.

## Put it live on Cloudflare Pages (one-off)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick `luex-life`.
2. Build command `npm run build`, output directory `dist`, production branch `main`.
3. Under **Environment variables** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (same values as `.env`).
4. After the first deploy, copy the address Cloudflare gives you (e.g. `luex-life.pages.dev`) into Supabase → **Authentication → URL Configuration**: set **Site URL** to it and add it under **Redirect URLs** (also add `http://localhost:5173`).
5. Every merge to `main` now goes live by itself, and every branch gets a preview link.

## Database

Migrations are in `supabase/migrations`; tests are in `supabase/tests` (see `AGENTS.md`).
