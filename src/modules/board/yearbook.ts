// The free year book PDF and "Download everything", both made on the device.
// The PDF and zip libraries load only when someone uses them, so the app stays small.
import { supabase } from "@/lib/supabase";

import { BUCKET, type Media, type Memory } from "./data";

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function signed(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths.slice(i, i + 100), 3600);
    for (const d of data ?? []) if (d.signedUrl && d.path) out.set(d.path, d.signedUrl);
  }
  return out;
}

async function loadJpeg(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob);
    // redraw as a medium JPEG: keeps the PDF a sensible size and handles PNG/WebP too
    const scale = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return { data: c.toDataURL("image/jpeg", 0.82), w: c.width, h: c.height };
  } catch {
    return null;
  }
}

const LONG_DATE = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** One page per memory or milestone (more if long), with up to four photos each */
export async function buildYearbook(opts: {
  familyName: string;
  year: number;
  memories: Memory[];
  media: Media[];
  nameOf: (id: string) => string | undefined;
  ageOf: (m: Memory) => string | null;
  onProgress?: (done: number, total: number) => void;
}): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 16;
  const list = [...opts.memories].sort((a, b) => a.happened_on.localeCompare(b.happened_on) || a.created_at.localeCompare(b.created_at));

  // cover
  doc.setFont("helvetica", "bold"); doc.setFontSize(34);
  doc.text(`Our ${opts.year}`, W / 2, 110, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(16);
  doc.text(opts.familyName, W / 2, 124, { align: "center" });
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(`${list.length} ${list.length === 1 ? "memory" : "memories"} · made with Luex Life`, W / 2, 136, { align: "center" });
  doc.setTextColor(0);

  const pics = list.flatMap((m) => opts.media.filter((x) => x.memory_id === m.id && x.kind !== "voice").slice(0, 4).map((x) => x.thumb_path ?? x.path));
  const urls = await signed(pics);

  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    opts.onProgress?.(i, list.length);
    doc.addPage();
    let y = M;
    doc.setFontSize(10); doc.setTextColor(110);
    doc.text(LONG_DATE(m.happened_on).toUpperCase(), M, y + 4);
    doc.setTextColor(0); y += 10;
    const heading = m.kind === "milestone"
      ? `${opts.nameOf(m.milestone_for ?? "") ?? ""}${opts.ageOf(m) ? ` (${opts.ageOf(m)})` : ""}: ${m.title}`
      : m.title || (m.prompt_text ?? "");
    if (heading) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(18);
      const lines = doc.splitTextToSize(heading, W - 2 * M) as string[];
      doc.text(lines, M, y + 6); y += lines.length * 8 + 4;
    }
    const who = m.people.map(opts.nameOf).filter(Boolean).join(", ");
    if (who) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(10);
      doc.text(`With ${who}`, M, y + 3); y += 8;
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    const body = (doc.splitTextToSize(m.body, W - 2 * M) as string[]);
    for (const line of body) {
      if (y > H - M) { doc.addPage(); y = M; }
      doc.text(line, M, y + 4); y += 5.5;
    }
    // photos: two across
    const mine = opts.media.filter((x) => x.memory_id === m.id && x.kind !== "voice").slice(0, 4);
    if (mine.length) y += 4;
    const cellW = (W - 2 * M - 6) / 2;
    for (let p = 0; p < mine.length; p++) {
      const url = urls.get(mine[p].thumb_path ?? mine[p].path);
      const img = url ? await loadJpeg(url) : null;
      if (!img) continue;
      const h = Math.min(cellW * (img.h / img.w), 90);
      const w = h * (img.w / img.h);
      if (p % 2 === 0 && y + h > H - M) { doc.addPage(); y = M; }
      const x = M + (p % 2) * (cellW + 6);
      doc.addImage(img.data, "JPEG", x, y, w, h);
      if (p % 2 === 1 || p === mine.length - 1) y += 94;
    }
  }
  opts.onProgress?.(list.length, list.length);
  return doc.output("blob");
}

/** Every original from a period in one .zip, in month folders */
export async function buildZip(
  media: Media[],
  extras: { name: string; blob: Blob }[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ blob: Blob; failed: number }> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  let failed = 0;
  for (let i = 0; i < media.length; i++) {
    const m = media[i];
    onProgress?.(i, media.length);
    const { data, error } = await supabase.storage.from(BUCKET).download(m.path);
    if (error || !data) { failed++; continue; }
    const when = (m.taken_at ?? m.created_at);
    const folder = when.slice(0, 7);
    const ext = m.path.split(".").pop() ?? "jpg";
    const stamp = when.slice(0, 19).replace(/[:T]/g, "-");
    zip.file(`${folder}/${stamp}-${m.id.slice(0, 6)}.${ext}`, data, { binary: true });
  }
  for (const x of extras) zip.file(x.name, x.blob);
  onProgress?.(media.length, media.length);
  // photos and videos are already compressed: store them as they are
  return { blob: await zip.generateAsync({ type: "blob", compression: "STORE" }), failed };
}
