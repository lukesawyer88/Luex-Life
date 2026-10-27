// Luex Life recipe import: a signed-in family member pastes a recipe's web address; we read the page's standard
// recipe data (schema.org Recipe), save its picture privately for the family, and send the recipe back for the
// person to check and save. Imported recipes stay private to the family. Links are never logged.
import { callerClient, CORS, json, serviceClient } from "../_shared/http.ts";
import { fetchPublic, FetchError } from "../_shared/page-fetch.ts";
import { parseRecipePage } from "../_shared/recipe-schema.ts";

const PER_10_MIN = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Not allowed" }, 405);
  const caller = callerClient(req);
  if (!caller) return json({ error: "Please sign in" }, 401);
  const [{ data: memberId }, { data: familyId }] = await Promise.all([caller.rpc("my_member_id"), caller.rpc("my_family_id")]);
  if (typeof memberId !== "string" || typeof familyId !== "string") return json({ error: "Please sign in" }, 401);

  let url = "";
  try { url = String((await req.json())?.url ?? "").trim(); } catch { /* checked below */ }
  if (!url || url.length > 1000) return json({ error: "Paste the recipe's web address" }, 400);

  const db = serviceClient();
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await db.from("food_import_log").select("id", { count: "exact", head: true }).eq("member_id", memberId).gte("at", since);
  if ((count ?? 0) >= PER_10_MIN) return json({ error: "That's a lot of recipes at once. Try again in a few minutes" }, 429);
  await db.from("food_import_log").insert({ member_id: memberId });

  try {
    const page = await fetchPublic(url, 3 * 1024 * 1024, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1");
    if (!page.type.includes("html")) return json({ error: "That link isn't a recipe page" }, 422);
    const recipe = parseRecipePage(new TextDecoder().decode(page.bytes));
    if (!recipe) return json({ error: "This website doesn't share its recipe in a way we can read. You can scan it or type it in instead" }, 422);

    // the picture, kept privately for the family
    let photoPath: string | null = null;
    if (recipe.imageUrl) {
      try {
        const img = await fetchPublic(new URL(recipe.imageUrl, page.url).href, 5 * 1024 * 1024, "image/jpeg,image/png,image/webp");
        const ext = img.type.includes("png") ? "png" : img.type.includes("webp") ? "webp" : img.type.includes("jpeg") || img.type.includes("jpg") ? "jpg" : null;
        if (ext) {
          const path = `${familyId}/food/recipes/${crypto.randomUUID()}.${ext}`;
          const { error } = await db.storage.from("food-files").upload(path, img.bytes, { contentType: `image/${ext === "jpg" ? "jpeg" : ext}` });
          if (!error) photoPath = path;
        }
      } catch { /* the recipe still comes in without its picture */ }
    }
    const { imageUrl: _drop, ...rest } = recipe;
    return json({ recipe: { ...rest, sourceUrl: page.url, photoPath } });
  } catch (e) {
    return json({ error: e instanceof FetchError ? e.message : "Couldn't read that page" }, 422);
  }
});
