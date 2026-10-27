// Everything Documents and Papers reads and writes. Grown-ups only: household papers are for parents, and any grown-up
// can keep their own papers "just mine" (only they can see them). The database decides who sees what; children see nothing.
// Pages live in the private "doc-files" bucket: <family>/docs/s/<file> (household) or <family>/docs/p/<owner>/<file>.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { Database } from "@/lib/database.types";
import { useFamilyState } from "@/lib/family-context";
import { fitJpeg } from "@/lib/image";
import { readLocal, writeLocal } from "@/lib/local";
import { DOCS_CACHE_PREFIX } from "@/lib/phone-copies";
import { supabase } from "@/lib/supabase";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Folder = Row<"doc_folders">;
export type Doc = Row<"documents">;

export const BUCKET = "doc-files";
export const MAX_PAGES = 30;
/** 15 MB per file (the bucket's limit) */
export const MAX_FILE = 15 * 1024 * 1024;

export const docsKey = (familyId: string, ...rest: unknown[]) => ["docs", familyId, ...rest];

export function refreshDocs(qc: QueryClient, familyId: string) {
  return qc.invalidateQueries({ queryKey: ["docs", familyId] });
}

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useDocsLive() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void refreshDocs(qc, family.id), 300); };
    const ch = supabase.channel(`docs-${family.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "documents", filter: `family_id=eq.${family.id}` }, refresh)
      .subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [family.id, qc]);
}

/** The folders (made on the first visit) */
export function useFolders() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: docsKey(family.id, "folders"),
    queryFn: async () => {
      let list = await rows<Folder>(supabase.from("doc_folders").select("*").eq("family_id", family.id).order("position"));
      if (!list.length) {
        const { error } = await supabase.rpc("doc_setup");
        if (error) throw error;
        list = await rows<Folder>(supabase.from("doc_folders").select("*").eq("family_id", family.id).order("position"));
      }
      return list;
    },
  });
}

/** Every paper I can see (the database leaves out other people's private ones) */
export function useDocs() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: docsKey(family.id, "list"),
    // with no signal, fall back to the papers kept on this phone quickly
    retry: (n) => n < 1 && navigator.onLine,
    queryFn: () => rows<Doc>(supabase.from("documents").select("*").eq("family_id", family.id).is("deleted_at", null).order("title")),
  });
}

// ---------------------------------------------------------------- pages

export const isPdf = (path: string) => path.toLowerCase().endsWith(".pdf");

export function usePageUrls(paths: string[]) {
  const { me } = useFamilyState();
  const clean = [...new Set(paths)].sort();
  return useQuery({
    queryKey: ["doc-urls", me.id, clean],
    enabled: clean.length > 0,
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
    queryFn: async () => {
      const out = new Map<string, string>();
      // a page kept on this phone opens without a signal
      for (const p of clean) {
        const blob = await offlineBlob(me.id, p);
        if (blob) out.set(p, URL.createObjectURL(blob));
      }
      const need = clean.filter((p) => !out.has(p));
      if (need.length) {
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(need, 3600);
        if (error) throw error;
        for (const d of data ?? []) if (d.signedUrl && d.path) out.set(d.path, d.signedUrl);
      }
      return out;
    },
  });
}

/** Upload one photo or PDF into the right place; returns its path */
export async function uploadPage(familyId: string, privateTo: string | null, file: File): Promise<string> {
  const pdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!pdf && !file.type.startsWith("image/")) throw new Error("Please choose a photo or a PDF");
  const blob = pdf ? file : await fitJpeg(file, 2000);
  if (blob.size > MAX_FILE) throw new Error("That file is too big (15 MB at most)");
  const folder = privateTo ? `${familyId}/docs/p/${privateTo}` : `${familyId}/docs/s`;
  const path = `${folder}/${crypto.randomUUID()}.${pdf ? "pdf" : "jpg"}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: pdf ? "application/pdf" : "image/jpeg" });
  if (error) throw new Error(/allowance|row-level|policy/i.test(error.message) ? "There's no room left, or you can't add papers here" : "Couldn't save that page. Try again");
  return path;
}

export async function removePages(paths: string[]) {
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

// ---------------------------------------------------------------- kept on this phone (no signal needed)

const cacheName = (memberId: string) => `${DOCS_CACHE_PREFIX}${memberId}`;
const keptKey = (memberId: string) => `luex.docs.kept.${memberId}`;
const pageUrl = (path: string) => `/__luex-docs/${path}`;

export function keptDocs(memberId: string): Doc[] {
  try {
    const v = JSON.parse(readLocal(keptKey(memberId)) ?? "[]") as Doc[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function isKept(memberId: string, id: string) {
  return keptDocs(memberId).some((d) => d.id === id);
}

async function offlineBlob(memberId: string, path: string): Promise<Blob | null> {
  try {
    if (typeof caches === "undefined" || !(await caches.has(cacheName(memberId)))) return null;
    const c = await caches.open(cacheName(memberId));
    const r = await c.match(pageUrl(path));
    return r ? await r.blob() : null;
  } catch {
    return null;
  }
}

/** Keep a paper (and its pages) on this phone */
export async function keepOnPhone(memberId: string, doc: Doc) {
  if (typeof caches === "undefined") throw new Error("This browser can't keep papers offline");
  const c = await caches.open(cacheName(memberId));
  if (doc.pages.length) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(doc.pages, 600);
    if (error) throw error;
    for (const d of data ?? []) {
      if (!d.signedUrl || !d.path) continue;
      const res = await fetch(d.signedUrl);
      if (!res.ok) throw new Error("Couldn't download a page. Try again");
      await c.put(pageUrl(d.path), new Response(await res.blob(), { headers: { "content-type": res.headers.get("content-type") ?? "" } }));
    }
  }
  writeLocal(keptKey(memberId), JSON.stringify([...keptDocs(memberId).filter((d) => d.id !== doc.id), doc]));
}

export async function forgetOnPhone(memberId: string, id: string) {
  const doc = keptDocs(memberId).find((d) => d.id === id);
  writeLocal(keptKey(memberId), JSON.stringify(keptDocs(memberId).filter((d) => d.id !== id)));
  if (!doc || typeof caches === "undefined") return;
  try {
    const c = await caches.open(cacheName(memberId));
    for (const p of doc.pages) await c.delete(pageUrl(p));
  } catch {
    /* nothing kept */
  }
}

/** Keep the kept copy in step with the latest version (pages changed, renamed, binned or no longer visible) */
export async function syncKept(memberId: string, docs: Doc[]) {
  const byId = new Map(docs.map((d) => [d.id, d]));
  for (const k of keptDocs(memberId)) {
    const now = byId.get(k.id);
    if (!now) { await forgetOnPhone(memberId, k.id); continue; }
    if (now.updated_at !== k.updated_at) {
      try { await forgetOnPhone(memberId, k.id); await keepOnPhone(memberId, now); } catch { /* try again next time */ }
    }
  }
}

// ---------------------------------------------------------------- download everything

export async function downloadAll(docs: Doc[], folders: Folder[], nameOf: (id: string | null) => string | null, onProgress?: (done: number, total: number) => void) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 80) || "Paper";
  const total = docs.reduce((n, d) => n + d.pages.length, 0);
  let done = 0;
  const lines = ["Title,Folder,Who,Runs out,Where it's kept,Reference,Phone,Price,Notes"];
  // a cell starting with = + - @ is treated as text by spreadsheets
  const csv = (v: string | number | null | undefined) => { const t = String(v ?? ""); return `"${(/^[=+\-@\t\r]/.test(t) ? "'" : "") + t.replace(/"/g, '""')}"`; };
  let missed = 0;
  for (const d of docs) {
    const dir = zip.folder(safe(folderName.get(d.folder_id ?? "") ?? "Other"))!;
    const base = safe(d.title + (nameOf(d.person_id) ? ` (${nameOf(d.person_id)})` : ""));
    lines.push([d.title, folderName.get(d.folder_id ?? "") ?? "", nameOf(d.person_id) ?? "", d.expires_on ?? "", d.where_kept ?? "", d.ref ?? "", d.phone ?? "", d.price ?? "", d.notes].map(csv).join(","));
    if (!d.pages.length) continue;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(d.pages, 600);
    if (error) throw error;
    let i = 0;
    for (const u of data ?? []) {
      i++;
      if (!u.signedUrl || !u.path) continue;
      const res = await fetch(u.signedUrl);
      if (!res.ok) missed++;
      else dir.file(`${base}${d.pages.length > 1 ? ` – page ${i}` : ""}.${isPdf(u.path) ? "pdf" : "jpg"}`, await res.blob());
      onProgress?.(++done, total);
    }
  }
  zip.file("List of papers.csv", lines.join("\n"));
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "Luex papers.zip";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  return missed;
}

// ---------------------------------------------------------------- dates and words

export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export function longDate(k: string): string {
  return new Date(`${k}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** "Runs out in 3 weeks", "Ran out 2 days ago" */
export function expiryWords(expires: string, today: string): string {
  const n = daysBetween(today, expires);
  if (n < 0) return n === -1 ? "Ran out yesterday" : `Ran out ${-n} days ago`;
  if (n === 0) return "Runs out today";
  if (n === 1) return "Runs out tomorrow";
  if (n < 14) return `Runs out in ${n} days`;
  if (n < 63) return `Runs out in ${Math.round(n / 7)} weeks`;
  if (n < 730) return `Runs out in ${Math.round(n / 30.4)} months`;
  return `Runs out in ${Math.round(n / 365)} years`;
}

export type ExpiryState = "none" | "ok" | "soon" | "gone";
export function expiryState(d: Doc, today: string): ExpiryState {
  if (!d.expires_on) return "none";
  const n = daysBetween(today, d.expires_on);
  if (n < 0) return "gone";
  return n <= d.remind_days ? "soon" : "ok";
}

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
export const money = (n: number | string | null | undefined) => gbp.format(Number(n ?? 0));

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/fetch|network/i.test(m)) return "No signal. Try again in a moment";
  if (/row-level|permission/i.test(m)) return "That change is not allowed";
  return m.length < 120 ? m : "Something went wrong. Try again";
}

/** Suggested reminder: passports 6 months ahead (many countries need 6 months left), everything else a month */
export function suggestedRemind(title: string, folderName: string | undefined): number {
  return /passport/i.test(title) || /passport/i.test(folderName ?? "") ? 180 : 30;
}

/** The papers most households keep: ticked off as a paper with a matching name is added */
/** each: one per person (parents); mine: also on a grown-up's own list */
export const CHECKLIST: { title: string; folder: string; match: RegExp; each?: boolean; mine?: boolean }[] = [
  { title: "Passport", folder: "ID and passports", match: /passport/i, each: true, mine: true },
  { title: "Birth certificate", folder: "ID and passports", match: /birth/i, each: true, mine: true },
  { title: "Driving licence", folder: "ID and passports", match: /driving/i, mine: true },
  { title: "Home insurance", folder: "Insurance", match: /home insurance|house insurance|contents insurance|buildings insurance/i },
  { title: "Car insurance", folder: "Car", match: /car insurance|motor/i },
  { title: "MOT certificate", folder: "Car", match: /\bmot\b/i },
  { title: "Car tax", folder: "Car", match: /car tax|road tax|vehicle tax|\bved\b/i },
  { title: "Breakdown cover", folder: "Car", match: /breakdown/i },
  { title: "Car logbook (V5C)", folder: "Car", match: /logbook|v5/i },
  { title: "Tenancy or mortgage", folder: "House", match: /tenancy|mortgage|lease/i },
  { title: "Boiler service", folder: "House", match: /boiler|gas safe/i },
  { title: "TV licence", folder: "House", match: /tv licen/i },
  { title: "Will", folder: "Other", match: /^(my |last )?will\b|\bwill and testament/i, mine: true },
  { title: "Pet insurance", folder: "Pets", match: /\bpets?\b|\bvet/i },
  { title: "Travel insurance", folder: "Insurance", match: /travel insurance/i, mine: true },
  { title: "National Insurance number", folder: "Work", match: /national insurance|\bni\b/i, mine: true },
];
