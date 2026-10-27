// Luex Life read-only album links: relatives without a login see one album through a time-limited link.
// The link's token is checked by the database (public.shared_album); this function then signs each file's
// address for one hour. Tokens are secrets: never logged.
import { CORS, json, serviceClient } from "../_shared/http.ts";

const SIGN_SECONDS = 3600;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Not allowed" }, 405);
  let token = "";
  try {
    const body = await req.json();
    token = typeof body?.token === "string" ? body.token : "";
  } catch {
    return json({ error: "This link is not working" }, 400);
  }
  if (!token || token.length > 100) return json({ error: "This link is not working" }, 404);

  const db = serviceClient();
  const { data, error } = await db.rpc("shared_album", { p_token: token });
  if (error) return json({ error: "Something went wrong. Please try again" }, 500);
  if (!data) return json({ error: "This link has ended or been stopped" }, 404);

  type Item = { path: string; kind: string; mime: string; caption: string; width: number | null; height: number | null };
  const album = data as { title: string; label: string; expires_at: string; items: Item[] };
  const items = album.items.slice(0, 500);
  const paths = items.map((i) => i.path);
  const signed = paths.length
    ? (await db.storage.from("board-media").createSignedUrls(paths, SIGN_SECONDS)).data ?? []
    : [];
  const urlFor = new Map(signed.filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));

  return json({
    title: album.title,
    label: album.label,
    expiresAt: album.expires_at,
    items: items
      .filter((i) => urlFor.has(i.path))
      .map((i) => ({ url: urlFor.get(i.path), kind: i.kind, mime: i.mime, caption: i.caption, width: i.width, height: i.height })),
  });
});
