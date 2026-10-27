import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { turnPushOff } from "@/lib/push";
import { supabase } from "@/lib/supabase";

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({ session: null, user: null, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signOut: async () => {
        // this device stops getting the family's notifications and forgets the family's data
        try {
          await turnPushOff();
        } catch {
          /* still sign out */
        }
        await supabase.auth.signOut();
        try {
          // papers kept on this phone (Documents) go too
          if (typeof caches !== "undefined") await caches.delete("luex-docs");
        } catch {
          /* nothing kept */
        }
        try {
          for (const k of Object.keys(window.localStorage)) if (k.startsWith("luex.docs.")) window.localStorage.removeItem(k);
          window.localStorage.removeItem("luex.life.cache");
        } catch {
          /* private mode */
        }
        window.location.assign("/sign-in");
      },
    }),
    [session, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
