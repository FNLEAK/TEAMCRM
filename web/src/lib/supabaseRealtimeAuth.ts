import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Postgres Changes on RLS-protected tables only reach the browser if Realtime uses the user's JWT.
 * Matches the pattern used in LeadDetailDrawer (presence / realtime).
 */
export async function ensureSupabaseRealtimeAuth(supabase: SupabaseClient): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      await supabase.realtime.setAuth(session.access_token);
    }
    const rt = supabase.realtime as unknown as { connect?: () => Promise<void> };
    if (typeof rt.connect === "function") {
      try {
        await rt.connect();
      } catch {
        /* socket may already be connecting */
      }
    }
  } catch {
    /* non-fatal */
  }
}
