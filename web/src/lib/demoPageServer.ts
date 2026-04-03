import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export type DemoGate =
  | { kind: "env" }
  | { kind: "anon" }
  | { kind: "ok"; supabase: SupabaseClient<Database>; user: User };

export async function requireSupabaseForDemo(): Promise<DemoGate> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { kind: "env" };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "anon" };
  return { kind: "ok", supabase, user };
}
