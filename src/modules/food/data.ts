// Everything Food reads and writes. The database decides who may see and change what; these hooks ask,
// and keep every screen up to date when someone else changes something.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { Database } from "@/lib/database.types";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";

import type { Ingredient } from "./ingredients";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

export type FoodSettings = Row<"food_settings">;
export type Avoid = Row<"food_avoid">;
export type Collection = Row<"food_collections">;
export type Recipe = Omit<Row<"food_recipes">, "ingredients" | "steps" | "nutrition" | "timeline"> & {
  ingredients: Ingredient[];
  steps: Step[];
  nutrition: Nutrition | null;
  timeline: TimelineStep[] | null;
};
export type Step = { text: string; timer_s?: number | null; uses?: number[] };
export type Nutrition = { kcal?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null };
/** a seasonal menu: "minutes before serving" for each job */
export type TimelineStep = { before_min: number; text: string };
export type Rating = Row<"food_ratings">;
export type PlanItem = Row<"food_plan">;
export type Lunch = Row<"food_lunches">;
export type ShopList = Row<"food_lists">;
export type Aisle = Row<"food_aisles">;
export type KnownItem = Row<"food_known_items">;
export type ListItem = Row<"food_list_items">;
export type StockItem = Omit<Row<"food_stock">, "nutrition"> & { nutrition: Nutrition | null };
export type Takeaway = Row<"food_takeaways">;
export type TakeawayOrder = Row<"food_takeaway_orders">;
export type Spend = Row<"food_spend">;
export type DiaryEntry = Row<"food_diary">;

export const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABEL: Record<Slot, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" };
export const BUCKET = "food-files";
export const DEFAULT_AISLES = [
  "Fruit and veg", "Bakery", "Meat and fish", "Dairy and eggs", "Chilled", "Frozen", "Tins and jars",
  "Pasta, rice and grains", "Baking", "Breakfast", "Snacks and sweets", "Drinks", "World foods", "Household", "Health and beauty", "Baby", "Pets", "Other",
];

/** Every Food query key starts with this, so one call refreshes them all */
export const foodKey = (familyId: string, ...rest: unknown[]) => ["food", familyId, ...rest];

export async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function refreshFood(qc: QueryClient, familyId: string) {
  return qc.invalidateQueries({ queryKey: ["food", familyId] });
}

const LIVE_TABLES = ["food_list_items", "food_lists", "food_plan", "food_stock", "food_recipes", "food_lunches"] as const;

/** Keep Food screens fresh while Food is open (shopping together in the shop) */
export function useFoodLive() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void refreshFood(qc, family.id), 250); };
    const ch = supabase.channel(`food-${family.id}`);
    for (const t of LIVE_TABLES) ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `family_id=eq.${family.id}` }, refresh);
    ch.subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [family.id, qc]);
}

// ---------------------------------------------------------------- queries

export function useRecipes() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: foodKey(family.id, "recipes"),
    queryFn: async () => {
      const [recipes, ratings, collections] = await Promise.all([
        rows<Recipe>(supabase.from("food_recipes").select("*").eq("family_id", family.id).is("archived_at", null).order("title")),
        rows<Rating>(supabase.from("food_ratings").select("*").eq("family_id", family.id)),
        rows<Collection>(supabase.from("food_collections").select("*").eq("family_id", family.id).order("position").order("title")),
      ]);
      return { recipes, ratings, collections };
    },
  });
}

/** meal plan between two dates (inclusive, "YYYY-MM-DD") */
export function usePlan(from: string, to: string) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: foodKey(family.id, "plan", from, to),
    queryFn: () => rows<PlanItem>(supabase.from("food_plan").select("*").eq("family_id", family.id).gte("day", from).lte("day", to).order("day").order("position")),
  });
}

export function useLunches(from: string, to: string) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: foodKey(family.id, "lunches", from, to),
    queryFn: () => rows<Lunch>(supabase.from("food_lunches").select("*").eq("family_id", family.id).gte("day", from).lte("day", to)),
  });
}

export function useShopping() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: foodKey(family.id, "shopping"),
    queryFn: async () => {
      const [lists, items, aisles, known] = await Promise.all([
        rows<ShopList>(supabase.from("food_lists").select("*").eq("family_id", family.id).is("archived_at", null).order("position").order("created_at")),
        rows<ListItem>(supabase.from("food_list_items").select("*").eq("family_id", family.id).order("position").order("created_at")),
        rows<Aisle>(supabase.from("food_aisles").select("*").eq("family_id", family.id).order("position")),
        rows<KnownItem>(supabase.from("food_known_items").select("*").eq("family_id", family.id).order("used_count", { ascending: false }).limit(500)),
      ]);
      return { lists, items, aisles, known };
    },
  });
}

export function useStock() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: foodKey(family.id, "stock"),
    queryFn: () => rows<StockItem>(supabase.from("food_stock").select("*").eq("family_id", family.id).is("used_up_at", null).order("use_by", { nullsFirst: false }).order("name")),
  });
}

export function useAvoid() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: foodKey(family.id, "avoid"),
    queryFn: () => rows<Avoid>(supabase.from("food_avoid").select("*").eq("family_id", family.id)),
  });
}

export function useTakeaways() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: foodKey(family.id, "takeaways"),
    queryFn: async () => {
      const [takeaways, orders] = await Promise.all([
        rows<Takeaway>(supabase.from("food_takeaways").select("*").eq("family_id", family.id).is("archived_at", null).order("name")),
        rows<TakeawayOrder>(supabase.from("food_takeaway_orders").select("*").eq("family_id", family.id)),
      ]);
      return { takeaways, orders };
    },
  });
}

/** parents only (the database returns nothing to anyone else) */
export function useSpend(from: string, to: string) {
  const { family, isParent } = useFamilyState();
  return useQuery({
    queryKey: foodKey(family.id, "spend", from, to),
    enabled: isParent,
    queryFn: () => rows<Spend>(supabase.from("food_spend").select("*").eq("family_id", family.id).gte("spent_on", from).lte("spent_on", to).order("spent_on", { ascending: false })),
  });
}

/** my own food settings (calories); null until saved */
export function useMyFoodSettings() {
  const { family, me } = useFamilyState();
  return useQuery({
    queryKey: foodKey(family.id, "my-settings", me.id),
    queryFn: async () => (await rows<FoodSettings>(supabase.from("food_settings").select("*").eq("member_id", me.id)))[0] ?? null,
  });
}

export function useDiary(day: string) {
  const { family, me } = useFamilyState();
  return useQuery({
    queryKey: foodKey(family.id, "diary", me.id, day),
    queryFn: () => rows<DiaryEntry>(supabase.from("food_diary").select("*").eq("member_id", me.id).eq("day", day).order("created_at")),
  });
}

/** Signed addresses for private food photos (an hour; re-asked every 50 minutes) */
export function useFoodUrls(paths: (string | null | undefined)[]) {
  const clean = [...new Set(paths.filter((p): p is string => !!p))].sort();
  return useQuery({
    queryKey: ["food-urls", clean],
    enabled: clean.length > 0,
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
    queryFn: async () => {
      const out = new Map<string, string>();
      for (let i = 0; i < clean.length; i += 100) {
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(clean.slice(i, i + 100), 3600);
        if (error) throw error;
        for (const d of data ?? []) if (d.signedUrl && d.path) out.set(d.path, d.signedUrl);
      }
      return out;
    },
  });
}

/** Upload a (shrunk) food photo; returns its path */
export async function uploadFoodPhoto(familyId: string, blob: Blob, folder: "recipes" | "items" | "stock"): Promise<string> {
  const path = `${familyId}/food/${folder}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("Couldn't save the photo. Try again");
  return path;
}

/** "YYYY-MM-DD" for today in the family's time zone */
export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function addDaysKey(k: string, n: number): string {
  const d = new Date(k + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Monday of the week containing k */
export function weekStartKey(k: string, startsOn = 1): string {
  const d = new Date(k + "T12:00:00Z");
  const diff = (d.getUTCDay() - startsOn + 7) % 7;
  return addDaysKey(k, -diff);
}
