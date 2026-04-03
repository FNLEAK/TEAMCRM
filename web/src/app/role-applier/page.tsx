import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { OWNER_EMAIL, isOwnerEmail } from "@/lib/ownerRoleGate";
import { canManageRoles } from "@/lib/roleAccess";
import { RoleApplierShell } from "@/components/RoleApplierShell";

export default async function RoleApplierPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="flex min-h-svh items-center justify-center p-8 text-sm text-red-400">
        Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const email = user.email ?? "";
  const allowRoleApplier = await canManageRoles(supabase, user.id, email);
  if (!allowRoleApplier) {
    return (
      <div className="flex min-h-svh items-center justify-center p-8">
        <div className="max-w-xl rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-200">
          Access denied. Only owners can open this panel.
          {!isOwnerEmail(email) ? (
            <>
              {" "}
              Primary owner email: <code className="text-red-100">{OWNER_EMAIL}</code>.
            </>
          ) : null}
        </div>
      </div>
    );
  }

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const firstName = typeof meta?.first_name === "string" ? meta.first_name.trim() : "";
  const displayName =
    firstName ||
    (typeof meta?.full_name === "string" ? meta.full_name.trim() : "") ||
    (typeof meta?.name === "string" ? meta.name.trim() : "") ||
    user.email?.split("@")[0] ||
    "Owner";

  return <RoleApplierShell ownerId={user.id} userDisplayName={displayName} ownerEmail={OWNER_EMAIL} />;
}
