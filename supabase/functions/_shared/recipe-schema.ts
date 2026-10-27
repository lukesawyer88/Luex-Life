// Reading a recipe from a web page: most recipe sites publish it in a standard format (schema.org "Recipe" in JSON-LD).
// Pure functions (no network), so they can be tested.

export type ImportedRecipe = {
  title: string; description: string; servings: number | null; prepMin: number | null; cookMin: number | null;
  ingredients: string[]; steps: string[]; tags: string[]; imageUrl: string | null; kcal: number | null;
};

const clean = (s: unknown, max: number): string =>
  typeof s === "string"
    ? s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim().slice(0, max)
    : "";

/** "PT1H20M" -> 80 */
export function isoMinutes(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/i.exec(v.trim());
  if (!m) return null;
  const mins = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return mins > 0 && mins < 5000 ? mins : null;
}

function firstNumber(v: unknown): number | null {
  const s = Array.isArray(v) ? v.find((x) => /\d/.test(String(x))) : v;
  const m = /(\d+)/.exec(String(s ?? ""));
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 100 ? n : null;
}

function isRecipe(o: unknown): o is Record<string, unknown> {
  if (!o || typeof o !== "object") return false;
  const t = (o as Record<string, unknown>)["@type"];
  return t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
}

function findRecipe(node: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || !node || typeof node !== "object") return null;
  if (isRecipe(node)) return node;
  const arr = Array.isArray(node) ? node : [(node as Record<string, unknown>)["@graph"], (node as Record<string, unknown>).mainEntity].filter(Boolean);
  for (const x of arr.flat()) {
    const r = findRecipe(x, depth + 1);
    if (r) return r;
  }
  return null;
}

function stepsOf(v: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 4 || out.length >= 100) return out;
  if (typeof v === "string") {
    for (const line of v.split(/\n+/)) { const s = clean(line, 1000); if (s) out.push(s); }
  } else if (Array.isArray(v)) {
    for (const x of v) stepsOf(x, out, depth + 1);
  } else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.itemListElement) stepsOf(o.itemListElement, out, depth + 1);
    else { const s = clean(o.text ?? o.name, 1000); if (s) out.push(s); }
  }
  return out;
}

function imageOf(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return imageOf(v[v.length > 1 ? 0 : 0]);
  if (v && typeof v === "object") return imageOf((v as Record<string, unknown>).url);
  return null;
}

export function parseRecipePage(html: string): ImportedRecipe | null {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const b of blocks) {
    let data: unknown;
    try { data = JSON.parse(b[1].trim()); } catch { continue; }
    const r = findRecipe(data);
    if (!r) continue;
    const ingredients = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : Array.isArray(r.ingredients) ? r.ingredients : [])
      .map((x) => clean(x, 200)).filter(Boolean).slice(0, 100);
    const tags = [r.recipeCategory, r.recipeCuisine, typeof r.keywords === "string" ? r.keywords.split(",") : r.keywords]
      .flat().map((x) => clean(x, 30).toLowerCase()).filter(Boolean);
    const kcalRaw = (r.nutrition as Record<string, unknown> | undefined)?.calories;
    const kcal = kcalRaw ? firstNumberAny(kcalRaw) : null;
    const title = clean(r.name, 120);
    if (!title) continue;
    return {
      title,
      description: clean(r.description, 2000),
      servings: firstNumber(r.recipeYield),
      prepMin: isoMinutes(r.prepTime),
      cookMin: isoMinutes(r.cookTime) ?? isoMinutes(r.totalTime),
      ingredients,
      steps: stepsOf(r.recipeInstructions).slice(0, 100),
      tags: [...new Set(tags)].slice(0, 15),
      imageUrl: imageOf(r.image),
      kcal,
    };
  }
  return null;
}

function firstNumberAny(v: unknown): number | null {
  const m = /(\d+(?:\.\d+)?)/.exec(String(v));
  const n = m ? Math.round(Number(m[1])) : NaN;
  return n > 0 && n < 20000 ? n : null;
}
