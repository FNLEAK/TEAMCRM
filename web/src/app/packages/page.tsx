import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { canManageRoles } from "@/lib/roleAccess";
import { RouteChunkFallback } from "@/components/RouteChunkFallback";

const PackagesShell = dynamic(
  () => import("@/components/PackagesShell").then((m) => ({ default: m.PackagesShell })),
  { loading: () => <RouteChunkFallback label="Loading packages…" /> },
);

export default async function PackagesPage() {
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

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const firstName = typeof meta?.first_name === "string" ? meta.first_name.trim() : "";
  const displayName =
    firstName ||
    (typeof meta?.full_name === "string" ? meta.full_name.trim() : "") ||
    (typeof meta?.name === "string" ? meta.name.trim() : "") ||
    user.email?.split("@")[0] ||
    "You";
  const allowRoleApplier = await canManageRoles(supabase, user.id, user.email);

  return <PackagesShell userDisplayName={displayName} canManageRoles={allowRoleApplier} />;
}
