import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { canManageRoles } from "@/lib/roleAccess";
import { OWNER_EMAIL, isOwnerEmail } from "@/lib/ownerRoleGate";
import {
  collectAuditRelatedUserIds,
  loadActorProfiles,
  loadAdminAuditLogs,
  loadRecentClosedDealsForAdmin,
} from "@/lib/loadAdminAuditLogs";
import { AdminLogsClient } from "@/components/AdminLogsClient";

export default async function AdminLogsPage() {
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
  const allow = await canManageRoles(supabase, user.id, email);
  if (!allow) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#030304] p-8">
        <div className="max-w-xl rounded-2xl border border-rose-500/35 bg-rose-950/20 px-6 py-5 text-sm text-rose-100 shadow-[0_0_40px_-20px_rgba(244,63,94,0.5)]">
          <p className="font-semibold text-white">Access denied</p>
          <p className="mt-2 leading-relaxed text-rose-100/90">
            Admin logs are only visible to account owners.
            {!isOwnerEmail(email) ? (
              <>
                {" "}
                Primary owner email: <code className="rounded bg-black/30 px-1.5 py-0.5 text-rose-50">{OWNER_EMAIL}</code>.
              </>
            ) : null}
          </p>
        </div>
      </div>
    );
  }

  const { rows, tableMissing, error } = await loadAdminAuditLogs(supabase);
  const actors = await loadActorProfiles(supabase, collectAuditRelatedUserIds(rows));

  let fallbackDeals = (await loadRecentClosedDealsForAdmin(supabase)).rows;
  if (!tableMissing) {
    fallbackDeals = [];
  }

  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center p-8 text-sm text-rose-300">
        Could not load audit logs: {error}
      </div>
    );
  }

  return (
    <AdminLogsClient logs={rows} actors={actors} tableMissing={tableMissing} fallbackDeals={fallbackDeals} />
  );
}
