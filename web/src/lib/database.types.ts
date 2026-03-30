/**
 * Supabase `public` schema types. Regenerate from your project when the schema changes:
 *   npx supabase gen types typescript --project-id <ref> --schema public > src/lib/database.types.ts
 *
 * `team_calendar_day_notes` uses **body** for note text. The day key may be **day** or **date**
 * — set `NEXT_PUBLIC_TEAM_DAY_NOTES_DATE_COLUMN` to match your table.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      team_calendar_day_notes: {
        Row: {
          /** Calendar key — often `day` (date) or renamed to `date` in some projects */
          day?: string;
          date?: string;
          body: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          day?: string;
          date?: string;
          body?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          day?: string;
          date?: string;
          body?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      leads: {
        Row: Record<string, Json | undefined>;
        Insert: Record<string, Json | undefined>;
        Update: Record<string, Json | undefined>;
        Relationships: [];
      };
      profiles: {
        Row: Record<string, Json | undefined>;
        Insert: Record<string, Json | undefined>;
        Update: Record<string, Json | undefined>;
        Relationships: [];
      };
      lead_activity: {
        Row: Record<string, Json | undefined>;
        Insert: Record<string, Json | undefined>;
        Update: Record<string, Json | undefined>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type TeamCalendarDayNoteRow = Database["public"]["Tables"]["team_calendar_day_notes"]["Row"];
