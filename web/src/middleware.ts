import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return response;
  }

  let user: User | null = null;

  try {
    const supabase = createServerClient(url, key, {
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
    // Fail open: avoid blank 500 pages if Supabase is unreachable or env is wrong.
    user = null;
  }

  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login";
  const isAuthCallback = pathname.startsWith("/auth/callback");

  if (
    !user &&
    (pathname === "/" ||
      pathname === "/pipeline-command-center" ||
      pathname === "/personal-stats" ||
      pathname === "/role-applier" ||
      pathname === "/packages" ||
      pathname === "/team-chat" ||
      pathname.startsWith("/team-chat/") ||
      pathname === "/how-to" ||
      pathname.startsWith("/how-to/"))
  ) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    return redirect;
  }

  if (user && isLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isAuthCallback) {
    return response;
  }

  return response;
}

/**
 * Skip ALL Next.js internals and static assets so middleware never runs on
 * `_next/*` (chunks, CSS, HMR, RSC flight, etc.). A too-narrow matcher can
 * intermittently break styles after refresh or navigation in dev.
 */
export const config = {
  matcher: [
    "/((?!_next/|_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
