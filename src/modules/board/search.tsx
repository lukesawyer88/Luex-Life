// Search across messages, lists, notes, memories and goals. The database only returns what you may see.
import { useQuery } from "@tanstack/react-query";
import { BookHeart, ListChecks, Loader2, MessagesSquare, Search, StickyNote, Target } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Sheet } from "@/modules/calendar/ui";

import type { BoardTarget } from "./board-page";
import { boardKey, rows } from "./data";

type Hit = { kind: string; id: string; ref: string | null; title: string; snippet: string; at: string };

const GROUPS: { kind: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { kind: "message", label: "Messages", icon: MessagesSquare },
  { kind: "list_item", label: "Lists", icon: ListChecks },
  { kind: "note", label: "Notes", icon: StickyNote },
  { kind: "memory", label: "Memories and journal", icon: BookHeart },
  { kind: "goal", label: "Goals", icon: Target },
];

function targetFor(h: Hit): BoardTarget {
  switch (h.kind) {
    case "message": return { tab: "chats", threadId: h.ref ?? undefined, messageId: h.id };
    case "list_item": return { tab: "lists", listId: h.ref ?? undefined };
    case "memory": return { tab: "journal", memoryId: h.id };
    case "goal": return { tab: "goals", goalId: h.id };
    default: return { tab: "home" };
  }
}

export function BoardSearch({ open, onOpenChange, onGo }: { open: boolean; onOpenChange: (o: boolean) => void; onGo: (t: BoardTarget) => void }) {
  const { family } = useFamilyState();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { if (!open) { setQ(""); setTerm(""); } }, [open]);

  const res = useQuery({
    queryKey: boardKey(family.id, "search", term),
    enabled: open && term.length >= 2,
    queryFn: () => rows<Hit>(supabase.rpc("board_search", { p_q: term })),
  });
  const hits = res.data ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Search the Board">
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input data-autofocus autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages, lists, notes…" className="h-12 pl-10 text-base" aria-label="Search" />
        </div>
        {term.length < 2 ? <p className="text-sm text-muted-foreground">Type at least two letters.</p> : null}
        {res.isFetching ? <Loader2 className="size-5 animate-spin" /> : null}
        {term.length >= 2 && !res.isFetching && hits.length === 0 ? <p className="text-sm text-muted-foreground">Nothing found for "{term}".</p> : null}
        {GROUPS.map((g) => {
          const these = hits.filter((h) => h.kind === g.kind);
          if (!these.length) return null;
          const Icon = g.icon;
          return (
            <div key={g.kind}>
              <h3 className="mb-1.5 flex items-center gap-2 text-sm font-bold"><Icon className="size-4" /> {g.label}</h3>
              <ul className="space-y-1">
                {these.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => onGo(targetFor(h))} className="flex min-h-12 w-full flex-col justify-center rounded-xl bg-[var(--surface)] px-3 py-2 text-left hover:bg-muted">
                      {h.title ? <span className="text-xs font-semibold text-muted-foreground">{h.title}</span> : null}
                      <span className="line-clamp-2 text-sm">{h.snippet || h.title}</span>
                      <span className="text-xs text-muted-foreground">{new Date(h.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
