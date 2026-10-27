// Fetching a calendar link someone typed in, without letting it reach our own or private networks.

function v4Private(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || // shared address space (CGNAT)
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && p[2] === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function v6Private(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::" || s === "::1") return true;
  const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return v4Private(mapped[1]);
  return /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || s.startsWith("64:ff9b:") || s.startsWith("2001:db8:");
}

export function isPrivateAddress(ip: string): boolean {
  return ip.includes(":") ? v6Private(ip) : v4Private(ip);
}

export class FeedError extends Error {}

async function checkUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw.replace(/^webcal:\/\//i, "https://"));
  } catch {
    throw new FeedError("That link isn't a web address");
  }
  if (u.protocol !== "https:") throw new FeedError("Only secure (https) calendar links work");
  if (u.port && u.port !== "443") throw new FeedError("That calendar link can't be used");
  if (u.username || u.password) throw new FeedError("That calendar link can't be used");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^[\d.]+$/.test(host) || host.includes(":") || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new FeedError("That calendar link can't be used");
  }
  const addrs: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    try {
      addrs.push(...(await Deno.resolveDns(host, type)));
    } catch {
      /* no records of this type */
    }
  }
  if (!addrs.length) throw new FeedError("Couldn't find that calendar's website");
  if (addrs.some(isPrivateAddress)) throw new FeedError("That calendar link can't be used");
  return u;
}

/** GET a public https calendar file: at most 3 redirects (each checked again), 10 seconds and 5 MB */
export async function safeFetchText(raw: string, maxBytes = 5 * 1024 * 1024): Promise<string> {
  let url = await checkUrl(raw);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    for (let hop = 0; hop <= 3; hop++) {
      let res: Response;
      try {
        res = await fetch(url, { redirect: "manual", signal: ctrl.signal, headers: { Accept: "text/calendar, text/plain;q=0.8, */*;q=0.1", "User-Agent": "LuexLife-Calendar/1.0" } });
      } catch {
        throw new FeedError("Couldn't reach that calendar. Check the link");
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        await res.body?.cancel();
        if (!loc || hop === 3) throw new FeedError("That calendar link keeps moving. Copy it again");
        url = await checkUrl(new URL(loc, url).href);
        continue;
      }
      if (res.status === 401 || res.status === 403) { await res.body?.cancel(); throw new FeedError("That calendar is private. Use its secret address (iCal link)"); }
      if (res.status === 404) { await res.body?.cancel(); throw new FeedError("That calendar wasn't found. It may have been deleted"); }
      if (!res.ok || !res.body) { await res.body?.cancel(); throw new FeedError("That calendar isn't working right now"); }
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) {
          await reader.cancel();
          throw new FeedError("That calendar is too big to bring in");
        }
        chunks.push(value);
      }
      const all = new Uint8Array(size);
      let o = 0;
      for (const c of chunks) { all.set(c, o); o += c.length; }
      const text = new TextDecoder().decode(all);
      if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) throw new FeedError("That link isn't a calendar file (it should end in .ics)");
      return text;
    }
    throw new FeedError("That calendar link keeps moving. Copy it again");
  } catch (e) {
    if (e instanceof FeedError) throw e;
    if ((e as Error)?.name === "AbortError") throw new FeedError("That calendar took too long to answer");
    throw new FeedError("Couldn't bring that calendar in");
  } finally {
    clearTimeout(timer);
  }
}
