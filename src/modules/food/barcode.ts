// Barcodes: read one with the camera, then look the product up in Open Food Facts (free, patchy for UK own-brands).
// The camera part lives in shop-barcode.tsx; this file has no screens.
import type { Nutrition } from "./data";

export type Product = { code: string; name: string; brand: string | null; quantity: string | null; nutrition: Nutrition | null };

type OffResponse = {
  status?: number;
  product?: {
    product_name?: string; product_name_en?: string; brands?: string; quantity?: string;
    nutriments?: Record<string, number | string | undefined>;
  };
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
};

/** Look a barcode up. Returns null when Open Food Facts doesn't know it. Nutrition is per 100 g (an estimate). */
export async function lookupBarcode(code: string): Promise<Product | null> {
  const clean = code.replace(/\D/g, "");
  if (clean.length < 6 || clean.length > 14) return null;
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=product_name,product_name_en,brands,quantity,nutriments`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as OffResponse;
  if (j.status !== 1 || !j.product) return null;
  const p = j.product;
  const name = (p.product_name_en || p.product_name || "").trim();
  if (!name) return null;
  const n = p.nutriments ?? {};
  const nutrition: Nutrition = {
    kcal: num(n["energy-kcal_100g"]),
    protein: num(n.proteins_100g),
    carbs: num(n.carbohydrates_100g),
    fat: num(n.fat_100g),
  };
  const hasNutrition = Object.values(nutrition).some((v) => v !== null);
  return {
    code: clean,
    name: name.slice(0, 100),
    brand: p.brands ? p.brands.split(",")[0].trim().slice(0, 60) : null,
    quantity: p.quantity ? p.quantity.slice(0, 30) : null,
    nutrition: hasNutrition ? nutrition : null,
  };
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

/**
 * Watch a video element until a barcode is seen. Uses the browser's own reader where there is one (Android
 * Chrome), otherwise a small library loaded only when needed (iPhone Safari). Returns a stop function.
 */
export async function watchForBarcode(video: HTMLVideoElement, onCode: (code: string) => void): Promise<() => void> {
  const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (Native) {
    const det = new Native({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        if (video.readyState >= 2) {
          const found = await det.detect(video);
          if (found[0]?.rawValue) { stopped = true; onCode(found[0].rawValue); return; }
        }
      } catch { /* keep looking */ }
      setTimeout(tick, 250);
    };
    void tick();
    return () => { stopped = true; };
  }
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const reader = new BrowserMultiFormatReader();
  const controls = await reader.decodeFromVideoElement(video, (result) => {
    if (result) { controls.stop(); onCode(result.getText()); }
  });
  return () => controls.stop();
}
