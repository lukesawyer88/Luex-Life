// Parents: the daily journal questions (Luex's own, plus the family's). Which children get them, and when,
// is set in Board settings.
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Sheet } from "@/modules/calendar/ui";

import { refreshBoard, usePrompts } from "./data";

export function PromptsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const prompts = usePrompts();
  const [text, setText] = useState("");
  const ours = (prompts.data ?? []).filter((p) => p.family_id === family.id);
  const builtIn = (prompts.data ?? []).filter((p) => p.family_id == null);

  async function add() {
    const t = text.trim();
    if (t.length < 3) return;
    const { error } = await supabase.from("board_prompts").insert({ family_id: family.id, text: t });
    if (error) { toast.error(friendlyError(error)); return; }
    setText("");
    void refreshBoard(qc, family.id);
  }
  async function remove(id: string) {
    const { error } = await supabase.from("board_prompts").update({ archived_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(friendlyError(error)); else void refreshBoard(qc, family.id);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Journal questions" description="Children who have questions switched on get one a day. Turn them on, and pick the time, in Board settings.">
      <div className="flex gap-2">
        <Input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="What did Rex the dog do today?" className="h-11" onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
        <Button className="h-11 shrink-0 rounded-full px-4" disabled={text.trim().length < 3} onClick={() => void add()}><Plus className="size-4" /> Add</Button>
      </div>
      <h3 className="mb-2 mt-5 text-sm font-bold">Your family's questions</h3>
      {ours.length === 0 ? <p className="text-sm text-muted-foreground">None yet. Your own questions are asked more often than the built-in ones.</p> : (
        <ul className="space-y-1.5">
          {ours.map((p) => (
            <li key={p.id} className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--surface)] px-3">
              <span className="flex-1 text-sm">{p.text}</span>
              <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => void remove(p.id)} aria-label="Remove question"><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mb-2 mt-5 text-sm font-bold">Built-in questions</h3>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {builtIn.map((p) => <li key={p.id}>{p.text}</li>)}
      </ul>
    </Sheet>
  );
}
