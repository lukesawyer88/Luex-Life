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
      board_acks: Table<
        { id: string; message_id: string; member_id: string; family_id: string; acked_at: string },
        { message_id: string; member_id: string; family_id: string },
        {  }
      >;
      board_album_shares: Table<
        { id: string; family_id: string; album_id: string; label: string; token_hash: string; expires_at: string; revoked_at: string | null; last_used_at: string | null; created_by: string | null; created_at: string },
        { id?: string; family_id: string; album_id: string; label: string; token_hash: string; expires_at: string; revoked_at?: string | null; last_used_at?: string | null; created_by?: string | null; created_at?: string },
        { revoked_at?: string | null }
      >;
      board_albums: Table<
        { id: string; family_id: string; title: string; kind: string; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; title: string; kind?: string },
        { title?: string; archived_at?: string | null }
      >;
      board_goal_steps: Table<
        { id: string; goal_id: string; family_id: string; text: string; position: number; done_at: string | null; done_by: string | null },
        { goal_id: string; family_id: string; text: string; position?: number },
        { text?: string; position?: number; done_at?: string | null }
      >;
      board_goals: Table<
        { id: string; family_id: string; title: string; emoji: string | null; target: number | null; unit: string | null; progress: number; due_on: string | null; people: string[]; stars: number; done_at: string | null; done_by: string | null; created_by: string | null; created_at: string; updated_at: string; archived_at: string | null },
        { family_id: string; title: string; emoji?: string | null; target?: number | null; unit?: string | null; progress?: number; due_on?: string | null; people?: string[]; stars?: number },
        { title?: string; emoji?: string | null; target?: number | null; unit?: string | null; progress?: number; due_on?: string | null; people?: string[]; stars?: number; done_at?: string | null; archived_at?: string | null }
      >;
      board_list_items: Table<
        { id: string; list_id: string; family_id: string; text: string; assignee: string | null; position: number; done_at: string | null; done_by: string | null; created_by: string | null; created_at: string },
        { list_id: string; family_id: string; text: string; assignee?: string | null; position?: number },
        { text?: string; assignee?: string | null; position?: number; done_at?: string | null }
      >;
      board_lists: Table<
        { id: string; family_id: string; title: string; emoji: string | null; kind: string; is_template: boolean; position: number; created_by: string | null; created_at: string; updated_at: string; archived_at: string | null },
        { family_id: string; title: string; emoji?: string | null; kind?: string; is_template?: boolean; position?: number },
        { title?: string; emoji?: string | null; is_template?: boolean; position?: number; archived_at?: string | null }
      >;
      board_locations: Table<
        { message_id: string; family_id: string; thread_id: string; lat: number; lng: number; accuracy: number | null; expires_at: string },
        { message_id: string; family_id: string; thread_id: string; lat: number; lng: number; accuracy?: number | null; expires_at?: string },
        {  }
      >;
      board_media: Table<
        { id: string; family_id: string; owner: string | null; thread_id: string | null; message_id: string | null; album_id: string | null; memory_id: string | null; path: string; thumb_path: string | null; kind: string; mime: string; bytes: number; width: number | null; height: number | null; duration_s: number | null; caption: string; people: string[]; taken_at: string | null; created_at: string; deleted_at: string | null },
        { family_id: string; thread_id?: string | null; message_id?: string | null; album_id?: string | null; memory_id?: string | null; path: string; thumb_path?: string | null; kind: string; mime: string; width?: number | null; height?: number | null; duration_s?: number | null; caption?: string; people?: string[]; taken_at?: string | null },
        { album_id?: string | null; caption?: string; people?: string[]; taken_at?: string | null; deleted_at?: string | null }
      >;
      board_memories: Table<
        { id: string; family_id: string; author: string | null; kind: string; title: string; body: string; happened_on: string; people: string[]; milestone_for: string | null; prompt_id: string | null; prompt_text: string | null; audience: string; created_at: string; updated_at: string; deleted_at: string | null; parents_may_see: boolean },
        { family_id: string; kind?: string; title?: string; body?: string; happened_on?: string; people?: string[]; milestone_for?: string | null; prompt_id?: string | null; audience?: string },
        { title?: string; body?: string; happened_on?: string; people?: string[]; audience?: string; deleted_at?: string | null }
      >;
      board_messages: Table<
        { id: string; family_id: string; thread_id: string; author: string | null; kind: string; body: string; reply_to: string | null; mentions: string[]; kudos_to: string | null; ask_member: string | null; sticker: string | null; client_id: string | null; pinned_at: string | null; pinned_by: string | null; edited_at: string | null; deleted_at: string | null; deleted_by: string | null; activity_at: string; created_at: string },
        { family_id: string; thread_id: string; kind?: string; body?: string; reply_to?: string | null; mentions?: string[]; kudos_to?: string | null; ask_member?: string | null; sticker?: string | null; client_id?: string | null },
        { body?: string; mentions?: string[]; pinned_at?: string | null; deleted_at?: string | null }
      >;
      board_notes: Table<
        { id: string; family_id: string; author: string | null; body: string; colour: string; pinned: boolean; created_at: string; updated_at: string; deleted_at: string | null },
        { family_id: string; body: string; colour?: string; pinned?: boolean },
        { body?: string; colour?: string; pinned?: boolean; deleted_at?: string | null }
      >;
      board_poll_options: Table<
        { id: string; message_id: string; family_id: string; label: string; on_date: string | null; position: number },
        { id?: string; message_id: string; family_id: string; label: string; on_date?: string | null; position?: number },
        {  }
      >;
      board_poll_votes: Table<
        { id: string; option_id: string; message_id: string; member_id: string; family_id: string; created_at: string },
        { option_id: string; message_id: string; member_id: string; family_id: string },
        {  }
      >;
      board_polls: Table<
        { message_id: string; family_id: string; question: string; kind: string; multi: boolean; closed_at: string | null; event_id: string | null },
        { message_id: string; family_id: string; question: string; kind?: string; multi?: boolean; closed_at?: string | null; event_id?: string | null },
        { closed_at?: string | null; event_id?: string | null }
      >;
      board_prompt_sends: Table<
        { member_id: string; day: string; prompt_id: string | null; sent_at: string },
        { member_id: string; day: string; prompt_id?: string | null; sent_at?: string },
        {  }
      >;
      board_prompts: Table<
        { id: string; family_id: string | null; text: string; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id?: string | null; text: string },
        { archived_at?: string | null }
      >;
      board_reactions: Table<
        { id: string; message_id: string; member_id: string; family_id: string; emoji: string; created_at: string },
        { message_id: string; member_id: string; family_id: string; emoji: string },
        {  }
      >;
      board_settings: Table<
        { member_id: string; family_id: string; chat: boolean; private_chats: boolean; photos: boolean; voice: boolean; location: boolean; parents_can_read: boolean; journal_prompts: boolean; journal_time: string; journal_parents_see: boolean; quiet_from: string | null; quiet_to: string | null; alerts: string; updated_at: string },
        { member_id: string; family_id: string; chat?: boolean; private_chats?: boolean; photos?: boolean; voice?: boolean; location?: boolean; parents_can_read?: boolean; journal_prompts?: boolean; journal_time?: string; journal_parents_see?: boolean; quiet_from?: string | null; quiet_to?: string | null; alerts?: string; updated_at?: string },
        { chat?: boolean; private_chats?: boolean; photos?: boolean; voice?: boolean; location?: boolean; parents_can_read?: boolean; journal_prompts?: boolean; journal_time?: string; journal_parents_see?: boolean; quiet_from?: string | null; quiet_to?: string | null; alerts?: string }
      >;
      board_thread_people: Table<
        { id: string; thread_id: string; member_id: string; family_id: string; added_at: string },
        { id?: string; thread_id: string; member_id: string; family_id: string; added_at?: string },
        {  }
      >;
      board_thread_state: Table<
        { id: string; thread_id: string; member_id: string; family_id: string; last_read_at: string; muted: boolean },
        { id?: string; thread_id: string; member_id: string; family_id: string; last_read_at?: string; muted?: boolean },
        {  }
      >;
      board_threads: Table<
        { id: string; family_id: string; kind: string; title: string | null; emoji: string | null; direct_key: string | null; created_by: string | null; created_at: string; last_message_at: string; archived_at: string | null },
        { id?: string; family_id: string; kind: string; title?: string | null; emoji?: string | null; direct_key?: string | null; created_by?: string | null; created_at?: string; last_message_at?: string; archived_at?: string | null },
        { title?: string | null; emoji?: string | null; archived_at?: string | null }
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
        { id: string; family_id: string; chore_id: string; due_on: string; for_member: string; done_by: string | null; done_at: string; stars: number; confirmed_by: string | null; confirmed_at: string | null; photo_path: string | null },
        { family_id: string; chore_id: string; due_on: string; for_member: string; photo_path?: string | null },
        { confirmed_at?: string | null }
      >;
      chores: Table<
        { id: string; family_id: string; title: string; icon: string; rrule: string; starts_on: string; mode: string; people: string[]; part_of_day: string; needs_confirm: boolean; stars: number; notes: string | null; is_cleaning: boolean; active: boolean; created_by_member: string | null; created_at: string; updated_at: string; money: number; needs_photo: boolean },
        { family_id: string; title: string; icon?: string; rrule?: string; starts_on?: string; mode?: string; people?: string[]; part_of_day?: string; needs_confirm?: boolean; stars?: number; notes?: string | null; is_cleaning?: boolean; active?: boolean; money?: number; needs_photo?: boolean },
        { title?: string; icon?: string; rrule?: string; starts_on?: string; mode?: string; people?: string[]; part_of_day?: string; needs_confirm?: boolean; stars?: number; notes?: string | null; is_cleaning?: boolean; active?: boolean; money?: number; needs_photo?: boolean }
      >;
      doc_folders: Table<
        { id: string; family_id: string; name: string; emoji: string | null; position: number; archived_at: string | null },
        { family_id: string; name: string; emoji?: string | null; position?: number },
        { name?: string; emoji?: string | null; position?: number; archived_at?: string | null }
      >;
      doc_sends: Table<
        { document_id: string; for_date: string },
        { document_id: string; for_date: string },
        {  }
      >;
      documents: Table<
        { id: string; family_id: string; folder_id: string | null; title: string; person_id: string | null; pages: string[]; expires_on: string | null; remind_days: number; where_kept: string | null; ref: string | null; phone: string | null; price: number | null; notes: string; private_to: string | null; created_by: string | null; created_at: string; updated_at: string; deleted_at: string | null },
        { family_id: string; folder_id?: string | null; title: string; person_id?: string | null; pages?: string[]; expires_on?: string | null; remind_days?: number; where_kept?: string | null; ref?: string | null; phone?: string | null; price?: number | null; notes?: string; private_to?: string | null },
        { folder_id?: string | null; title?: string; person_id?: string | null; pages?: string[]; expires_on?: string | null; remind_days?: number; where_kept?: string | null; ref?: string | null; phone?: string | null; price?: number | null; notes?: string }
      >;
      em_cards: Table<
        { id: string; family_id: string; member_id: string | null; pet_name: string | null; allergies: string; medicines: string; blood_group: string | null; doctor: string | null; doctor_phone: string | null; microchip: string | null; insurer: string | null; notes: string; updated_by: string | null; updated_at: string; deleted_at: string | null },
        { family_id: string; member_id?: string | null; pet_name?: string | null; allergies?: string; medicines?: string; blood_group?: string | null; doctor?: string | null; doctor_phone?: string | null; microchip?: string | null; insurer?: string | null; notes?: string },
        { pet_name?: string | null; allergies?: string; medicines?: string; blood_group?: string | null; doctor?: string | null; doctor_phone?: string | null; microchip?: string | null; insurer?: string | null; notes?: string; deleted_at?: string | null }
      >;
      em_conditions: Table<
        { card_id: string; family_id: string; conditions: string; shared: boolean },
        { card_id: string; family_id: string; conditions?: string; shared?: boolean },
        { conditions?: string; shared?: boolean }
      >;
      em_contacts: Table<
        { id: string; family_id: string; name: string; grp: string; phone: string | null; phone2: string | null; email: string | null; address: string | null; notes: string; call_order: number | null; created_by: string | null; created_at: string; updated_at: string; deleted_at: string | null },
        { family_id: string; name: string; grp?: string; phone?: string | null; phone2?: string | null; email?: string | null; address?: string | null; notes?: string; call_order?: number | null },
        { name?: string; grp?: string; phone?: string | null; phone2?: string | null; email?: string | null; address?: string | null; notes?: string; call_order?: number | null; deleted_at?: string | null }
      >;
      em_home: Table<
        { family_id: string; address: string | null; stopcock: string | null; fuse_box: string | null; gas_meter: string | null; first_aid: string | null; spare_key: string | null; wifi_name: string | null; wifi_password: string | null; wifi_in_link: boolean; meet_point: string | null; plan: string | null; bedtimes: string | null; updated_by: string | null; updated_at: string },
        { family_id: string; address?: string | null; stopcock?: string | null; fuse_box?: string | null; gas_meter?: string | null; first_aid?: string | null; spare_key?: string | null; wifi_name?: string | null; wifi_password?: string | null; wifi_in_link?: boolean; meet_point?: string | null; plan?: string | null; bedtimes?: string | null },
        { address?: string | null; stopcock?: string | null; fuse_box?: string | null; gas_meter?: string | null; first_aid?: string | null; spare_key?: string | null; wifi_name?: string | null; wifi_password?: string | null; wifi_in_link?: boolean; meet_point?: string | null; plan?: string | null; bedtimes?: string | null }
      >;
      em_shares: Table<
        { id: string; family_id: string; name: string; token_hash: string; expires_at: string; revoked_at: string | null; last_used_at: string | null; created_by: string | null; created_at: string },
        { id?: string; family_id: string; name: string; token_hash: string; expires_at: string; revoked_at?: string | null; last_used_at?: string | null; created_by?: string | null; created_at?: string },
        { revoked_at?: string | null }
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
      food_aisles: Table<
        { id: string; family_id: string; name: string; position: number },
        { family_id: string; name: string; position?: number },
        { name?: string; position?: number }
      >;
      food_alert_sends: Table<
        { stock_id: string; day: string },
        { stock_id: string; day: string },
        {  }
      >;
      food_avoid: Table<
        { id: string; family_id: string; member_id: string; kind: string; label: string; created_by: string | null; created_at: string },
        { family_id: string; member_id: string; kind: string; label: string },
        {  }
      >;
      food_collections: Table<
        { id: string; family_id: string; title: string; emoji: string | null; position: number; created_by: string | null; created_at: string },
        { family_id: string; title: string; emoji?: string | null; position?: number },
        { title?: string; emoji?: string | null; position?: number }
      >;
      food_diary: Table<
        { id: string; family_id: string; member_id: string; day: string; slot: string; label: string; kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; created_at: string },
        { family_id: string; member_id: string; day?: string; slot?: string; label: string; kcal?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null },
        { day?: string; slot?: string; label?: string; kcal?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null }
      >;
      food_import_log: Table<
        { id: number; member_id: string; at: string },
        { id?: number; member_id: string; at?: string },
        {  }
      >;
      food_known_items: Table<
        { id: string; family_id: string; name: string; name_key: string; aisle: string | null; unit: string | null; favourite: boolean; used_count: number; last_used: string; barcode: string | null },
        { id?: string; family_id: string; name: string; name_key: string; aisle?: string | null; unit?: string | null; favourite?: boolean; used_count?: number; last_used?: string; barcode?: string | null },
        { aisle?: string | null; unit?: string | null; favourite?: boolean }
      >;
      food_list_items: Table<
        { id: string; list_id: string; family_id: string; name: string; quantity: number | null; unit: string | null; note: string; aisle: string | null; photo_path: string | null; assignee: string | null; recipe_ids: string[]; position: number; done_at: string | null; done_by: string | null; added_by: string | null; created_at: string },
        { list_id: string; family_id: string; name: string; quantity?: number | null; unit?: string | null; note?: string; aisle?: string | null; photo_path?: string | null; assignee?: string | null; recipe_ids?: string[]; position?: number },
        { name?: string; quantity?: number | null; unit?: string | null; note?: string; aisle?: string | null; photo_path?: string | null; assignee?: string | null; position?: number; done_at?: string | null }
      >;
      food_lists: Table<
        { id: string; family_id: string; title: string; emoji: string | null; position: number; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; title: string; emoji?: string | null; position?: number },
        { title?: string; emoji?: string | null; position?: number; archived_at?: string | null }
      >;
      food_lunches: Table<
        { id: string; family_id: string; member_id: string; day: string; items: string[]; packed: boolean; notes: string; updated_by: string | null; updated_at: string },
        { family_id: string; member_id: string; day: string; items?: string[]; packed?: boolean; notes?: string },
        { items?: string[]; packed?: boolean; notes?: string }
      >;
      food_plan: Table<
        { id: string; family_id: string; day: string; slot: string; recipe_id: string | null; title: string; servings: number | null; people: string[]; cook: string | null; leftover_of: string | null; takeaway_id: string | null; notes: string; position: number; status: string; requested_by: string | null; cal_event_id: string | null; created_by: string | null; created_at: string; updated_at: string },
        { family_id: string; day: string; slot: string; recipe_id?: string | null; title?: string; servings?: number | null; people?: string[]; cook?: string | null; leftover_of?: string | null; takeaway_id?: string | null; notes?: string; position?: number; status?: string },
        { day?: string; slot?: string; recipe_id?: string | null; title?: string; servings?: number | null; people?: string[]; cook?: string | null; leftover_of?: string | null; takeaway_id?: string | null; notes?: string; position?: number; status?: string; cal_event_id?: string | null }
      >;
      food_ratings: Table<
        { id: string; recipe_id: string; member_id: string; family_id: string; value: number; note: string; created_at: string },
        { recipe_id: string; member_id: string; family_id: string; value: number; note?: string },
        { value?: number; note?: string }
      >;
      food_recipes: Table<
        { id: string; family_id: string; title: string; description: string; photo_path: string | null; source_url: string | null; servings: number; prep_min: number | null; cook_min: number | null; ingredients: Json; steps: Json; tags: string[]; allergens: string[]; collections: string[]; nutrition: Json | null; notes: string; times_made: number; last_made: string | null; timeline: Json | null; created_by: string | null; created_at: string; updated_at: string; archived_at: string | null },
        { family_id: string; title: string; description?: string; photo_path?: string | null; source_url?: string | null; servings?: number; prep_min?: number | null; cook_min?: number | null; ingredients?: Json; steps?: Json; tags?: string[]; allergens?: string[]; collections?: string[]; nutrition?: Json | null; notes?: string; timeline?: Json | null },
        { title?: string; description?: string; photo_path?: string | null; source_url?: string | null; servings?: number; prep_min?: number | null; cook_min?: number | null; ingredients?: Json; steps?: Json; tags?: string[]; allergens?: string[]; collections?: string[]; nutrition?: Json | null; notes?: string; times_made?: number; last_made?: string | null; timeline?: Json | null; archived_at?: string | null }
      >;
      food_settings: Table<
        { member_id: string; family_id: string; calories_on: boolean; kcal_target: number | null; updated_at: string },
        { member_id: string; family_id: string; calories_on?: boolean; kcal_target?: number | null },
        { calories_on?: boolean; kcal_target?: number | null }
      >;
      food_spend: Table<
        { id: string; family_id: string; spent_on: string; amount: number; store: string | null; note: string; added_by: string | null; created_at: string },
        { family_id: string; spent_on?: string; amount: number; store?: string | null; note?: string },
        { spent_on?: string; amount?: number; store?: string | null; note?: string }
      >;
      food_stock: Table<
        { id: string; family_id: string; name: string; place: string; quantity: number | null; unit: string | null; portions: number | null; use_by: string | null; low_at: number | null; barcode: string | null; from_recipe: string | null; nutrition: Json | null; added_by: string | null; created_at: string; updated_at: string; used_up_at: string | null },
        { family_id: string; name: string; place?: string; quantity?: number | null; unit?: string | null; portions?: number | null; use_by?: string | null; low_at?: number | null; barcode?: string | null; from_recipe?: string | null; nutrition?: Json | null },
        { name?: string; place?: string; quantity?: number | null; unit?: string | null; portions?: number | null; use_by?: string | null; low_at?: number | null; nutrition?: Json | null; used_up_at?: string | null }
      >;
      food_takeaway_orders: Table<
        { id: string; takeaway_id: string; family_id: string; member_id: string; order_text: string; updated_at: string },
        { takeaway_id: string; family_id: string; member_id: string; order_text: string },
        { order_text?: string }
      >;
      food_takeaways: Table<
        { id: string; family_id: string; name: string; phone: string | null; link: string | null; notes: string; last_ordered: string | null; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; name: string; phone?: string | null; link?: string | null; notes?: string },
        { name?: string; phone?: string | null; link?: string | null; notes?: string; last_ordered?: string | null; archived_at?: string | null }
      >;
      habit_logs: Table<
        { id: string; family_id: string; habit_id: string; member_id: string; day: string; count: number; skipped: boolean; updated_at: string },
        { family_id: string; habit_id: string; member_id: string; day: string; count?: number; skipped?: boolean },
        { count?: number; skipped?: boolean }
      >;
      habits: Table<
        { id: string; family_id: string; member_id: string; title: string; emoji: string | null; per: string; target: number; unit: string | null; stars: number; buddy: string | null; position: number; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; member_id: string; title: string; emoji?: string | null; per?: string; target?: number; unit?: string | null; stars?: number; buddy?: string | null; position?: number },
        { title?: string; emoji?: string | null; per?: string; target?: number; unit?: string | null; stars?: number; buddy?: string | null; position?: number; archived_at?: string | null }
      >;
      hc_bin_changes: Table<
        { bin_id: string; family_id: string; on_date: string; move_to: string | null; skip: boolean; who: string | null },
        { bin_id: string; family_id: string; on_date: string; move_to?: string | null; skip?: boolean; who?: string | null },
        { move_to?: string | null; skip?: boolean; who?: string | null }
      >;
      hc_bins: Table<
        { id: string; family_id: string; name: string; colour: string; every_weeks: number; first_on: string; notes: string; people: string[]; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; name: string; colour?: string; every_weeks?: number; first_on: string; notes?: string; people?: string[] },
        { name?: string; colour?: string; every_weeks?: number; first_on?: string; notes?: string; people?: string[]; archived_at?: string | null }
      >;
      hc_job_done: Table<
        { id: string; job_id: string; family_id: string; done_on: string; note: string; done_by: string | null; created_at: string },
        { id?: string; job_id: string; family_id: string; done_on: string; note?: string; done_by?: string | null; created_at?: string },
        {  }
      >;
      hc_jobs: Table<
        { id: string; family_id: string; title: string; emoji: string | null; every_months: number; next_due: string; notes: string; contact_id: string | null; who: string | null; last_done_on: string | null; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; title: string; emoji?: string | null; every_months?: number; next_due: string; notes?: string; contact_id?: string | null; who?: string | null },
        { title?: string; emoji?: string | null; every_months?: number; next_due?: string; notes?: string; contact_id?: string | null; who?: string | null; archived_at?: string | null }
      >;
      hc_meters: Table<
        { id: string; family_id: string; name: string; unit: string | null; archived_at: string | null },
        { family_id: string; name: string; unit?: string | null },
        { name?: string; unit?: string | null; archived_at?: string | null }
      >;
      hc_readings: Table<
        { id: string; meter_id: string; family_id: string; value: number; read_on: string; photo_path: string | null; created_by: string | null; created_at: string; deleted_at: string | null },
        { meter_id: string; family_id: string; value: number; read_on: string; photo_path?: string | null },
        { value?: number; read_on?: string; photo_path?: string | null; deleted_at?: string | null }
      >;
      hc_repairs: Table<
        { id: string; family_id: string; title: string; place: string | null; photo_path: string | null; notes: string; who: string | null; contact_id: string | null; done_at: string | null; done_by: string | null; created_by: string | null; created_at: string; deleted_at: string | null },
        { family_id: string; title: string; place?: string | null; photo_path?: string | null; notes?: string; who?: string | null; contact_id?: string | null },
        { title?: string; place?: string | null; photo_path?: string | null; notes?: string; who?: string | null; contact_id?: string | null; done_at?: string | null; deleted_at?: string | null }
      >;
      hc_sends: Table<
        { ref_id: string; for_date: string; kind: string },
        { ref_id: string; for_date: string; kind: string },
        {  }
      >;
      health_checks: Table<
        { id: string; family_id: string; person_id: string; title: string; due_on: string; every_months: number | null; last_done_on: string | null; done_at: string | null; notes: string; reminded_on: string | null; created_by: string | null; created_at: string; deleted_at: string | null },
        { family_id: string; person_id: string; title: string; due_on: string; every_months?: number | null; notes?: string },
        { title?: string; due_on?: string; every_months?: number | null; last_done_on?: string | null; notes?: string; deleted_at?: string | null }
      >;
      health_doses: Table<
        { id: string; family_id: string; med_id: string; on_date: string; at_time: string; reminded_at: string | null; given_at: string | null; given_by: string | null },
        { family_id: string; med_id: string; on_date: string; at_time: string; given_at?: string | null },
        { family_id?: string; med_id?: string; on_date?: string; at_time?: string; given_at?: string | null }
      >;
      health_meds: Table<
        { id: string; family_id: string; person_id: string; name: string; amount: string | null; times: string[]; start_on: string; end_on: string | null; remind: string[]; notes: string; created_by: string | null; created_at: string; deleted_at: string | null },
        { family_id: string; person_id: string; name: string; amount?: string | null; times: string[]; start_on: string; end_on?: string | null; remind?: string[]; notes?: string },
        { name?: string; amount?: string | null; times?: string[]; start_on?: string; end_on?: string | null; remind?: string[]; notes?: string; deleted_at?: string | null }
      >;
      host_events: Table<
        { id: string; family_id: string; event_id: string; notes: string; reminded_on: string | null; created_by: string | null; created_at: string },
        { family_id: string; event_id: string; notes?: string },
        { notes?: string }
      >;
      host_guests: Table<
        { id: string; family_id: string; host_id: string; name: string; people: number; status: string; dietary: string | null; notes: string; created_by: string | null; created_at: string; deleted_at: string | null },
        { family_id: string; host_id: string; name: string; people?: number; status?: string; dietary?: string | null; notes?: string },
        { name?: string; people?: number; status?: string; dietary?: string | null; notes?: string; deleted_at?: string | null }
      >;
      host_items: Table<
        { id: string; family_id: string; host_id: string; kind: string; title: string; who: string | null; done_at: string | null; done_by: string | null; created_by: string | null; created_at: string; deleted_at: string | null },
        { family_id: string; host_id: string; kind: string; title: string; who?: string | null },
        { title?: string; who?: string | null; done_at?: string | null; deleted_at?: string | null }
      >;
      kid_about: Table<
        { child_id: string; family_id: string; answers: Json; updated_by: string | null; updated_at: string },
        { child_id: string; family_id: string; answers?: Json },
        { answers?: Json }
      >;
      kid_asks: Table<
        { id: string; family_id: string; child_id: string; minutes: number; reason: string; status: string; answered_by: string | null; answered_at: string | null; created_at: string },
        { family_id: string; child_id: string; minutes: number; reason?: string },
        { status?: string }
      >;
      kid_milestones: Table<
        { id: string; family_id: string; child_id: string; on_date: string; emoji: string | null; title: string; height_cm: number | null; notes: string; created_by: string | null; created_at: string; deleted_at: string | null },
        { family_id: string; child_id: string; on_date: string; emoji?: string | null; title: string; height_cm?: number | null; notes?: string },
        { on_date?: string; emoji?: string | null; title?: string; height_cm?: number | null; notes?: string; deleted_at?: string | null }
      >;
      kid_rules: Table<
        { id: string; family_id: string; child_id: string; emoji: string | null; title: string; position: number; created_by: string | null; created_at: string; deleted_at: string | null },
        { family_id: string; child_id: string; emoji?: string | null; title: string; position?: number },
        { emoji?: string | null; title?: string; position?: number; deleted_at?: string | null }
      >;
      money_accounts: Table<
        { id: string; family_id: string; name: string; kind: string; currency: string; opening_balance: number; owner: string | null; private_to: string | null; position: number; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; name: string; kind?: string; currency?: string; opening_balance?: number; owner?: string | null; private_to?: string | null; position?: number },
        { name?: string; kind?: string; currency?: string; opening_balance?: number; owner?: string | null; private_to?: string | null; position?: number; archived_at?: string | null }
      >;
      money_alert_sends: Table<
        { bill_id: string; kind: string; for_date: string },
        { bill_id: string; kind: string; for_date: string },
        {  }
      >;
      money_bills: Table<
        { id: string; family_id: string; name: string; kind: string; amount: number; currency: string; every: string; next_due: string; account_id: string | null; category_id: string | null; payee_match: string | null; trial_ends: string | null; contract_ends: string | null; remind_days: number; auto_record: boolean; previous_amount: number | null; amount_changed_on: string | null; notes: string; private_to: string | null; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; name: string; kind?: string; amount: number; currency?: string; every?: string; next_due: string; account_id?: string | null; category_id?: string | null; payee_match?: string | null; trial_ends?: string | null; contract_ends?: string | null; remind_days?: number; auto_record?: boolean; notes?: string; private_to?: string | null },
        { name?: string; kind?: string; amount?: number; currency?: string; every?: string; next_due?: string; account_id?: string | null; category_id?: string | null; payee_match?: string | null; trial_ends?: string | null; contract_ends?: string | null; remind_days?: number; auto_record?: boolean; notes?: string; private_to?: string | null; archived_at?: string | null }
      >;
      money_budgets: Table<
        { id: string; family_id: string; category_id: string; period_start: string; planned: number },
        { family_id: string; category_id: string; period_start: string; planned?: number },
        { planned?: number }
      >;
      money_categories: Table<
        { id: string; family_id: string; name: string; emoji: string | null; direction: string; carry_over: boolean; position: number; archived_at: string | null },
        { family_id: string; name: string; emoji?: string | null; direction?: string; carry_over?: boolean; position?: number },
        { name?: string; emoji?: string | null; carry_over?: boolean; position?: number; archived_at?: string | null }
      >;
      money_credit_scores: Table<
        { id: string; family_id: string; member_id: string; agency: string; score: number; on_date: string; private_to: string | null; created_at: string },
        { family_id: string; member_id: string; agency: string; score: number; on_date?: string; private_to?: string | null },
        {  }
      >;
      money_debts: Table<
        { id: string; family_id: string; name: string; kind: string; balance: number; rate: number | null; payment: number | null; as_of: string; private_to: string | null; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; name: string; kind?: string; balance: number; rate?: number | null; payment?: number | null; as_of?: string; private_to?: string | null },
        { name?: string; kind?: string; balance?: number; rate?: number | null; payment?: number | null; as_of?: string; private_to?: string | null; archived_at?: string | null }
      >;
      money_gift_budgets: Table<
        { id: string; family_id: string; person: string | null; person_name: string | null; occasion: string; year: number; budget: number; created_by: string | null; created_at: string },
        { family_id: string; person?: string | null; person_name?: string | null; occasion: string; year: number; budget: number },
        { budget?: number }
      >;
      money_holding_values: Table<
        { id: string; holding_id: string; family_id: string; value: number; on_date: string; private_to: string | null },
        { holding_id: string; family_id: string; value: number; on_date?: string; private_to?: string | null },
        { value?: number }
      >;
      money_holdings: Table<
        { id: string; family_id: string; name: string; kind: string; owner: string | null; private_to: string | null; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; name: string; kind?: string; owner?: string | null; private_to?: string | null },
        { name?: string; kind?: string; owner?: string | null; private_to?: string | null; archived_at?: string | null }
      >;
      money_import_profiles: Table<
        { id: string; family_id: string; name: string; signature: string; mapping: Json },
        { family_id: string; name: string; signature: string; mapping: Json },
        { name?: string; mapping?: Json }
      >;
      money_payee_rules: Table<
        { id: string; family_id: string; match: string; category_id: string },
        { family_id: string; match: string; category_id: string },
        { category_id?: string }
      >;
      money_payments: Table<
        { id: string; family_id: string; account_id: string | null; category_id: string | null; direction: string; amount: number; currency: string; amount_gbp: number; on_date: string; payee: string; note: string; paid_by: string | null; in_budget: boolean; bill_id: string | null; pot_id: string | null; child_id: string | null; gift_budget_id: string | null; receipt_path: string | null; source: string; import_key: string | null; food_spend_id: string | null; private_to: string | null; created_by: string | null; created_at: string; deleted_at: string | null },
        { family_id: string; account_id?: string | null; category_id?: string | null; direction?: string; amount: number; currency?: string; amount_gbp: number; on_date?: string; payee?: string; note?: string; paid_by?: string | null; in_budget?: boolean; bill_id?: string | null; pot_id?: string | null; child_id?: string | null; gift_budget_id?: string | null; receipt_path?: string | null; source?: string; import_key?: string | null; private_to?: string | null },
        { account_id?: string | null; category_id?: string | null; direction?: string; amount?: number; currency?: string; amount_gbp?: number; on_date?: string; payee?: string; note?: string; paid_by?: string | null; in_budget?: boolean; bill_id?: string | null; pot_id?: string | null; child_id?: string | null; gift_budget_id?: string | null; receipt_path?: string | null; private_to?: string | null; deleted_at?: string | null }
      >;
      money_pot_moves: Table<
        { id: string; pot_id: string; family_id: string; amount: number; on_date: string; note: string; private_to: string | null; created_by: string | null; created_at: string },
        { pot_id: string; family_id: string; amount: number; on_date?: string; note?: string; private_to?: string | null },
        {  }
      >;
      money_pots: Table<
        { id: string; family_id: string; name: string; kind: string; emoji: string | null; target: number | null; target_date: string | null; private_to: string | null; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; name: string; kind?: string; emoji?: string | null; target?: number | null; target_date?: string | null; private_to?: string | null },
        { name?: string; emoji?: string | null; target?: number | null; target_date?: string | null; private_to?: string | null; archived_at?: string | null }
      >;
      money_settings: Table<
        { family_id: string; period: string; payday_day: number | null; four_weekly_anchor: string | null; weekly_summary: boolean; updated_at: string },
        { family_id: string; period?: string; payday_day?: number | null; four_weekly_anchor?: string | null; weekly_summary?: boolean },
        { period?: string; payday_day?: number | null; four_weekly_anchor?: string | null; weekly_summary?: boolean }
      >;
      money_summary_sends: Table<
        { member_id: string; week_start: string },
        { member_id: string; week_start: string },
        {  }
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
      pocket_entries: Table<
        { id: string; family_id: string; member_id: string; pot: string; amount: number; kind: string; note: string; status: string; on_date: string; source_key: string | null; created_by: string | null; decided_by: string | null; decided_at: string | null; created_at: string },
        { family_id: string; member_id: string; pot?: string; amount: number; kind: string; note?: string; on_date?: string; source_key?: string | null },
        { status?: string }
      >;
      pocket_goals: Table<
        { id: string; family_id: string; member_id: string; title: string; emoji: string | null; target: number; wish_item_id: string | null; reached_at: string | null; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; member_id: string; title: string; emoji?: string | null; target: number; wish_item_id?: string | null },
        { title?: string; emoji?: string | null; target?: number; archived_at?: string | null }
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
      reward_claims: Table<
        { id: string; family_id: string; reward_id: string; member_id: string; stars: number; status: string; decided_by: string | null; decided_at: string | null; created_at: string },
        { family_id: string; reward_id: string; member_id: string },
        { status?: string }
      >;
      reward_gives: Table<
        { id: string; family_id: string; reward_id: string; member_id: string; stars: number; created_at: string },
        { family_id: string; reward_id: string; member_id: string; stars: number },
        {  }
      >;
      reward_jobs: Table<
        { id: string; family_id: string; title: string; emoji: string | null; money: number; stars: number; people: string[]; needs_photo: boolean; claimed_by: string | null; claimed_at: string | null; done_at: string | null; photo_path: string | null; confirmed_by: string | null; confirmed_at: string | null; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; title: string; emoji?: string | null; money?: number; stars?: number; people?: string[]; needs_photo?: boolean },
        { title?: string; emoji?: string | null; money?: number; stars?: number; people?: string[]; needs_photo?: boolean; claimed_by?: string | null; done_at?: string | null; photo_path?: string | null; confirmed_at?: string | null; archived_at?: string | null }
      >;
      reward_people: Table<
        { member_id: string; family_id: string; pocket_amount: number; pocket_every: string; next_pay: string | null; save_pct: number; give_pct: number; paused_until: string | null; interest_pct: number; match_pct: number; teen_mode: boolean; advance_owed: number; advance_repay: number; alerts: string[]; updated_at: string },
        { member_id: string; family_id: string; pocket_amount?: number; pocket_every?: string; next_pay?: string | null; save_pct?: number; give_pct?: number; paused_until?: string | null; interest_pct?: number; match_pct?: number; teen_mode?: boolean; advance_repay?: number; alerts?: string[] },
        { pocket_amount?: number; pocket_every?: string; next_pay?: string | null; save_pct?: number; give_pct?: number; paused_until?: string | null; interest_pct?: number; match_pct?: number; teen_mode?: boolean; advance_repay?: number; alerts?: string[] }
      >;
      reward_sends: Table<
        { member_id: string; kind: string; for_date: string },
        { member_id: string; kind: string; for_date: string },
        {  }
      >;
      reward_settings: Table<
        { family_id: string; for_me: boolean; for_us: boolean; children: boolean; stars_per_pound: number | null; deductions_on: boolean; week_bonus: number; week_bonus_stars: number; updated_at: string },
        { family_id: string; for_me?: boolean; for_us?: boolean; children?: boolean; stars_per_pound?: number | null; deductions_on?: boolean; week_bonus?: number; week_bonus_stars?: number },
        { for_me?: boolean; for_us?: boolean; children?: boolean; stars_per_pound?: number | null; deductions_on?: boolean; week_bonus?: number; week_bonus_stars?: number }
      >;
      rewards: Table<
        { id: string; family_id: string; kind: string; owner: string | null; people: string[]; title: string; emoji: string | null; stars: number; done_at: string | null; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; kind: string; owner?: string | null; people?: string[]; title: string; emoji?: string | null; stars: number },
        { people?: string[]; title?: string; emoji?: string | null; stars?: number; archived_at?: string | null }
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
      school_activities: Table<
        { id: string; family_id: string; member_id: string; place_id: string | null; event_id: string; kit: string[]; cost: number | null; cost_every: string | null; created_by: string | null; created_at: string },
        { family_id: string; member_id: string; place_id?: string | null; event_id: string; kit?: string[]; cost?: number | null; cost_every?: string | null },
        { place_id?: string | null; kit?: string[]; cost?: number | null; cost_every?: string | null }
      >;
      school_children: Table<
        { member_id: string; family_id: string; place_id: string | null; class_name: string | null; teacher: string | null; day_starts: string | null; day_ends: string | null; updated_at: string },
        { member_id: string; family_id: string; place_id?: string | null; class_name?: string | null; teacher?: string | null; day_starts?: string | null; day_ends?: string | null },
        { place_id?: string | null; class_name?: string | null; teacher?: string | null; day_starts?: string | null; day_ends?: string | null }
      >;
      school_days: Table<
        { member_id: string; family_id: string; weekday: number; bring: string[]; lunch: string | null },
        { member_id: string; family_id: string; weekday: number; bring?: string[]; lunch?: string | null },
        { bring?: string[]; lunch?: string | null }
      >;
      school_people: Table<
        { member_id: string; family_id: string; morning: boolean },
        { member_id: string; family_id: string; morning?: boolean },
        { morning?: boolean }
      >;
      school_places: Table<
        { id: string; family_id: string; name: string; kind: string; phone: string | null; notes: string; created_by: string | null; created_at: string; archived_at: string | null },
        { family_id: string; name: string; kind?: string; phone?: string | null; notes?: string },
        { name?: string; kind?: string; phone?: string | null; notes?: string; archived_at?: string | null }
      >;
      school_run_changes: Table<
        { id: string; family_id: string; member_id: string; on_date: string; drop_by: string | null; pick_by: string | null; pick_time: string | null; note: string; created_by: string | null; created_at: string },
        { family_id: string; member_id: string; on_date: string; drop_by?: string | null; pick_by?: string | null; pick_time?: string | null; note?: string },
        { drop_by?: string | null; pick_by?: string | null; pick_time?: string | null; note?: string }
      >;
      school_runs: Table<
        { member_id: string; family_id: string; weekday: number; drop_by: string | null; pick_by: string | null; pick_time: string | null },
        { member_id: string; family_id: string; weekday: number; drop_by?: string | null; pick_by?: string | null; pick_time?: string | null },
        { drop_by?: string | null; pick_by?: string | null; pick_time?: string | null }
      >;
      school_sends: Table<
        { member_id: string; for_date: string },
        { member_id: string; for_date: string },
        {  }
      >;
      school_tasks: Table<
        { id: string; family_id: string; member_id: string | null; title: string; kind: string; due_on: string | null; amount: number | null; note: string; photo_path: string | null; done_at: string | null; done_by: string | null; created_by: string | null; created_at: string; deleted_at: string | null },
        { family_id: string; member_id?: string | null; title: string; kind?: string; due_on?: string | null; amount?: number | null; note?: string; photo_path?: string | null },
        { member_id?: string | null; title?: string; kind?: string; due_on?: string | null; amount?: number | null; note?: string; photo_path?: string | null; done_at?: string | null; deleted_at?: string | null }
      >;
      star_entries: Table<
        { id: string; family_id: string; member_id: string; delta: number; kind: string; source_key: string | null; note: string; created_by: string | null; created_at: string },
        { family_id: string; member_id: string; delta: number; kind: string; note?: string },
        {  }
      >;
      trip_ideas: Table<
        { id: string; family_id: string; title: string; place: string | null; link: string | null; notes: string; done_at: string | null; created_by: string | null; created_at: string; deleted_at: string | null },
        { family_id: string; title: string; place?: string | null; link?: string | null; notes?: string },
        { title?: string; place?: string | null; link?: string | null; notes?: string; done_at?: string | null; deleted_at?: string | null }
      >;
      trip_items: Table<
        { id: string; family_id: string; trip_id: string; kind: string; member_id: string | null; title: string; plan_kind: string | null; starts_at: string | null; ref: string | null; place: string | null; notes: string; position: number; done_at: string | null; done_by: string | null; created_by: string | null; created_at: string; deleted_at: string | null },
        { family_id: string; trip_id: string; kind: string; member_id?: string | null; title: string; plan_kind?: string | null; starts_at?: string | null; ref?: string | null; place?: string | null; notes?: string; position?: number },
        { member_id?: string | null; title?: string; plan_kind?: string | null; starts_at?: string | null; ref?: string | null; place?: string | null; notes?: string; position?: number; done_at?: string | null; deleted_at?: string | null }
      >;
      trips: Table<
        { id: string; family_id: string; event_id: string; emoji: string | null; notes: string; reminded_on: string | null; created_by: string | null; created_at: string },
        { family_id: string; event_id: string; emoji?: string | null; notes?: string },
        { emoji?: string | null; notes?: string }
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
      push_public_key: { Args: Record<string, never>; Returns: string | null };
      board_family_thread: { Args: Record<string, never>; Returns: string };
      board_open_direct: { Args: { p_other: string }; Returns: string };
      board_create_group: { Args: { p_title: string; p_emoji: string; p_people: string[] }; Returns: string };
      board_set_group_people: { Args: { p_thread: string; p_people: string[] }; Returns: undefined };
      board_leave_group: { Args: { p_thread: string }; Returns: undefined };
      board_mark_read: { Args: { p_thread: string }; Returns: undefined };
      board_set_mute: { Args: { p_thread: string; p_muted: boolean }; Returns: undefined };
      board_unread: { Args: Record<string, never>; Returns: { thread_id: string; unread: number; last_message_at: string; muted: boolean }[] };
      board_create_poll: { Args: { p_thread: string; p_question: string; p_kind: string; p_multi: boolean; p_options: Json; p_client_id: string | null }; Returns: string };
      board_share_location: { Args: { p_thread: string; p_reply_to: string | null; p_lat: number; p_lng: number; p_accuracy: number; p_client_id: string | null }; Returns: string };
      board_storage: { Args: Record<string, never>; Returns: { used: number; allowance: number }[] };
      board_create_album_share: { Args: { p_album: string; p_label: string; p_days: number }; Returns: string };
      board_search: { Args: { p_q: string }; Returns: { kind: string; id: string; ref: string | null; title: string; snippet: string; at: string }[] };
      board_todays_prompt: { Args: Record<string, never>; Returns: { prompt_id: string; text: string }[] };
      food_can_add_photo: { Args: Record<string, never>; Returns: boolean };
      money_setup: { Args: Record<string, never>; Returns: undefined };
      money_period_start: { Args: { f: string; d: string }; Returns: string };
      money_next_due: { Args: { d: string; every: string }; Returns: string };
      money_can_add_file: { Args: Record<string, never>; Returns: boolean };
      reward_setup: { Args: Record<string, never>; Returns: undefined };
      reward_balances: { Args: Record<string, never>; Returns: { member_id: string; stars: number; spend: number; save: number; give: number; waiting: number }[] };
      reward_swap: { Args: { p_member: string; p_stars: number }; Returns: number };
      reward_move: { Args: { p_member: string; p_from: string; p_to: string; p_amount: number }; Returns: undefined };
      reward_advance: { Args: { p_child: string; p_amount: number; p_repay: number }; Returns: undefined };
      reward_cheer: { Args: { p_habit: string }; Returns: undefined };
      doc_setup: { Args: Record<string, never>; Returns: undefined };
      doc_remove: { Args: { p_doc: string }; Returns: undefined };
      em_create_share: { Args: { p_name: string; p_days: number }; Returns: string };
      em_shared: { Args: { p_token: string }; Returns: Json };
      hc_job_tick: { Args: { p_job: string; p_done_on: string; p_note: string }; Returns: string };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
