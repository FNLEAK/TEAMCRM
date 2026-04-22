import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { canManageRoles } from "@/lib/roleAccess";
import { RouteChunkFallback } from "@/components/RouteChunkFallback";
import { teamProfileFromDb, type TeamProfile } from "@/lib/leadTypes";
import { enrichProfileMapWithTeamRoles, fetchProfilesByIds } from "@/lib/profileSelect";

const RoofingLeadsShell = dynamic(
  () => import("@/components/RoofingLeadsShell").then((m) => ({ default: m.RoofingLeadsShell })),
  { loading: () => <RouteChunkFallback label="Loading…" /> },
);

function calendarTeamMemberOrderFromEnv(): string[] {
  const raw = process.env.NEXT_PUBLIC_CALENDAR_TEAM_USER_IDS?.trim();
  if (!raw) return [];
  return raw.split(/[\s,]+/).filter(Boolean).slice(0, 5);
}

export default async function RoofingLeadsPage() {
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

  const allowRoleApplier = await canManageRoles(supabase, user.id, user.email);
  if (!allowRoleApplier) redirect("/");

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const firstName = typeof meta?.first_name === "string" ? meta.first_name.trim() : "";
  const userDisplayName =
    firstName ||
    (typeof meta?.full_name === "string" ? meta.full_name.trim() : "") ||
    (typeof meta?.name === "string" ? meta.name.trim() : "") ||
    user.email?.split("@")[0] ||
    "You";

  const userId = user.id;
  let calendarTeamMemberOrder = calendarTeamMemberOrderFromEnv();
  const profileIdSet = new Set<string>([userId, ...calendarTeamMemberOrder]);
  if (calendarTeamMemberOrder.length === 0) {
    calendarTeamMemberOrder = [...profileIdSet].sort().slice(0, 5);
  }

  const profileMap: Record<string, TeamProfile> = {};
  const needProfiles = [...profileIdSet].filter(Boolean);
  if (needProfiles.length > 0) {
    const { data: profRows, error: profErr } = await fetchProfilesByIds(supabase, needProfiles);
    if (profErr && !String(profErr.message).toLowerCase().includes("permission")) {
      console.warn("[Roofing Leads] profiles lookup failed — check RLS and columns:", profErr.message);
    }
    for (const p of profRows ?? []) {
      const id = p.id as string;
      profileMap[id] = teamProfileFromDb({
        id,
        first_name: p.first_name ?? null,
        full_name: p.full_name ?? null,
        avatar_initials: p.avatar_initials ?? null,
        email: p.email ?? null,
      });
    }
  }

  for (const id of profileIdSet) {
    if (!profileMap[id]) {
      profileMap[id] = {
        initials: "·",
        label: id.replace(/-/g, "").slice(0, 8),
        fullName: "",
        firstName: "",
        email: undefined,
      };
    }
  }

  await enrichProfileMapWithTeamRoles(supabase, profileMap, [...profileIdSet]);

  return (
    <RoofingLeadsShell
      userId={userId}
      userDisplayName={userDisplayName}
      canManageRoles={allowRoleApplier}
      profileMap={profileMap}
      calendarTeamMemberOrder={calendarTeamMemberOrder}
    />
  );
}
