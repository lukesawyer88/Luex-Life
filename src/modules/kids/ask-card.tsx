// A child's ask for more screen time; parents answer it here (also on Home).
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import type { Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";

import { answerAsk, errMsg, type KidAsk } from "./data";

export function AskCard({ ask, child, canAnswer }: { ask: KidAsk; child: Member; canAnswer: boolean }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function answer(s: "yes" | "no") {
    setBusy(true);
    try { await answerAsk(qc, family.id, ask.id, s); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <div className="glass-tile flex flex-wrap items-center gap-3 p-3" data-testid="ask-card">
      <MemberAvatar member={child} size="sm" className="size-9 ring-0 ring-offset-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{child.display_name} asks for {ask.minutes === 60 ? "1 more hour" : `${ask.minutes} more minutes`}</span>
        <span className="block text-sm text-muted-foreground">{ask.reason || "Screen time"}{canAnswer ? "" : " · waiting for an answer"}</span>
      </span>
      {canAnswer ? (
        <span className="flex gap-2">
          <Button data-testid="ask-yes" disabled={busy} className="h-11 rounded-full bg-[var(--status-green)] px-5 text-base text-white hover:bg-[var(--status-green)]/90" onClick={() => void answer("yes")}>Yes</Button>
          <Button data-testid="ask-no" disabled={busy} variant="outline" className="h-11 rounded-full px-5 text-base" onClick={() => void answer("no")}>No</Button>
        </span>
      ) : null}
    </div>
  );
}
