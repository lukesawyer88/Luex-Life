// Generated from the database schema (supabase/migrations) by a script; regenerate after each migration.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      audit_log: Table<
        { id: number; family_id: string; actor: string | null; action: string; detail: Json; created_at: string },
        { id?: number; family_id: string; actor?: string | null; action: string; detail?: Json; created_at?: string },
        {  }
      >;
      cal_comments: Table<
        { id: string; family_id: string; event_id: string; member_id: string | null; body: string | null; photo_path: string | null; created_at: string; deleted_at: string | null },
        { family_id: string; event_id: string; body?: string | null; photo_path?: string | null },
        { deleted_at?: string | null }
      >;
      cal_day_notes: Table<
        { id: string; family_id: string; day: string; body: string; member_id: string | null; updated_at: string },
        { family_id: string; day: string; body: string },
        { body?: string }
      >;
      cal_event_log: Table<
        { id: number; family_id: string; event_id: string; member_id: string | null; action: string; fields: string[]; at: string },
        { id?: number; family_id: string; event_id: string; member_id?: string | null; action: string; fields?: string[]; at?: string },
        {  }
      >;
      cal_events: Table<
        { id: string; family_id: string; title: string; type: string; all_day: boolean; starts_at: string; ends_at: string; rrule: string | null; exdates: string[]; recurrence_of: string | null; recurrence_date: string | null; people: string[]; visibility: string; viewers: string[]; driver: string | null; place_id: string | null; location: string | null; travel_minutes: number | null; reminders: number[]; notes: string | null; booking_ref: string | null; link: string | null; countdown: boolean; done_at: string | null; source: string; feed_id: string | null; external_key: string | null; created_by_member: string | null; updated_by_member: string | null; version: number; created_at: string; updated_at: string; deleted_at: string | null },
        { family_id: string; title: string; type?: string; all_day?: boolean; starts_at: string; ends_at: string; rrule?: string | null; exdates?: string[]; recurrence_of?: string | null; recurrence_date?: string | null; people?: string[]; visibility?: string; viewers?: string[]; driver?: string | null; place_id?: string | null; location?: string | null; travel_minutes?: number | null; reminders?: number[]; notes?: string | null; booking_ref?: string | null; link?: string | null; countdown?: boolean; done_at?: string | null },
        { title?: string; type?: string; all_day?: boolean; starts_at?: string; ends_at?: string; rrule?: string | null; exdates?: string[]; people?: string[]; visibility?: string; viewers?: string[]; driver?: string | null; place_id?: string | null; location?: string | null; travel_minutes?: number | null; reminders?: number[]; notes?: string | null; booking_ref?: string | null; link?: string | null; countdown?: boolean; done_at?: string | null; deleted_at?: string | null }
      >;
      cal_feeds: Table<
        { id: string; family_id: string; name: string; url: string; type: string; people: string[]; visibility: string; viewers: string[]; active: boolean; last_synced_at: string | null; last_error: string | null; event_count: number; created_by_member: string | null; created_at: string },
        { family_id: string; name: string; url: string; type?: string; people?: string[]; visibility?: string; viewers?: string[] },
        { name?: string; url?: string; type?: string; people?: string[]; visibility?: string; viewers?: string[]; active?: boolean }
      >;
      cal_files: Table<
        { id: string; family_id: string; event_id: string; path: string; name: string; mime: string; size_bytes: number; created_by_member: string | null; created_at: string },
        { family_id: string; event_id: string; path: string; name: string; mime: string; size_bytes: number },
        {  }
      >;
      cal_places: Table<
        { id: string; family_id: string; name: string; address: string | null; travel_minutes: number | null; created_at: string },
        { family_id: string; name: string; address?: string | null; travel_minutes?: number | null },
        { name?: string; address?: string | null; travel_minutes?: number | null }
      >;
      cal_shares: Table<
        { id: string; family_id: string; name: string; kind: string; people: string[]; show_notes: boolean; token_hash: string; expires_at: string; revoked_at: string | null; last_used_at: string | null; created_by_member: string | null; created_at: string },
        { id?: string; family_id: string; name: string; kind: string; people?: string[]; show_notes?: boolean; token_hash: string; expires_at: string; revoked_at?: string | null; last_used_at?: string | null; created_by_member?: string | null; created_at?: string },
        { revoked_at?: string | null }
      >;
      cal_terms: Table<
        { id: string; family_id: string; name: string; kind: string; label: string | null; starts_on: string; ends_on: string; created_at: string },
        { family_id: string; name: string; kind?: string; label?: string | null; starts_on: string; ends_on: string },
        { name?: string; kind?: string; label?: string | null; starts_on?: string; ends_on?: string }
      >;
      chore_done: Table<
        { id: string; family_id: string; chore_id: string; due_on: string; for_member: string; done_by: string | null; done_at: string; stars: number; confirmed_by: string | null; confirmed_at: string | null },
        { family_id: string; chore_id: string; due_on: string; for_member: string },
        { confirmed_at?: string | null }
      >;
      chores: Table<
        { id: string; family_id: string; title: string; icon: string; rrule: string; starts_on: string; mode: string; people: string[]; part_of_day: string; needs_confirm: boolean; stars: number; notes: string | null; is_cleaning: boolean; active: boolean; created_by_member: string | null; created_at: string; updated_at: string },
        { family_id: string; title: string; icon?: string; rrule?: string; starts_on?: string; mode?: string; people?: string[]; part_of_day?: string; needs_confirm?: boolean; stars?: number; notes?: string | null; is_cleaning?: boolean; active?: boolean },
        { title?: string; icon?: string; rrule?: string; starts_on?: string; mode?: string; people?: string[]; part_of_day?: string; needs_confirm?: boolean; stars?: number; notes?: string | null; is_cleaning?: boolean; active?: boolean }
      >;
      families: Table<
        { id: string; name: string; owner_id: string; signup_source: string; created_at: string; archived_at: string | null; timezone: string; calendar_prefs: Json; weather_place: string | null; weather_lat: number | null; weather_lon: number | null },
        { id?: string; name: string; owner_id: string; signup_source?: string; created_at?: string; archived_at?: string | null; timezone?: string; calendar_prefs?: Json; weather_place?: string | null; weather_lat?: number | null; weather_lon?: number | null },
        { name?: string; timezone?: string; calendar_prefs?: Json; weather_place?: string | null; weather_lat?: number | null; weather_lon?: number | null }
      >;
      family_invites: Table<
        { id: string; family_id: string; member_id: string | null; email: string; role: string; display_name: string; token_hash: string; expires_at: string; accepted_at: string | null; revoked_at: string | null; created_by: string; created_at: string },
        { id?: string; family_id: string; member_id?: string | null; email: string; role: string; display_name: string; token_hash: string; expires_at?: string; accepted_at?: string | null; revoked_at?: string | null; created_by: string; created_at?: string },
        {  }
      >;
      family_members: Table<
        { id: string; family_id: string; user_id: string | null; display_name: string; role: string; colour: string; avatar_path: string | null; birthday: string | null; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; display_name: string; role: string; colour?: string; birthday?: string | null; created_by?: string | null },
        { display_name?: string; role?: string; colour?: string; avatar_path?: string | null; birthday?: string | null; archived_at?: string | null }
      >;
      family_modules: Table<
        { family_id: string; module_key: string; enabled: boolean; updated_at: string },
        { family_id: string; module_key: string; enabled?: boolean },
        { enabled?: boolean }
      >;
      notification_prefs: Table<
        { member_id: string; family_id: string; changes: string; reminders: boolean; weekly: boolean; wishlists: boolean; updated_at: string },
        { member_id: string; family_id: string; changes?: string; reminders?: boolean; weekly?: boolean; wishlists?: boolean },
        { changes?: string; reminders?: boolean; weekly?: boolean; wishlists?: boolean }
      >;
      notifications: Table<
        { id: string; family_id: string; member_id: string; kind: string; title: string; body: string; link: string | null; group_key: string | null; count: number; created_at: string; updated_at: string; send_after: string; pushed_at: string | null; read_at: string | null },
        { id?: string; family_id: string; member_id: string; kind: string; title: string; body?: string; link?: string | null; group_key?: string | null; count?: number; created_at?: string; updated_at?: string; send_after?: string; pushed_at?: string | null; read_at?: string | null },
        { read_at?: string | null }
      >;
      push_subscriptions: Table<
        { id: string; family_id: string; member_id: string; user_id: string; endpoint: string; p256dh: string; auth: string; user_agent: string | null; created_at: string },
        { id?: string; family_id: string; member_id: string; user_id: string; endpoint: string; p256dh: string; auth: string; user_agent?: string | null; created_at?: string },
        {  }
      >;
      reminder_sends: Table<
        { event_id: string; occurrence_at: string; kind: string; minutes: number; sent_at: string },
        { event_id: string; occurrence_at: string; kind: string; minutes: number; sent_at?: string },
        {  }
      >;
      routine_runs: Table<
        { id: string; family_id: string; routine_id: string; run_on: string; started_at: string; finished_at: string | null; stars: number },
        { family_id: string; routine_id: string; run_on: string },
        { finished_at?: string | null }
      >;
      routine_steps: Table<
        { id: string; family_id: string; routine_id: string; position: number; title: string; icon: string; photo_path: string | null; minutes: number | null },
        { family_id: string; routine_id: string; position?: number; title: string; icon?: string; photo_path?: string | null; minutes?: number | null },
        { position?: number; title?: string; icon?: string; photo_path?: string | null; minutes?: number | null }
      >;
      routine_ticks: Table<
        { id: string; family_id: string; routine_id: string; step_id: string; done_on: string; done_by: string | null; done_at: string },
        { family_id: string; routine_id: string; step_id: string; done_on: string },
        {  }
      >;
      routines: Table<
        { id: string; family_id: string; member_id: string; name: string; icon: string; start_time: string | null; days: number[]; reward: string | null; stars: number; position: number; active: boolean; created_at: string },
        { family_id: string; member_id: string; name: string; icon?: string; start_time?: string | null; days?: number[]; reward?: string | null; stars?: number; position?: number; active?: boolean },
        { member_id?: string; name?: string; icon?: string; start_time?: string | null; days?: number[]; reward?: string | null; stars?: number; position?: number; active?: boolean }
      >;
      wish_claims: Table<
        { item_id: string; family_id: string; list_id: string; claimed_by: string | null; bought: boolean; claimed_at: string },
        { item_id: string },
        { bought?: boolean }
      >;
      wish_items: Table<
        { id: string; family_id: string; list_id: string; title: string; link: string | null; price: number | null; notes: string | null; priority: number; position: number; created_at: string; updated_at: string; removed_at: string | null },
        { family_id: string; list_id: string; title: string; link?: string | null; price?: number | null; notes?: string | null; priority?: number; position?: number },
        { title?: string; link?: string | null; price?: number | null; notes?: string | null; priority?: number; position?: number; removed_at?: string | null }
      >;
      wish_lists: Table<
        { id: string; family_id: string; owner_member: string; occasion: string; year: number; created_at: string },
        { family_id: string; owner_member: string; occasion: string; year: number },
        {  }
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: string };
      create_family: { Args: { p_family_name: string; p_my_name: string; p_colour?: string; p_source?: string }; Returns: string };
      create_invite: { Args: { p_family: string; p_email: string; p_role: string; p_name: string; p_member?: string }; Returns: string };
      preview_invite: { Args: { p_token: string }; Returns: { family_name: string; display_name: string; role: string }[] };
      revoke_invite: { Args: { p_invite: string }; Returns: undefined };
      save_push_subscription: { Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_agent: string }; Returns: undefined };
      create_share: { Args: { p_name: string; p_kind: string; p_people: string[]; p_show_notes: boolean; p_hours: number }; Returns: string };
      shared_calendar: { Args: { p_token: string; p_from: string; p_to: string }; Returns: Json };
      can_see_event: { Args: { e: string }; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
