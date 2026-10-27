// Full-screen photo and video viewer: arrows, swipe, Escape to close. Used in the app and on album links.
import { ChevronLeft, ChevronRight, Download, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ViewerItem = { key: string; url?: string; kind: string; mime: string; caption?: string };

export function Lightbox({
  items, index, onIndex, onClose, side, cantPlayHint,
}: {
  items: ViewerItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** extra panel (caption, people, buttons) shown beside or under the picture */
  side?: ReactNode;
  /** shown when a video can't play on this device */
  cantPlayHint?: (item: ViewerItem) => ReactNode;
}) {
  const item = items[index];
  const touch = useRef<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const prev = () => index > 0 && onIndex(index - 1);
  const next = () => index < items.length - 1 && onIndex(index + 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!item) return null;
  const isVideo = item.kind === "video";
  const noPlay = isVideo && (failed === item.key || document.createElement("video").canPlayType(item.mime) === "");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white lg:flex-row" role="dialog" aria-modal="true" aria-label="Photo viewer">
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (dx > 50) prev(); else if (dx < -50) next();
        }}
      >
        {!item.url ? (
          <Loader2 className="size-8 animate-spin opacity-70" />
        ) : isVideo && !noPlay ? (
          <video key={item.key} src={item.url} controls playsInline className="max-h-full max-w-full" onError={() => setFailed(item.key)} />
        ) : isVideo ? (
          <div className="max-w-sm px-6 text-center">
            <p className="mb-3 text-lg font-semibold">This video can't play on this device</p>
            {cantPlayHint ? cantPlayHint(item) : <a href={item.url} download className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 font-semibold text-black"><Download className="size-4" /> Download to watch</a>}
          </div>
        ) : (
          <img key={item.key} src={item.url} alt={item.caption || "Photo"} className="max-h-full max-w-full object-contain" />
        )}
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] grid size-12 place-items-center rounded-full bg-white/15 hover:bg-white/25"><X className="size-6" /></button>
        {index > 0 ? (
          <button type="button" onClick={prev} aria-label="Previous" className="absolute left-2 top-1/2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 hover:bg-white/25 sm:grid"><ChevronLeft className="size-7" /></button>
        ) : null}
        {index < items.length - 1 ? (
          <button type="button" onClick={next} aria-label="Next" className="absolute right-2 top-1/2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 hover:bg-white/25 sm:grid"><ChevronRight className="size-7" /></button>
        ) : null}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs">{index + 1} of {items.length}</div>
      </div>
      {side ? (
        <div className={cn("scrollbar-thin max-h-[42dvh] shrink-0 overflow-y-auto bg-[var(--surface)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-foreground lg:max-h-none lg:w-[360px]")}>{side}</div>
      ) : item.caption ? (
        <p className="shrink-0 px-4 py-3 text-center text-sm">{item.caption}</p>
      ) : null}
    </div>
  );
}
