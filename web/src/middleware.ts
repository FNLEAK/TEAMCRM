import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import {
  allowsAnonymousSupabasePath,
  isInboundWebhookApiPath,
  ownerApprovalGateEnabled,
  requiresSupabaseSession,
} from "@/lib/crmRouteGuards";
import { isOwnerEmail } from "@/lib/ownerRoleGate";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  if (isInboundWebhookApiPath(pathname)) {
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return response;
  }

  let user: User | null = null;
  let supabase: ReturnType<typeof createServerClient> | null = null;

  try {
    supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
  } catch (err) {
    console.error("[middleware] Supabase auth failed:", err);
    user = null;
  }

  const gate = ownerApprovalGateEnabled();

  if (!user && requiresSupabaseSession(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let approved = true;
  if (gate && user) {
    approved = false;
    if (isOwnerEmail(user.email)) {
      approved = true;
    } else if (supabase) {
      try {
        const { data: row, error } = await supabase
          .from("team_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!error && row && (row.role === "team" || row.role === "owner")) {
          approved = true;
        }
      } catch (e) {
        console.error("[middleware] team_roles check failed:", e);
        // Fail open on read errors so a Supabase outage does not hard-lock everyone.
        approved = true;
      }
    }
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (gate && user && !approved) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Owner approval required", code: "WAITING_APPROVAL" },
        { status: 403 },
      );
    }
    /* Page navigation is allowed; OwnerApprovalGate modal blocks the UI. */
  }

  if (gate && user && approved && pathname === "/waiting-approval") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}
