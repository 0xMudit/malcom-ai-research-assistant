import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  adminSessionCookieName,
  hasAdminCredentials,
  isValidAdminAuthorization,
  isValidAdminSession,
} from "@/lib/admin-auth";

function unauthorized() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Malcom Admin", charset="UTF-8"',
    },
  });
}

function isProtectedAdminPath(pathname: string) {
  return (
    pathname === "/api/auth/invite" ||
    pathname === "/api/stats" ||
    pathname === "/api/supabase/health"
  );
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const response = NextResponse.next();

  if (!pathname.startsWith("/api/") && request.method === "GET") {
    response.headers.set(
      "Cache-Control",
      "no-store, max-age=0, must-revalidate",
    );
  }

  if (!isProtectedAdminPath(pathname)) {
    return response;
  }

  if (!hasAdminCredentials()) {
    return new NextResponse("Admin credentials are not configured.", {
      status: 503,
    });
  }

  const hasAuthorization = isValidAdminAuthorization(
    request.headers.get("authorization"),
  );
  const hasSession = isValidAdminSession(
    request.cookies.get(adminSessionCookieName)?.value,
  );

  if (!hasAuthorization && !hasSession) {
    return unauthorized();
  }

  return response;
}

export const config = {
  matcher: [
    "/api/auth/invite",
    "/api/stats",
    "/api/supabase/health",
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|og-image.png|robots.txt|sitemap.xml).*)",
  ],
};
