// Recipes as a PDF, made on the device (one recipe, or the whole recipe box). The PDF library loads only when used.
import { supabase } from "@/lib/supabase";

import { BUCKET, type Recipe } from "./data";
import { formatIngredient } from "./ingredients";

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function photoData(path: string | null): Promise<{ data: string; w: number; h: number } | null> {
  if (!path) return null;
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
    if (!data?.signedUrl) return null;
    const bmp = await createImageBitmap(await (await fetch(data.signedUrl)).blob());
    const scale = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return { data: c.toDataURL("image/jpeg", 0.8), w: c.width, h: c.height };
  } catch {
    return null;
  }
}

/** PDF text fonts only cover Latin-1: swap the common fraction and dash characters */
const safe = (s: string) =>
  s.replace(/½/g, "1/2").replace(/⅓/g, "1/3").replace(/⅔/g, "2/3").replace(/¼/g, "1/4").replace(/¾/g, "3/4").replace(/⅛/g, "1/8")
    .replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\xFF\n]/g, "");

export async function recipesPdf(recipes: Recipe[], fileName: string, onProgress?: (done: number, total: number) => void) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 16, MAXW = W - 2 * M, BOTTOM = 280;
  let y = M;
  const need = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
  const para = (text: string, size: number, opts: { bold?: boolean; indent?: number; gap?: number } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(safe(text), MAXW - (opts.indent ?? 0)) as string[];
    for (const ln of lines) { need(size * 0.45); doc.text(ln, M + (opts.indent ?? 0), y); y += size * 0.45; }
    y += opts.gap ?? 1.5;
  };

  for (let n = 0; n < recipes.length; n++) {
    const r = recipes[n];
    if (n > 0) { doc.addPage(); y = M; }
    para(r.title, 20, { bold: true, gap: 3 });
    const meta = [`Serves ${r.servings}`, r.prep_min ? `Prep ${r.prep_min} min` : "", r.cook_min ? `Cook ${r.cook_min} min` : ""].filter(Boolean).join("  ·  ");
    para(meta, 10, { gap: 4 });
    const img = await photoData(r.photo_path);
    if (img) {
      const w = Math.min(MAXW, 120), h = (img.h / img.w) * w;
      need(h + 4);
      doc.addImage(img.data, "JPEG", M, y, w, h);
      y += h + 5;
    }
    if (r.description) para(r.description, 10, { gap: 4 });
    para("Ingredients", 13, { bold: true });
    for (const i of r.ingredients ?? []) para(`•  ${formatIngredient(i)}`, 10.5, { indent: 2, gap: 0.6 });
    y += 3;
    para("Method", 13, { bold: true });
    (r.steps ?? []).forEach((s, i) => para(`${i + 1}.  ${s.text}${s.timer_s ? ` (${Math.round(s.timer_s / 60)} min)` : ""}`, 10.5, { indent: 2, gap: 2 }));
    if (r.timeline?.length) {
      y += 2;
      para("Timeline", 13, { bold: true });
      for (const t of [...r.timeline].sort((a, b) => b.before_min - a.before_min)) para(`${t.before_min} min before:  ${t.text}`, 10.5, { indent: 2, gap: 0.6 });
    }
    if (r.notes) { y += 2; para("Notes", 13, { bold: true }); para(r.notes, 10.5, { indent: 2 }); }
    if (r.source_url) { y += 2; para(`From ${r.source_url}`, 8); }
    onProgress?.(n + 1, recipes.length);
  }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(140);
    doc.text(`Luex Life · page ${p} of ${pages}`, W / 2, 290, { align: "center" });
    doc.setTextColor(0);
  }
  saveBlob(doc.output("blob"), fileName);
}
