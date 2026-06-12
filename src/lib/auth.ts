import "server-only";

import type { User } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getUserFromRequest(
  request: Request,
): Promise<User | null> {
  if (!getSupabasePublicConfig()) {
    return null;
  }

  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  const { data, error } = await createSupabaseServerClient().auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user;
}
