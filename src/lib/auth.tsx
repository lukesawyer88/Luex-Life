import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { forgetPhoneCopies } from "@/lib/phone-copies";
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
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // signed out any other way (elsewhere, password changed, removed): forget papers kept on this phone
      if (event === "SIGNED_OUT" || !next) void forgetPhoneCopies();
      setSession(next);
    });
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
        // papers kept on this phone (Documents) go too
        await forgetPhoneCopies();
        try {
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
