import "server-only";

import { createClient } from "./server";

export async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string") return null;
  return data.claims.sub;
}

export async function ensureAnonymousUserId(): Promise<string> {
  const existingUserId = await getAuthenticatedUserId();
  if (existingUserId) return existingUserId;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(error?.message ?? "No se pudo crear la sesión anónima.");
  }
  return data.user.id;
}
