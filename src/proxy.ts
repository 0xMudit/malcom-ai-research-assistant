import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const adminUser =
  process.env.MALCOM_ADMIN_USER ||
  (process.env.NODE_ENV === "production" ? "" : "admin");
const adminPassword =
  process.env.MALCOM_ADMIN_PASSWORD ||
  (process.env.NODE_ENV === "production" ? "" : "MalcomAdmin2026!");

function unauthorized() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Malcom Admin", charset="UTF-8"',
    },
  });
}

export function proxy(request: NextRequest) {
  if (!adminUser || !adminPassword) {
    return new NextResponse("Admin credentials are not configured.", {
      status: 503,
    });
  }

  const header = request.headers.get("authorization");

  if (!header?.startsWith("Basic ")) {
    return unauthorized();
  }

  let credentials = "";

  try {
    credentials = atob(header.slice(6));
  } catch {
    return unauthorized();
  }

  const separator = credentials.indexOf(":");

  if (separator < 1) {
    return unauthorized();
  }

  const user = credentials.slice(0, separator);
  const password = credentials.slice(separator + 1);

  if (user !== adminUser || password !== adminPassword) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
