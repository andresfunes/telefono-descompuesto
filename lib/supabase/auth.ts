import "server-only";

import {
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from "@supabase/supabase-js";
import { createClient } from "./server";

interface ClaimsResult {
  data: { claims?: { sub?: unknown } } | null;
  error: unknown;
}

export async function resolveAuthenticatedUserId(
  readClaims: () => Promise<ClaimsResult>,
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await readClaims();
    if (!error) return typeof data?.claims?.sub === "string" ? data.claims.sub : null;
    if (isAuthSessionMissingError(error)) return null;
    if (attempt === 0 && isAuthRetryableFetchError(error)) continue;
    throw error;
  }
  return null;
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient();
  return resolveAuthenticatedUserId(() => supabase.auth.getClaims());
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
