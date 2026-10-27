// Ingredient lines: reading "2 tbsp olive oil, chopped", scaling them, and combining them for the shopping list.
// Used by recipes (import, scanning, scaling) and shopping (plan to list).

export type Ingredient = { qty: number | null; unit: string | null; name: string; note?: string; aisle?: string | null };

const FRACTIONS: Record<string, number> = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅕": 0.2, "⅛": 0.125 };

/** units we recognise, mapped to one spelling */
const UNITS: Record<string, string> = {
  g: "g", gram: "g", grams: "g", gr: "g",
  kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  ml: "ml", millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  l: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  tbsp: "tbsp", tbs: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  cup: "cup", cups: "cup",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  pinch: "pinch", pinches: "pinch",
  clove: "clove", cloves: "clove",
  tin: "tin", tins: "tin", can: "tin", cans: "tin",
  pack: "pack", packs: "pack", packet: "pack", packets: "pack",
  slice: "slice", slices: "slice",
  handful: "handful", handfuls: "handful",
  bunch: "bunch", bunches: "bunch",
  jar: "jar", jars: "jar",
  bag: "bag", bags: "bag",
  pint: "pint", pints: "pint", pt: "pint",
  dozen: "dozen", box: "box", boxes: "box", bottle: "bottle", bottles: "bottle", carton: "carton", cartons: "carton",
};

function readNumber(s: string): [number | null, string] {
  const t = s.trim();
  // "1 1/2", "1½", "1/2", "1.5", "1-2" (take the first)
  let m = /^(\d+)\s*([½⅓⅔¼¾⅕⅛])/.exec(t);
  if (m) return [Number(m[1]) + FRACTIONS[m[2]], t.slice(m[0].length)];
  m = /^([½⅓⅔¼¾⅕⅛])/.exec(t);
  if (m) return [FRACTIONS[m[1]], t.slice(m[0].length)];
  m = /^(\d+)\s+(\d+)\/(\d+)/.exec(t);
  if (m) return [Number(m[1]) + Number(m[2]) / Number(m[3]), t.slice(m[0].length)];
  m = /^(\d+)\/(\d+)/.exec(t);
  if (m) return [Number(m[1]) / Number(m[2]), t.slice(m[0].length)];
  m = /^(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|to)\s*\d+(?:[.,]\d+)?)?/.exec(t);
  if (m) return [Number(m[1].replace(",", ".")), t.slice(m[0].length)];
  return [null, t];
}

/** "2 tbsp olive oil, chopped" -> { qty: 2, unit: "tbsp", name: "olive oil", note: "chopped" } */
export function parseIngredient(line: string): Ingredient {
  let rest = line.replace(/\s+/g, " ").trim().replace(/^[-•*·]\s*/, "");
  const [qty, after] = readNumber(rest);
  rest = after.trim();
  let unit: string | null = null;
  // "200g" -> unit stuck to the number
  const u = /^([a-zA-Z]+)\.?\b\s*(?:of\s+)?/.exec(rest);
  if (qty !== null && u && UNITS[u[1].toLowerCase()]) {
    unit = UNITS[u[1].toLowerCase()];
    rest = rest.slice(u[0].length);
  }
  let note: string | undefined;
  const comma = rest.indexOf(",");
  if (comma > 0) { note = rest.slice(comma + 1).trim() || undefined; rest = rest.slice(0, comma); }
  const paren = /\(([^)]*)\)/.exec(rest);
  if (paren) { note = [paren[1], note].filter(Boolean).join(", "); rest = rest.replace(paren[0], ""); }
  return { qty, unit, name: rest.trim() || line.trim(), note };
}

export function scaleQty(qty: number | null, from: number, to: number): number | null {
  if (qty === null || !from) return qty;
  return qty * (to / from);
}

/** 0.333 -> "⅓", 1.5 -> "1½", 2.25 -> "2¼", 12.0 -> "12" */
export function formatQty(q: number | null): string {
  if (q === null) return "";
  if (q >= 20) return String(Math.round(q));
  const whole = Math.floor(q + 1e-9);
  const frac = q - whole;
  const pairs: [number, string][] = [[0.125, "⅛"], [0.25, "¼"], [1 / 3, "⅓"], [0.5, "½"], [2 / 3, "⅔"], [0.75, "¾"]];
  for (const [v, s] of pairs) if (Math.abs(frac - v) < 0.04) return (whole ? String(whole) : "") + s;
  if (frac < 0.04) return String(whole || 0);
  if (frac > 0.96) return String(whole + 1);
  return String(Math.round(q * 10) / 10);
}

const COUNT_UNITS = new Set(["clove", "tin", "pack", "slice", "handful", "jar", "bag", "pint", "bottle", "carton", "cup", "pinch", "bunch", "box"]);
/** "3 clove" -> "3 cloves", "2 bunch" -> "2 bunches" */
export function unitFor(unit: string | null, qty: number | null): string | null {
  if (!unit || qty === null || qty <= 1 || !COUNT_UNITS.has(unit)) return unit;
  return /(ch|x|sh)$/.test(unit) ? unit + "es" : unit + "s";
}

export function formatIngredient(i: Ingredient): string {
  return [formatQty(i.qty), unitFor(i.unit, i.qty), i.name].filter(Boolean).join(" ").replace(/(\d) (g|kg|ml|l)\b/, "$1$2") + (i.note ? `, ${i.note}` : "");
}

/** a word-level key so "Onions" and "onion" combine */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim().replace(/(oes|ies|s)$/, (m) => (m === "ies" ? "y" : m === "oes" ? "o" : ""));
}

const TO_BASE: Record<string, [string, number]> = { kg: ["g", 1000], g: ["g", 1], l: ["ml", 1000], ml: ["ml", 1] };

/** combine matching ingredients: "2 onions" + "1 onion" = "3 onions"; 500 g + 1 kg = 1.5 kg */
export function combine(items: (Ingredient & { from?: string })[]): (Ingredient & { from: string[] })[] {
  const out = new Map<string, Ingredient & { from: string[] }>();
  for (const it of items) {
    const base = it.unit && TO_BASE[it.unit] ? TO_BASE[it.unit] : null;
    const unitKey = base ? base[0] : (it.unit ?? "");
    const key = nameKey(it.name) + "|" + unitKey;
    const qty = it.qty === null ? null : base ? it.qty * base[1] : it.qty;
    const prev = out.get(key);
    if (prev) {
      prev.qty = prev.qty === null || qty === null ? (prev.qty ?? qty) : prev.qty + qty;
      if (it.from && !prev.from.includes(it.from)) prev.from.push(it.from);
    } else {
      out.set(key, { qty, unit: base ? base[0] : it.unit, name: it.name, aisle: it.aisle ?? null, from: it.from ? [it.from] : [] });
    }
  }
  // back to kg / l when big
  return [...out.values()].map((x) => {
    if (x.unit === "g" && x.qty !== null && x.qty >= 1000) return { ...x, qty: x.qty / 1000, unit: "kg" };
    if (x.unit === "ml" && x.qty !== null && x.qty >= 1000) return { ...x, qty: x.qty / 1000, unit: "l" };
    return x;
  });
}

/** The UK's 14 allergens, with words that suggest them in an ingredient list (a help, never a guarantee) */
export const ALLERGENS: { key: string; label: string; words: string[] }[] = [
  { key: "gluten", label: "Gluten", words: ["flour", "bread", "pasta", "wheat", "barley", "rye", "oats", "couscous", "breadcrumbs", "spaghetti", "noodle", "semolina", "spelt"] },
  { key: "crustaceans", label: "Crustaceans", words: ["prawn", "shrimp", "crab", "lobster", "langoustine", "crayfish"] },
  { key: "eggs", label: "Eggs", words: ["egg", "mayonnaise", "mayo", "meringue"] },
  { key: "fish", label: "Fish", words: ["salmon", "tuna", "cod", "haddock", "anchov", "mackerel", "sardine", "fish", "worcestershire"] },
  { key: "peanuts", label: "Peanuts", words: ["peanut", "groundnut", "satay"] },
  { key: "soya", label: "Soya", words: ["soy", "soya", "tofu", "edamame", "miso", "tempeh"] },
  { key: "milk", label: "Milk", words: ["milk", "butter", "cheese", "cream", "yoghurt", "yogurt", "parmesan", "mozzarella", "cheddar", "crème", "ghee"] },
  { key: "nuts", label: "Nuts", words: ["almond", "hazelnut", "walnut", "cashew", "pecan", "pistachio", "macadamia", "brazil nut", "pine nut", "praline", "marzipan"] },
  { key: "celery", label: "Celery", words: ["celery", "celeriac"] },
  { key: "mustard", label: "Mustard", words: ["mustard"] },
  { key: "sesame", label: "Sesame", words: ["sesame", "tahini", "houmous", "hummus"] },
  { key: "sulphites", label: "Sulphites", words: ["wine", "vinegar", "dried apricot", "sulphite"] },
  { key: "lupin", label: "Lupin", words: ["lupin"] },
  { key: "molluscs", label: "Molluscs", words: ["mussel", "oyster", "squid", "clam", "scallop", "octopus", "calamari"] },
];

/** allergens suggested by ingredient names (people confirm them) */
export function suggestAllergens(ings: Ingredient[]): string[] {
  const text = ings.map((i) => i.name.toLowerCase()).join(" | ");
  return ALLERGENS.filter((a) => a.words.some((w) => text.includes(w))).map((a) => a.key);
}

/** does a recipe clash with someone's "avoid" labels? (labels match allergen keys or appear in ingredient names) */
export function clashes(avoid: string[], allergens: string[], ings: Ingredient[]): string[] {
  const names = ings.map((i) => i.name.toLowerCase()).join(" | ");
  return avoid.filter((a) => {
    const k = a.toLowerCase().trim();
    const al = ALLERGENS.find((x) => x.key === k || x.label.toLowerCase() === k);
    if (al) return allergens.includes(al.key) || al.words.some((w) => names.includes(w));
    return k.length > 2 && names.includes(k.replace(/s$/, ""));
  });
}
