import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseServiceRoleKey,
  requireSupabasePublicConfig,
  requireSupabaseServiceRoleKey,
} from "./config";

export function createSupabaseServerClient() {
  const config = requireSupabasePublicConfig();

  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
    },
  });
}

export function createSupabaseAdminClient() {
  const config = requireSupabasePublicConfig();
  const serviceRoleKey = requireSupabaseServiceRoleKey();

  return createClient(config.url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function hasSupabaseAdminConfig() {
  return Boolean(getSupabaseServiceRoleKey());
}
