import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { canManageRoles } from "@/lib/roleAccess";

export type PendingAuthUser = {
  id: string;
  email: string | null;
  created_at: string;
};

/**
 * Lists Supabase Auth users so owners can assign roles before a `profiles` row exists.
 * Requires `SUPABASE_SERVICE_ROLE_KEY` on the server (Vercel env, never NEXT_PUBLIC_*).
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const allowed = await canManageRoles(supabase, user.id, user.email);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      {
        error: "Server misconfiguration",
        hint: "Add SUPABASE_SERVICE_ROLE_KEY to Vercel/hosting env so pending sign-ups appear in Role Applier.",
        users: [] as PendingAuthUser[],
      },
      { status: 503 },
    );
  }

  const users: PendingAuthUser[] = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    for (const u of data.users) {
      users.push({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
      });
    }
    if (data.users.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }

  users.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
  return NextResponse.json({ users });
}
