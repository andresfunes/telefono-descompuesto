import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./env";
import { getSupabaseSecretKey } from "./secret-env";

export function createAdminClient() {
  const { url } = getSupabasePublicConfig();
  return createClient(url, getSupabaseSecretKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
