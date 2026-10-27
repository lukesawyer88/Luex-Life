// Generated from the luex-life Supabase project (npm run types is not set up; regenerate with the Supabase tool after each migration).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert> = { Row: Row; Insert: Insert; Update: Partial<Insert>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      families: Table<
        { id: string; name: string; owner_id: string; signup_source: string; created_at: string; archived_at: string | null },
        { id?: string; name: string; owner_id: string; signup_source?: string }
      >;
      family_members: Table<
        {
          id: string; family_id: string; user_id: string | null; display_name: string; role: string; colour: string;
          avatar_path: string | null; birthday: string | null; created_by: string | null; created_at: string; archived_at: string | null;
        },
        {
          family_id: string; display_name: string; role: string; colour?: string; birthday?: string | null;
          avatar_path?: string | null; archived_at?: string | null;
        }
      >;
      family_modules: Table<
        { family_id: string; module_key: string; enabled: boolean; updated_at: string },
        { family_id: string; module_key: string; enabled?: boolean; updated_at?: string }
      >;
      family_invites: Table<
        {
          id: string; family_id: string; member_id: string | null; email: string; role: string; display_name: string;
          expires_at: string; accepted_at: string | null; revoked_at: string | null; created_by: string; created_at: string;
        },
        { family_id: string; email: string; role: string; display_name: string }
      >;
      audit_log: Table<
        { id: number; family_id: string; actor: string | null; action: string; detail: Json; created_at: string },
        { family_id: string; action: string }
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: string };
      create_family: { Args: { p_family_name: string; p_my_name: string; p_colour?: string; p_source?: string }; Returns: string };
      create_invite: { Args: { p_family: string; p_email: string; p_role: string; p_name: string; p_member?: string }; Returns: string };
      preview_invite: { Args: { p_token: string }; Returns: { family_name: string; display_name: string; role: string }[] };
      revoke_invite: { Args: { p_invite: string }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
