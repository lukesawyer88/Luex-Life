import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, LayoutGrid, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun, Users } from "lucide-react";
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
import { homeWord, kindOf, moduleName, roleLabel, type HouseholdKind } from "@/lib/household";
import { MODULE_BY_KEY, groupModules, visibleModules, type ModuleConfig } from "@/modules/registry";

const NAV_KEY = "luex.life.nav";
const GROUPS_KEY = "luex.life.nav.groups";
const cap = (w: string) => w[0].toUpperCase() + w.slice(1);

function moduleHref(m: ModuleConfig) {
  return m.key === "home" ? "/" : `/m/${m.key}`;
}

function isActive(pathname: string, m: ModuleConfig) {
  return m.key === "home" ? pathname === "/" : pathname === `/m/${m.key}`;
}

function NavItem({ m, active, collapsed, kind }: { m: ModuleConfig; active: boolean; collapsed: boolean; kind: HouseholdKind }) {
  const Icon = m.icon;
  const name = moduleName(m, kind);
  return (
    <Link
      to={moduleHref(m)}
      title={name}
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
      <span className={cn("hidden truncate", !collapsed && "lg:inline")}>{name}</span>
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

function Sidebar({ mods, pathname, kind }: { mods: ModuleConfig[]; pathname: string; kind: HouseholdKind }) {
  const [collapsed, setCollapsed] = useState(() => readLocal(NAV_KEY) === "collapsed");
  const groups = groupModules(mods);
  // groups other than "Every day" fold away to keep the menu short; the one you're in is always open
  const [opened, setOpened] = useState<string[]>(() => { try { return JSON.parse(readLocal(GROUPS_KEY) ?? "[]") as string[]; } catch { return []; } });
  const toggleGroup = (g: string) => {
    const next = opened.includes(g) ? opened.filter((x) => x !== g) : [...opened, g];
    setOpened(next);
    writeLocal(GROUPS_KEY, JSON.stringify(next));
  };
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
        {groups.map((g) => {
          const here = g.modules.some((m) => isActive(pathname, m));
          const foldable = g.group !== "Every day" && g.modules.length > 0;
          const open = !foldable || here || opened.includes(g.group);
          return (
            <div key={g.group}>
              {foldable ? (
                <button type="button" onClick={() => !here && toggleGroup(g.group)} aria-expanded={open} data-testid={`nav-group-${g.group}`}
                  className={cn("hidden w-full items-center gap-2 rounded-full px-3 pb-1 pt-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)] hover:text-[var(--sidebar-fg)]", !collapsed && "lg:flex")}>
                  <span className="flex-1">{g.group}</span>
                  {!open ? <span className="text-[11px] font-normal normal-case tracking-normal">{g.modules.length}</span> : null}
                  <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
                </button>
              ) : null}
              <div className={cn("space-y-0.5", !open && !collapsed && "lg:hidden")}>
                {g.modules.map((m) => (
                  <NavItem key={m.key} m={m} active={isActive(pathname, m)} collapsed={collapsed} kind={kind} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className={cn("flex gap-1 border-t border-white/5 p-2 pb-3", collapsed ? "flex-col" : "flex-col lg:flex-row")}>
        <Link
          to="/family"
          title={cap(homeWord(kind))}
          className={cn(
            "lx-nav-item flex items-center gap-2 rounded-full px-2 text-sm hover:bg-[var(--sidebar-hover)]",
            !collapsed && "lg:flex-1",
            pathname === "/family" ? "text-[#e2cd9c]" : "text-[var(--sidebar-fg)]",
          )}
        >
          <span className="lx-nav-ico grid size-8 shrink-0 place-items-center text-[var(--sidebar-muted)]"><Users className="size-[18px]" /></span>
          <span className={cn("hidden", !collapsed && "lg:inline")}>{cap(homeWord(kind))}</span>
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
  const { me, family } = useFamilyState();
  const kind = kindOf(family);
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="glass-pill flex min-h-11 items-center gap-2 py-1 pl-1 pr-3 text-left text-sm" aria-label="Your account">
          <MemberAvatar member={me} size="sm" />
          <span className="hidden leading-tight sm:block">
            <span className="block max-w-32 truncate font-semibold">{me.display_name}</span>
            <span className="block text-xs text-muted-foreground">{roleLabel(me.role, kind)}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{me.display_name}</DropdownMenuLabel>
        <DropdownMenuItem asChild><Link to="/family"><Users className="mr-2 size-4" />{cap(homeWord(kind))} and my picture</Link></DropdownMenuItem>
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

function PhoneBar({ mods, pathname, kind }: { mods: ModuleConfig[]; pathname: string; kind: HouseholdKind }) {
  const [open, setOpen] = useState(false);
  const groups = groupModules(mods);
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
          {groups.map((g) => (
            <section key={g.group} data-testid={`more-group-${g.group}`}>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.group}</h3>
              <div className="grid grid-cols-3 gap-2">
                {g.modules.map((m) => {
                  const Icon = m.icon;
                  return (
                    <Link key={m.key} to={moduleHref(m)} onClick={() => setOpen(false)} className="lx-tile flex min-h-24 flex-col items-center justify-center gap-2 p-2 text-center text-xs font-medium">
                      <Icon className="size-6" />
                      {moduleName(m, kind)}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
          <div className="grid grid-cols-3 gap-2">
            <Link to="/family" onClick={() => setOpen(false)} className="lx-tile flex min-h-24 flex-col items-center justify-center gap-2 p-2 text-center text-xs font-medium"><Users className="size-6" />{cap(homeWord(kind))}</Link>
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
  const kind = kindOf(family);
  const found = pathname.startsWith("/m/") ? MODULE_BY_KEY[pathname.slice(3)] : pathname === "/" ? MODULE_BY_KEY.home : undefined;
  const current = found && mods.some((m) => m.key === found.key) ? found : undefined;
  const title = current ? moduleName(current, kind) : pathname === "/family" ? cap(homeWord(kind)) : pathname === "/settings" ? "Settings" : "Luex Life";
  return (
    <div className="flex h-dvh gap-3 p-3 pb-3" style={{ background: "var(--backdrop-base)" }}>
      <Sidebar mods={mods} pathname={pathname} kind={kind} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <header className="flex min-h-12 shrink-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-muted-foreground">{family.name}{current && current.group !== "Every day" ? ` · ${current.group}` : ""}</div>
            <h1 className="truncate text-xl font-bold leading-tight">{title}</h1>
          </div>
          <ProfileMenu />
        </header>
        <main className="flex min-h-0 flex-1 flex-col pb-20 md:pb-0">{children}</main>
      </div>
      <PhoneBar mods={mods} pathname={pathname} kind={kind} />
    </div>
  );
}
