// Luex Life file tidy (nightly, from the database schedule only).
// Deletes stored files nothing uses any more, at least a day old:
//   - Documents and Papers pages that belong to no paper: a save cut off half-way, a removed paper, or the "just mine"
//     papers of a grown-up who left the household over 30 days ago (their rows are removed by the database first);
//   - Home Care photos taken off, replaced, or on something removed.
// The database chooses the files (public.doc_unused_files, public.hc_unused_files); this only deletes them.
// File names are never logged.
import { CORS, fromSchedule, json, serviceClient } from "../_shared/http.ts";

const BUCKETS = [{ bucket: "doc-files", fn: "doc_unused_files" }, { bucket: "home-files", fn: "hc_unused_files" }];
const BUDGET_MS = 45_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Not allowed" }, 405);
  const db = serviceClient();
  if (!(await fromSchedule(req, db))) return json({ error: "Not allowed" }, 403);

  const began = Date.now();
  let removed = 0, failed = 0;
  for (const { bucket, fn } of BUCKETS) {
    let stop = false;
    while (!stop && Date.now() - began < BUDGET_MS) {
      const { data, error } = await db.rpc(fn, { p_limit: 500 });
      if (error) { failed++; break; }
      const names = (data ?? []) as string[];
      if (!names.length) break;
      for (let i = 0; i < names.length; i += 100) {
        const batch = names.slice(i, i + 100);
        const { error: e } = await db.storage.from(bucket).remove(batch);
        if (e) { failed += batch.length; stop = true; } else removed += batch.length;
      }
      if (names.length < 500) stop = true;
    }
  }
  console.log(JSON.stringify({ removed, failed, ms: Date.now() - began }));
  return json({ ok: failed === 0, removed, failed });
});
