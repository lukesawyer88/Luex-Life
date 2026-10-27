import { Link } from "@tanstack/react-router";
import { CalendarDays, Camera, UserPlus } from "lucide-react";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { useFamilyState } from "@/lib/family-context";
import { WhatsForDinner } from "@/modules/food/whats-for-dinner";
import { MedicineNow } from "@/modules/health/home-card";
import { BinsToday } from "@/modules/home-care/home-card";
import { NextHosting } from "@/modules/hosting/home-card";
import { KidAsks } from "@/modules/kids/home-card";
import { SchoolToday } from "@/modules/school/home-card";
import { NextTrip } from "@/modules/trips/home-card";

/** The cards from each module (each hides itself when there's nothing to show or the module is off) */
function ModuleCards() {
  return (
    <>
      <MedicineNow />
      <KidAsks />
      <div className="mb-4"><WhatsForDinner compact /></div>
      <SchoolToday />
      <BinsToday />
      <NextTrip />
      <NextHosting />
    </>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function HomePage() {
  const { me, members, isParent } = useFamilyState();
  const today = new Date().toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" });

  const todo: { to: "/family"; icon: typeof Camera; text: string }[] = [];
  if (!me.avatar_path) todo.push({ to: "/family", icon: Camera, text: "Add your picture" });
  if (isParent && members.length < 2) todo.push({ to: "/family", icon: UserPlus, text: "Add the rest of your family" });

  return (
    <Windows>
      <RecordsWindow>
        <div className="mb-4">
          <h2 className="text-lg font-bold">{greeting()}, {me.display_name}</h2>
          <p className="text-sm text-muted-foreground">{today}</p>
        </div>

        {/* on wide screens these cards sit in the side panel instead */}
        <div className="lg:hidden">
          <ModuleCards />
        </div>

        <h3 className="mb-2 text-sm font-semibold">Your family</h3>
        <ul className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {members.map((m) => (
            <li key={m.id} className="glass-tile flex items-center gap-3 p-3">
              <MemberAvatar member={m} />
              <span className="min-w-0 truncate text-sm font-medium">{m.display_name}</span>
            </li>
          ))}
        </ul>

        {todo.length ? (
          <>
            <h3 className="mb-2 text-sm font-semibold">Finish setting up</h3>
            <ol className="space-y-2">
              {todo.map((t, i) => (
                <li key={t.text}>
                  <Link to={t.to} className="glass-tile flex min-h-12 items-center gap-3 p-3 text-sm font-medium">
                    <span className="grid size-8 place-items-center rounded-xl bg-[var(--status-blue-soft)] text-[var(--status-blue)]"><t.icon className="size-4" /></span>
                    {i + 1}. {t.text}
                  </Link>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </RecordsWindow>
      <DetailWindow>
        <ModuleCards />
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4" />Today</div>
        <p className="text-sm">Nothing planned yet.</p>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">Your family calendar is the next thing we're building. Everything planned for today will show up here, for each person.</p>
      </DetailWindow>
    </Windows>
  );
}
