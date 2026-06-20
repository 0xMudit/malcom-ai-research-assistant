import { createHmac, timingSafeEqual } from "node:crypto";

export const adminSessionCookieName = "malcom_admin_session";

const adminSessionMaxAgeSeconds = 8 * 60 * 60;
const adminSessionVersion = "v1";
const isProduction = process.env.NODE_ENV === "production";
const developmentAdminUser = "admin";
const developmentAdminPassword = "MalcomAdmin2026!";
const adminUser =
  process.env.MALCOM_ADMIN_USER ||
  (isProduction ? "" : developmentAdminUser);
const adminPassword =
  process.env.MALCOM_ADMIN_PASSWORD ||
  (isProduction ? "" : developmentAdminPassword);
const adminSessionSecret =
  process.env.MALCOM_ADMIN_SESSION_SECRET ||
  [adminUser, adminPassword].filter(Boolean).join(":");

export function hasAdminCredentials() {
  return Boolean(adminUser && adminPassword);
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeBasicCredentials(header: string | null) {
  if (!header || !/^Basic\s+/i.test(header)) {
    return null;
  }

  try {
    const decoded = Buffer.from(
      header.replace(/^Basic\s+/i, ""),
      "base64",
    ).toString("utf8");
    const separator = decoded.indexOf(":");

    if (separator < 1) {
      return null;
    }

    return {
      user: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export function isValidAdminCredentials(user: string, password: string) {
  if (!hasAdminCredentials()) {
    return false;
  }

  const matchesConfiguredCredentials =
    safeCompare(user, adminUser) && safeCompare(password, adminPassword);
  const matchesDevelopmentFallback =
    !isProduction &&
    safeCompare(user, developmentAdminUser) &&
    safeCompare(password, developmentAdminPassword);

  return matchesConfiguredCredentials || matchesDevelopmentFallback;
}

export function isValidAdminAuthorization(header: string | null) {
  const credentials = decodeBasicCredentials(header);

  return Boolean(
    credentials &&
      isValidAdminCredentials(credentials.user, credentials.password),
  );
}

function signAdminSession(payload: string) {
  return createHmac("sha256", adminSessionSecret)
    .update(payload)
    .digest("base64url");
}

export function createAdminSessionToken(now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({
      exp: now + adminSessionMaxAgeSeconds * 1000,
      iat: now,
      user: adminUser,
    }),
  ).toString("base64url");

  return `${adminSessionVersion}.${payload}.${signAdminSession(payload)}`;
}

export function getAdminSession(token: string | null | undefined) {
  if (!token || !hasAdminCredentials() || !adminSessionSecret) {
    return null;
  }

  const [version, payload, signature] = token.split(".");

  if (
    version !== adminSessionVersion ||
    !payload ||
    !signature ||
    !safeCompare(signature, signAdminSession(payload))
  ) {
    return null;
  }

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { exp?: unknown; user?: unknown };

    if (
      typeof session.exp !== "number" ||
      typeof session.user !== "string" ||
      session.user !== adminUser ||
      session.exp <= Date.now()
    ) {
      return null;
    }

    return {
      expiresAt: new Date(session.exp).toISOString(),
      user: session.user,
    };
  } catch {
    return null;
  }
}

export function isValidAdminSession(token: string | null | undefined) {
  return Boolean(getAdminSession(token));
}

export function getAdminSessionCookieOptions(maxAge = adminSessionMaxAgeSeconds) {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax" as const,
    secure: isProduction,
  };
}
