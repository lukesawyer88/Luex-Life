// Uploading photos and videos: each file shows its own progress, then a tick, or a clear reason and "Try again".
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, HardDrive, Loader2, RotateCcw, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useFamilyState } from "@/lib/family-context";
import { cn } from "@/lib/utils";

import { ALLOWANCE_WARN, bytesText, refreshBoard, uploadMedia, useStorageUse, type Media, type UploadTarget } from "./data";

export type Upload = {
  id: string;
  file: File;
  target: UploadTarget;
  extra: Parameters<typeof uploadMedia>[3];
  status: "waiting" | "uploading" | "done" | "error";
  error?: string;
};

/** A queue of uploads, two at a time. Files stay in memory so a failed one can be tried again. */
export function useUploads(onDone?: (m: Media) => void) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [list, setList] = useState<Upload[]>([]);
  const running = useRef(0);
  const queue = useRef<Upload[]>([]);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const set = (id: string, patch: Partial<Upload>) => setList((l) => l.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  const pump = useCallback(() => {
    while (running.current < 2 && queue.current.length) {
      const u = queue.current.shift()!;
      running.current++;
      set(u.id, { status: "uploading", error: undefined });
      uploadMedia(family.id, u.file, u.target, u.extra)
        .then((m) => {
          set(u.id, { status: "done" });
          doneRef.current?.(m);
        })
        .catch((e: unknown) => set(u.id, { status: "error", error: e instanceof Error ? e.message : "Upload failed. Try again" }))
        .finally(() => {
          running.current--;
          void refreshBoard(qc, family.id);
          pump();
        });
    }
  }, [family.id, qc]);

  const add = useCallback((files: File[], target: UploadTarget, extra: Upload["extra"] = {}) => {
    const items: Upload[] = files.map((file) => ({ id: crypto.randomUUID(), file, target, extra, status: "waiting" }));
    setList((l) => [...l.filter((u) => u.status !== "done"), ...items]);
    queue.current.push(...items);
    pump();
  }, [pump]);

  const retry = (u: Upload) => {
    set(u.id, { status: "waiting", error: undefined });
    queue.current.push({ ...u, status: "waiting" });
    pump();
  };
  const dismiss = (id: string) => setList((l) => l.filter((u) => u.id !== id));
  const clearDone = () => setList((l) => l.filter((u) => u.status !== "done"));
  const busy = list.some((u) => u.status === "waiting" || u.status === "uploading");
  return { list, add, retry, dismiss, clearDone, busy };
}

export function UploadList({ uploads }: { uploads: ReturnType<typeof useUploads> }) {
  const { list, retry, dismiss, clearDone, busy } = uploads;
  if (!list.length) return null;
  const done = list.filter((u) => u.status === "done").length;
  return (
    <div className="rounded-2xl bg-[var(--surface)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <p className="flex-1 text-sm font-semibold">{busy ? `Uploading ${done} of ${list.length}` : `${done} of ${list.length} added`}</p>
        {!busy ? <Button variant="ghost" className="h-9 rounded-full px-3" onClick={clearDone}>Done</Button> : null}
      </div>
      <ul className="space-y-1.5">
        {list.map((u) => (
          <li key={u.id} className="flex min-h-10 items-center gap-2 text-sm">
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-full",
              u.status === "done" ? "bg-[var(--status-green-soft)] text-[var(--status-green)]"
              : u.status === "error" ? "bg-[var(--status-red-soft)] text-[var(--status-red)]" : "bg-muted text-muted-foreground")}>
              {u.status === "done" ? <Check className="size-4" /> : u.status === "error" ? <AlertCircle className="size-4" /> : <Loader2 className={cn("size-4", u.status === "uploading" && "animate-spin")} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{u.file.name || "Photo"}</span>
              {u.status === "error" ? <span className="block text-xs text-[var(--status-red)]">{u.error}</span> : u.status === "waiting" ? <span className="block text-xs text-muted-foreground">Waiting</span> : null}
            </span>
            {u.status === "error" ? (
              <>
                <Button variant="outline" className="h-9 rounded-full px-3" onClick={() => retry(u)}><RotateCcw className="size-4" /> Try again</Button>
                <Button variant="ghost" size="icon" className="size-9 rounded-full" onClick={() => dismiss(u.id)} aria-label="Remove from list"><X className="size-4" /></Button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** How much of the family's 50 GB is used, with a warning at 80% and "Full" at 100% */
export function SpaceBar({ compact }: { compact?: boolean }) {
  const q = useStorageUse();
  if (!q.data) return null;
  const { used, allowance } = q.data;
  const share = allowance ? Math.min(1, used / allowance) : 0;
  const full = share >= 1;
  const warn = share >= ALLOWANCE_WARN;
  return (
    <div className={cn("rounded-2xl p-3", full ? "bg-[var(--status-red-soft)]" : warn ? "bg-[var(--status-amber-soft)]" : "bg-[var(--surface)]")}>
      <div className="flex items-center gap-2 text-sm">
        <HardDrive className="size-4 shrink-0" />
        <span className="flex-1 font-semibold">{full ? "Full" : "Family space"}</span>
        <span className="text-xs text-muted-foreground">{bytesText(used)} of {bytesText(allowance)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Space used">
        <div className={cn("h-full rounded-full", full ? "bg-[var(--status-red)]" : warn ? "bg-[var(--status-amber)]" : "bg-[var(--status-blue)]")} style={{ width: `${Math.max(2, share * 100)}%` }} />
      </div>
      {!compact && full ? <p className="mt-2 text-xs">Your family has used all its space. Remove some videos or download and remove older photos to add more.</p> : null}
      {!compact && warn && !full ? <p className="mt-2 text-xs">You've used {Math.round(share * 100)}% of your space. Videos use the most.</p> : null}
    </div>
  );
}
