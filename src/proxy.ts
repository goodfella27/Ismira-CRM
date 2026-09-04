import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  getAuthEntryRedirectDestination,
  isAdminOnlyRoute,
  isProtectedRoute,
  isPublicRoute,
} from "@/lib/auth/route-policy";

function redirectWithCookies(request: NextRequest, response: NextResponse, pathname: string) {
  const redirect = NextResponse.redirect(new URL(pathname, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const pathname = request.nextUrl.pathname;
  const isPublic = isPublicRoute(pathname);
  const isProtected = isProtectedRoute(pathname);

  if (!isPublic && !isProtected) {
    return response;
  }

  let user: { id: string } | null = null;
  let isAdmin = false;
  let canAccessHrPortal = false;

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;

    if (user) {
      const { data: memberships } = await supabase
        .from("company_members")
        .select("role")
        .eq("user_id", user.id);
      const roles = Array.isArray(memberships)
        ? memberships
            .map((membership) =>
              typeof membership.role === "string"
                ? membership.role.trim().toLowerCase()
                : ""
            )
            .filter(Boolean)
        : [];
      isAdmin = roles.includes("admin");
      canAccessHrPortal = roles.some((role) =>
        ["admin", "member premium", "member_premium", "premium", "recruiter"].includes(role)
      );
    }
  } catch {
    return response;
  }

  if (!user && isProtected) {
    const next = `${pathname}${request.nextUrl.search}`;
    return redirectWithCookies(
      request,
      response,
      `/admin?next=${encodeURIComponent(next)}`
    );
  }

  if (!user && pathname === "/login") {
    const redirectUrl = new URL("/admin", request.url);
    const next = request.nextUrl.searchParams.get("next");
    if (next) redirectUrl.searchParams.set("next", next);
    const redirect = NextResponse.redirect(redirectUrl);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  if (user) {
    const authEntryRedirect = getAuthEntryRedirectDestination(pathname, canAccessHrPortal);
    if (authEntryRedirect) {
      return redirectWithCookies(request, response, authEntryRedirect);
    }
  }

  if (user && isAdminOnlyRoute(pathname) && !isAdmin) {
    return redirectWithCookies(request, response, canAccessHrPortal ? "/pipeline" : "/jobs");
  }

  if (user && !canAccessHrPortal && isProtected) {
    return redirectWithCookies(request, response, "/jobs");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)|api).*)"],
};
