import { Images, LayoutGrid, ListChecks, MessagesSquare, MoreHorizontal, NotebookPen, Search, Settings2, Target } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs } from "@/modules/calendar/ui";

import { ChatsTab } from "./chats";
import { useBoardLive, useUnreadTotal } from "./data";
import { BoardHome } from "./front";
import { GoalsTab } from "./goals";
import { JournalTab } from "./journal";
import { ListsTab } from "./lists";
import { PhotosTab } from "./photos";
import { BoardSearch } from "./search";
import { BoardSettingsDialog } from "./settings";

export type BoardTab = "home" | "chats" | "photos" | "lists" | "goals" | "journal";
const TABS: BoardTab[] = ["home", "chats", "photos", "lists", "goals", "journal"];

/** Where to go inside the Board (from the front page, search and notification links) */
export type BoardTarget = {
  tab: BoardTab;
  threadId?: string;
  messageId?: string;
  listId?: string;
  goalId?: string;
  memoryId?: string;
  albumId?: string;
  promptId?: string;
};

function fromUrl(): BoardTarget {
  const p = new URLSearchParams(window.location.search);
  const tab = p.get("tab") as BoardTab | null;
  const t: BoardTarget = { tab: tab && TABS.includes(tab) ? tab : "home" };
  if (p.get("thread")) { t.tab = "chats"; t.threadId = p.get("thread")!; t.messageId = p.get("message") ?? undefined; }
  if (p.get("memory")) { t.tab = "journal"; t.memoryId = p.get("memory")!; }
  if (p.get("goal")) { t.tab = "goals"; t.goalId = p.get("goal")!; }
  if (p.get("prompt")) { t.tab = "journal"; t.promptId = p.get("prompt")!; }
  if ([...p.keys()].length) window.history.replaceState(null, "", window.location.pathname);
  return t;
}

export function BoardPage() {
  useBoardLive();
  const first = useMemo(fromUrl, []);
  const [target, setTarget] = useState<BoardTarget>(first);
  const [dialog, setDialog] = useState<null | "search" | "settings">(null);
  const unread = useUnreadTotal();
  const go = (t: BoardTarget) => setTarget(t);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <Tabs<BoardTab>
            value={target.tab}
            onChange={(tab) => setTarget({ tab })}
            items={[
              { key: "home", label: "Board", icon: LayoutGrid },
              { key: "chats", label: unread ? `Chats (${unread > 99 ? "99+" : unread})` : "Chats", icon: MessagesSquare },
              { key: "photos", label: "Photos", icon: Images },
              { key: "lists", label: "Lists", icon: ListChecks },
              { key: "goals", label: "Goals", icon: Target },
              { key: "journal", label: "Journal", icon: NotebookPen },
            ]}
          />
        </div>
        <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" onClick={() => setDialog("search")} aria-label="Search the Board"><Search className="size-5" /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" aria-label="More"><MoreHorizontal className="size-5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => setDialog("settings")}><Settings2 className="mr-2 size-4" /> Board settings</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {target.tab === "home" ? <BoardHome onGo={go} /> : null}
      {target.tab === "chats" ? <ChatsTab key={target.threadId ?? "chats"} target={target} onGo={go} /> : null}
      {target.tab === "photos" ? <PhotosTab target={target} onGo={go} /> : null}
      {target.tab === "lists" ? <ListsTab target={target} onGo={go} /> : null}
      {target.tab === "goals" ? <GoalsTab target={target} onGo={go} /> : null}
      {target.tab === "journal" ? <JournalTab target={target} onGo={go} /> : null}

      <BoardSearch open={dialog === "search"} onOpenChange={(o) => setDialog(o ? "search" : null)} onGo={(t) => { setDialog(null); go(t); }} />
      <BoardSettingsDialog open={dialog === "settings"} onOpenChange={(o) => setDialog(o ? "settings" : null)} />
    </div>
  );
}
