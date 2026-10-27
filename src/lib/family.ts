// Everything the app reads about the signed-in person's family. The database decides what each person
// may see (row-level security); these queries just ask.
import { useQuery } from "@tanstack/react-query";

import type { Database } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

export type Member = Database["public"]["Tables"]["family_members"]["Row"];
export type Family = Database["public"]["Tables"]["families"]["Row"];
export type Invite = Omit<Database["public"]["Tables"]["family_invites"]["Row"], never>;

export function useMyMember(userId: string | undefined) {
  return useQuery({
    queryKey: ["me", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("family_members")
        .select("*")
        .eq("user_id", userId!)
        .is("archived_at", null)
        .maybeSingle();
      if (error) throw error;
      return data as Member | null;
    },
  });
}

export function useFamily(familyId: string | undefined) {
  return useQuery({
    queryKey: ["family", familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("families").select("*").eq("id", familyId!).single();
      if (error) throw error;
      return data as Family;
    },
  });
}

export function useMembers(familyId: string | undefined) {
  return useQuery({
    queryKey: ["members", familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("family_members")
        .select("*")
        .eq("family_id", familyId!)
        .is("archived_at", null)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });
}

export function useInvites(familyId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["invites", familyId],
    enabled: !!familyId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("family_invites")
        .select("id, family_id, member_id, email, role, display_name, expires_at, accepted_at, revoked_at, created_by, created_at")
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invite[];
    },
  });
}

/** Module keys this family has switched off */
export function useSwitchedOff(familyId: string | undefined) {
  return useQuery({
    queryKey: ["modules", familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("family_modules")
        .select("module_key, enabled")
        .eq("family_id", familyId!);
      if (error) throw error;
      return new Set((data ?? []).filter((r) => !r.enabled).map((r) => r.module_key));
    },
  });
}

/** A short-lived link to a profile picture (the pictures are private) */
export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["avatar", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("avatars").createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function friendlyError(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  if (!m) return "Something went wrong. Please try again.";
  if (/failed to fetch|network/i.test(m)) return "Can't reach Luex right now. Check your connection and try again.";
  return m;
}
