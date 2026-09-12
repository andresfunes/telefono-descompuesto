import "server-only";

import { TURNSTILE_COMMENTARY_ACTION } from "./turnstile-action";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SiteverifyResponse {
  success?: boolean;
  action?: string;
  "error-codes"?: unknown;
}

export interface TurnstileVerificationInput {
  token: string;
  secretKey: string;
  remoteIp: string | null;
  fetchImpl?: typeof fetch;
}

export async function verifyTurnstileToken({
  token,
  secretKey,
  remoteIp,
  fetchImpl = fetch,
}: TurnstileVerificationInput): Promise<boolean> {
  const normalizedToken = token.trim();
  if (!normalizedToken || normalizedToken.length > 2_048) return false;

  const body = new FormData();
  body.set("secret", secretKey);
  body.set("response", normalizedToken);
  body.set("idempotency_key", crypto.randomUUID());
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as SiteverifyResponse;
    return result.success === true && result.action === TURNSTILE_COMMENTARY_ACTION;
  } catch {
    return false;
  }
}
