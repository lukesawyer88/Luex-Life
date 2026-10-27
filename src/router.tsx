import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Navigate, Outlet, RouterProvider, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

import { AppShell } from "@/components/shell/app-shell";
import { Splash } from "@/components/page-parts";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useFamily, useMembers, useMyMember, useSwitchedOff } from "@/lib/family";
import { FamilyProvider } from "@/lib/family-context";
import { ThemeProvider } from "@/lib/theme";
import type { Role } from "@/modules/registry";
import { FamilyPage } from "@/pages/family";
import { HomePage } from "@/pages/home";
import { JoinPage } from "@/pages/join";
import { ModulePage } from "@/pages/module";
import { SettingsPage } from "@/pages/settings";
import { SharedCalendarPage } from "@/pages/shared";
import { SetupPage } from "@/pages/setup";
import { SignInPage } from "@/pages/sign-in";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true, gcTime: 24 * 60 * 60 * 1000 } },
});

/** Keeps the last-seen family data on this device so the calendar still opens without a signal. Cleared on sign-out. */
export const CACHE_KEY = "luex.life.cache";
const persister = createSyncStoragePersister({
  storage: typeof window === "undefined" ? undefined : window.localStorage,
  key: CACHE_KEY,
  throttleTime: 2000,
});
const KEEP_OFFLINE = new Set(["me", "family", "members", "modules", "cal"]);

const rootRoute = createRootRoute({ component: () => <Outlet /> });

/** Everything inside the family: needs a sign-in and a family, otherwise sends the person to the right place */
function AppLayout() {
  const { user, loading } = useAuth();
  const meQ = useMyMember(user?.id);
  const familyId = meQ.data?.family_id;
  const familyQ = useFamily(familyId);
  const membersQ = useMembers(familyId);
  const offQ = useSwitchedOff(familyId);

  if (loading) return <Splash />;
  if (!user) return <Navigate to="/sign-in" />;
  if (meQ.isLoading) return <Splash />;
  if (meQ.error) return <LoadError />;
  if (!meQ.data) return <Navigate to="/setup" />;
  if (!familyQ.data || !membersQ.data || !offQ.data) return familyQ.error || membersQ.error || offQ.error ? <LoadError /> : <Splash />;

  const role = meQ.data.role as Role;
  return (
    <FamilyProvider
      value={{
        user,
        me: meQ.data,
        family: familyQ.data,
        members: membersQ.data,
        role,
        isParent: role === "parent",
        switchedOff: offQ.data,
      }}
    >
      <AppShell>
        <Outlet />
      </AppShell>
    </FamilyProvider>
  );
}

function LoadError() {
  return (
    <div className="grid h-dvh place-items-center p-6 text-center" style={{ background: "var(--backdrop-base)" }}>
      <div>
        <p className="font-semibold">Luex Life couldn't load.</p>
        <p className="mt-1 text-sm text-muted-foreground">Check your connection, then try again.</p>
        <button type="button" className="mt-4 min-h-11 rounded-full bg-[var(--tile-active)] px-6 text-sm font-medium text-[var(--tile-active-fg)]" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    </div>
  );
}

const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sign-in", component: SignInPage });
const setupRoute = createRoute({ getParentRoute: () => rootRoute, path: "/setup", component: SetupPage });
const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/join",
  validateSearch: (s: Record<string, unknown>): { t?: string } => ({ t: typeof s.t === "string" ? s.t : undefined }),
  component: JoinPage,
});
// a read-only calendar link for a babysitter or relative (no sign-in)
const sharedRoute = createRoute({ getParentRoute: () => rootRoute, path: "/s/$token", component: SharedCalendarPage });
const appRoute = createRoute({ getParentRoute: () => rootRoute, id: "app", component: AppLayout });
const homeRoute = createRoute({ getParentRoute: () => appRoute, path: "/", component: HomePage });
const moduleRoute = createRoute({ getParentRoute: () => appRoute, path: "/m/$key", component: ModulePage });
const familyRoute = createRoute({ getParentRoute: () => appRoute, path: "/family", component: FamilyPage });
const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: "/settings", component: SettingsPage });

const routeTree = rootRoute.addChildren([
  signInRoute,
  setupRoute,
  joinRoute,
  sharedRoute,
  appRoute.addChildren([homeRoute, moduleRoute, familyRoute, settingsRoute]),
]);

const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        buster: "life-1",
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === "success" && KEEP_OFFLINE.has(String(q.queryKey[0])) },
      }}
    >
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <RouterProvider router={router} />
            <Toaster position="top-center" />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
