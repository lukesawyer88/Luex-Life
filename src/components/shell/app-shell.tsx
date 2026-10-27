import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun, Users } from "lucide-react";
import { useState, type ReactNode } from "react";

import { MemberAvatar } from "@/components/member-avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { useFamilyState } from "@/lib/family-context";
import { readLocal, writeLocal } from "@/lib/local";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { MODULE_BY_KEY, ROLE_LABEL, groupModules, visibleModules, type ModuleConfig } from "@/modules/registry";

const NAV_KEY = "luex.life.nav";

function moduleHref(m: ModuleConfig) {
  return m.key === "home" ? "/" : `/m/${m.key}`;
}

function isActive(pathname: string, m: ModuleConfig) {
  return m.key === "home" ? pathname === "/" : pathname === `/m/${m.key}`;
}

function NavItem({ m, active, collapsed }: { m: ModuleConfig; active: boolean; collapsed: boolean }) {
  const Icon = m.icon;
  return (
    <Link
      to={moduleHref(m)}
      title={m.name}
      aria-current={active ? "page" : undefined}
      className={cn(
        "lx-nav-item group flex items-center gap-3 rounded-full px-2 text-sm font-medium transition-colors",
        active ? "text-[var(--sidebar-active-fg)]" : "text-[var(--sidebar-fg)] hover:bg-[var(--sidebar-hover)]",
      )}
      style={active ? { background: "linear-gradient(90deg, #F3E2B8, #CFB783 60%, #B39A63)" } : undefined}
    >
      <span
        className={cn(
          "lx-nav-ico grid size-8 shrink-0 place-items-center rounded-full",
          active ? "bg-[#0d0d0f] text-[#e2cd9c]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-fg)]",
        )}
      >
        <Icon className="size-[18px]" />
      </span>
      <span className={cn("hidden truncate", !collapsed && "lg:inline")}>{m.name}</span>
    </Link>
  );
}

function Wordmark({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="px-3 pb-2 pt-3">
      <div className={cn("text-center text-base font-extrabold tracking-[0.32em] text-white", !collapsed && "lg:text-left")}>
        LUEX
      </div>
      <div className="mt-1 h-px w-full" style={{ background: "linear-gradient(90deg, #CFB783, transparent)" }} />
      <div className={cn("mt-1 hidden text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--gold)]", !collapsed && "lg:block")}>
        Life
      </div>
    </div>
  );
}

function Sidebar({ mods, pathname }: { mods: ModuleConfig[]; pathname: string }) {
  const [collapsed, setCollapsed] = useState(() => readLocal(NAV_KEY) === "collapsed");
  const groups = groupModules(mods);
  return (
    <aside
      className={cn(
        "lx-sidebar hidden shrink-0 flex-col md:flex",
        "w-[76px]",
        !collapsed && "lg:w-[248px]",
      )}
    >
      <Wordmark collapsed={collapsed} />
      <nav className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2 [@media(min-height:1150px)]:space-y-3" aria-label="Modules">
        {groups.map((g) => (
          <div key={g.group}>
            {groups.length > 1 && g.group !== "Today" ? (
              <div className={cn("hidden px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]", !collapsed && "lg:[@media(min-height:1150px)]:block")}>
                {g.group}
              </div>
            ) : null}
            <div className="space-y-0.5">
              {g.modules.map((m) => (
                <NavItem key={m.key} m={m} active={isActive(pathname, m)} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className={cn("flex gap-1 border-t border-white/5 p-2 pb-3", collapsed ? "flex-col" : "flex-col lg:flex-row")}>
        <Link
          to="/family"
          title="Family"
          className={cn(
            "lx-nav-item flex items-center gap-2 rounded-full px-2 text-sm hover:bg-[var(--sidebar-hover)]",
            !collapsed && "lg:flex-1",
            pathname === "/family" ? "text-[#e2cd9c]" : "text-[var(--sidebar-fg)]",
          )}
        >
          <span className="lx-nav-ico grid size-8 shrink-0 place-items-center text-[var(--sidebar-muted)]"><Users className="size-[18px]" /></span>
          <span className={cn("hidden", !collapsed && "lg:inline")}>Family</span>
        </Link>
        <Link
          to="/settings"
          title="Settings"
          className={cn(
            "lx-nav-item flex items-center gap-2 rounded-full px-2 text-sm hover:bg-[var(--sidebar-hover)]",
            !collapsed && "lg:flex-1",
            pathname === "/settings" ? "text-[#e2cd9c]" : "text-[var(--sidebar-fg)]",
          )}
        >
          <span className="lx-nav-ico grid size-8 shrink-0 place-items-center text-[var(--sidebar-muted)]"><Settings className="size-[18px]" /></span>
          <span className={cn("hidden", !collapsed && "lg:inline")}>Settings</span>
        </Link>
        <button
          type="button"
          onClick={() => {
            const next = !collapsed;
            setCollapsed(next);
            writeLocal(NAV_KEY, next ? "collapsed" : "open");
          }}
          className="lx-nav-item hidden items-center justify-center rounded-full px-2 text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] lg:flex"
          title={collapsed ? "Open the menu" : "Make the menu smaller"}
          aria-label={collapsed ? "Open the menu" : "Make the menu smaller"}
        >
          <span className="lx-nav-ico grid size-8 shrink-0 place-items-center">{collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}</span>
        </button>
      </div>
    </aside>
  );
}

function ProfileMenu() {
  const { me } = useFamilyState();
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="glass-pill flex min-h-11 items-center gap-2 py-1 pl-1 pr-3 text-left text-sm" aria-label="Your account">
          <MemberAvatar member={me} size="sm" />
          <span className="hidden leading-tight sm:block">
            <span className="block max-w-32 truncate font-semibold">{me.display_name}</span>
            <span className="block text-xs text-muted-foreground">{ROLE_LABEL[me.role as keyof typeof ROLE_LABEL]}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{me.display_name}</DropdownMenuLabel>
        <DropdownMenuItem asChild><Link to="/family"><Users className="mr-2 size-4" />Family and my picture</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/settings"><Settings className="mr-2 size-4" />Settings</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun className="mr-2 size-4" /> : <Moon className="mr-2 size-4" />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}><LogOut className="mr-2 size-4" />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PhoneBar({ mods, pathname }: { mods: ModuleConfig[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const quick = ["home", "calendar", "board"].map((k) => mods.find((m) => m.key === k)).filter((m): m is ModuleConfig => !!m);
  return (
    <>
      <nav className="glass-pill fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex items-stretch justify-around p-1 md:hidden" aria-label="Main">
        {quick.map((m) => {
          const Icon = m.icon;
          const active = isActive(pathname, m);
          return (
            <Link
              key={m.key}
              to={moduleHref(m)}
              className={cn("flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium", active ? "bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "text-muted-foreground")}
            >
              <Icon className="size-5" />
              {m.key === "home" ? "Home" : m.key === "calendar" ? "Calendar" : "Board"}
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} className="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium text-muted-foreground">
          <LayoutGrid className="size-5" />
          More
        </button>
      </nav>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Everything in Luex Life</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {mods.map((m) => {
              const Icon = m.icon;
              return (
                <Link key={m.key} to={moduleHref(m)} onClick={() => setOpen(false)} className="lx-tile flex min-h-24 flex-col items-center justify-center gap-2 p-2 text-center text-xs font-medium">
                  <Icon className="size-6" />
                  {m.name}
                </Link>
              );
            })}
            <Link to="/family" onClick={() => setOpen(false)} className="lx-tile flex min-h-24 flex-col items-center justify-center gap-2 p-2 text-center text-xs font-medium"><Users className="size-6" />Family</Link>
            <Link to="/settings" onClick={() => setOpen(false)} className="lx-tile flex min-h-24 flex-col items-center justify-center gap-2 p-2 text-center text-xs font-medium"><Settings className="size-6" />Settings</Link>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { role, switchedOff, family } = useFamilyState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mods = visibleModules(role, switchedOff);
  const found = pathname.startsWith("/m/") ? MODULE_BY_KEY[pathname.slice(3)] : pathname === "/" ? MODULE_BY_KEY.home : undefined;
  const current = found && mods.some((m) => m.key === found.key) ? found : undefined;
  const title = current?.name ?? (pathname === "/family" ? "Family" : pathname === "/settings" ? "Settings" : "Luex Life");
  return (
    <div className="flex h-dvh gap-3 p-3 pb-3" style={{ background: "var(--backdrop-base)" }}>
      <Sidebar mods={mods} pathname={pathname} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <header className="flex min-h-12 shrink-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-muted-foreground">{family.name}{current ? ` · ${current.group}` : ""}</div>
            <h1 className="truncate text-xl font-bold leading-tight">{title}</h1>
          </div>
          <ProfileMenu />
        </header>
        <main className="flex min-h-0 flex-1 flex-col pb-20 md:pb-0">{children}</main>
      </div>
      <PhoneBar mods={mods} pathname={pathname} />
    </div>
  );
}
