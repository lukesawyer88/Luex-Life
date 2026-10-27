// Fetching a public web page or picture someone gave us a link to, without reaching our own or private networks.
// Same safety rules as the calendar import (https only, public addresses only, each redirect re-checked).
import { checkUrl, FeedError } from "./safe-fetch.ts";

export class FetchError extends Error {}

/** GET a public https address: at most 3 redirects, 10 seconds, maxBytes */
export async function fetchPublic(raw: string, maxBytes: number, accept: string): Promise<{ bytes: Uint8Array; type: string; url: string }> {
  let url: URL;
  try {
    url = await checkUrl(raw);
  } catch (e) {
    throw new FetchError(e instanceof FeedError ? "That link can't be used" : "That link isn't a web address");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    for (let hop = 0; hop <= 3; hop++) {
      let res: Response;
      try {
        res = await fetch(url, { redirect: "manual", signal: ctrl.signal, headers: { Accept: accept, "User-Agent": "Mozilla/5.0 (compatible; LuexLife-Recipes/1.0)" } });
      } catch {
        throw new FetchError("Couldn't reach that website");
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        await res.body?.cancel();
        if (!loc || hop === 3) throw new FetchError("That link keeps moving");
        try { url = await checkUrl(new URL(loc, url).href); } catch { throw new FetchError("That link can't be used"); }
        continue;
      }
      if (!res.ok || !res.body) { await res.body?.cancel(); throw new FetchError("That website didn't let us read the page"); }
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) { await reader.cancel(); throw new FetchError("That page is too big"); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let o = 0;
      for (const c of chunks) { bytes.set(c, o); o += c.length; }
      return { bytes, type: (res.headers.get("content-type") ?? "").toLowerCase(), url: url.href };
    }
    throw new FetchError("That link keeps moving");
  } catch (e) {
    if (e instanceof FetchError) throw e;
    if ((e as Error)?.name === "AbortError") throw new FetchError("That website took too long to answer");
    throw new FetchError("Couldn't read that page");
  } finally {
    clearTimeout(timer);
  }
}
