// Luex Life recipe import: a signed-in family member pastes a recipe's web address; we read the page's standard
// recipe data (schema.org Recipe) and send the recipe (and its picture) back for the person to check and save. Imported recipes stay private to the family. Links are never logged.
import { callerClient, CORS, json, serviceClient } from "../_shared/http.ts";
import { fetchPublic, FetchError } from "../_shared/page-fetch.ts";
import { parseRecipePage } from "../_shared/recipe-schema.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Not allowed" }, 405);
  const caller = callerClient(req);
  if (!caller) return json({ error: "Please sign in" }, 401);
  const { data: memberId } = await caller.rpc("my_member_id");
  if (typeof memberId !== "string") return json({ error: "Please sign in" }, 401);

  let url = "";
  try { url = String((await req.json())?.url ?? "").trim(); } catch { /* checked below */ }
  if (!url || url.length > 1000) return json({ error: "Paste the recipe's web address" }, 400);

  const db = serviceClient();
  // at most 15 tries in 10 minutes per person (checked and logged in one step)
  const { data: allowed, error: logErr } = await db.rpc("food_log_import", { p_member: memberId });
  if (logErr || allowed !== true) return json({ error: "That's a lot of recipes at once. Try again in a few minutes" }, 429);
  // the picture is only fetched if this person may add photos and the family has space
  const { data: canPhoto } = await caller.rpc("food_can_add_photo");

  try {
    const page = await fetchPublic(url, 3 * 1024 * 1024, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1");
    if (!page.type.includes("html")) return json({ error: "That link isn't a recipe page" }, 422);
    const recipe = parseRecipePage(new TextDecoder().decode(page.bytes));
    if (!recipe) return json({ error: "This website doesn't share its recipe in a way we can read. You can scan it or type it in instead" }, 422);

    // the picture comes back to the app, which saves it under the person's own rules (nothing is stored here)
    let photo: { base64: string; type: string } | null = null;
    if (recipe.imageUrl && canPhoto === true) {
      try {
        const img = await fetchPublic(new URL(recipe.imageUrl, page.url).href, 3 * 1024 * 1024, "image/jpeg,image/png,image/webp");
        const type = img.type.includes("png") ? "image/png" : img.type.includes("webp") ? "image/webp" : img.type.includes("jpeg") || img.type.includes("jpg") ? "image/jpeg" : null;
        if (type) {
          let bin = "";
          for (let i = 0; i < img.bytes.length; i += 0x8000) bin += String.fromCharCode(...img.bytes.subarray(i, i + 0x8000));
          photo = { base64: btoa(bin), type };
        }
      } catch { /* the recipe still comes in without its picture */ }
    }
    const { imageUrl: _drop, ...rest } = recipe;
    return json({ recipe: { ...rest, sourceUrl: page.url, photo } });
  } catch (e) {
    return json({ error: e instanceof FetchError ? e.message : "Couldn't read that page" }, 422);
  }
});
