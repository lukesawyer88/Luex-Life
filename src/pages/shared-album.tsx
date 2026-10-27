// A read-only album for relatives, opened from a link a family member made. No sign-in.
// Nothing here is saved on the device.
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Images, Loader2, Play } from "lucide-react";
import { useState } from "react";

import { supabase } from "@/lib/supabase";
import { Lightbox } from "@/modules/board/photo-viewer";

type SharedItem = { url: string; kind: string; mime: string; caption: string; width: number | null; height: number | null };
type SharedAlbum = { title: string; label: string; expiresAt: string; items: SharedItem[] };

export function SharedAlbumPage() {
  // the route is /a/$token
  const token = (useParams({ strict: false }) as { token?: string }).token ?? "";
  const [open, setOpen] = useState<number | null>(null);
  const q = useQuery({
    queryKey: ["shared-album", token],
    retry: 0,
    staleTime: 50 * 60_000,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("album-share", { body: { token } });
      if (error) return null;
      return (data ?? null) as SharedAlbum | null;
    },
  });
  const d = q.data;

  return (
    <div className="flex h-dvh flex-col p-3 sm:p-5" style={{ background: "var(--backdrop-base)" }}>
      <div className="glass-panel mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col p-4 sm:p-6">
        <header className="mb-3 shrink-0 text-center">
          <div className="text-base font-extrabold tracking-[0.32em]">LUEX</div>
          <div className="text-xs text-muted-foreground">Life</div>
          {d ? (
            <>
              <h1 className="mt-3 text-xl font-bold">{d.title}</h1>
              <p className="text-sm text-muted-foreground">
                Shared with {d.label} · works until {new Date(d.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </>
          ) : null}
        </header>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {q.isLoading ? (
            <div className="grid h-full place-items-center"><Loader2 className="size-6 animate-spin" /></div>
          ) : !d ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Images className="mb-3 size-10 text-muted-foreground" />
              <p className="font-semibold">This link has ended or been stopped</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">Ask the family to send you a new one.</p>
            </div>
          ) : d.items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">There's nothing in this album yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-6">
              {d.items.map((it, i) => (
                <button key={it.url} type="button" onClick={() => setOpen(i)} className="relative aspect-square overflow-hidden rounded-lg bg-muted" aria-label={it.caption || (it.kind === "video" ? "Video" : "Photo")}>
                  {it.kind === "video" ? (
                    <span className="grid size-full place-items-center bg-black/80 text-white"><Play className="size-8" /></span>
                  ) : <img src={it.url} alt="" loading="lazy" className="size-full object-cover" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {d && open != null ? (
        <Lightbox
          items={d.items.map((it) => ({ key: it.url, url: it.url, kind: it.kind, mime: it.mime, caption: it.caption }))}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}
