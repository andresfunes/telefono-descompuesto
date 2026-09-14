import "server-only";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const ALWAYS_PASS_TEST_SECRET = "1x0000000000000000000000000000000AA";

interface SiteverifyResponse {
  success?: boolean;
  action?: string;
  "error-codes"?: unknown;
  metadata?: {
    result_with_testing_key?: boolean;
  };
}

export interface TurnstileVerificationInput {
  token: string;
  secretKey: string;
  remoteIp: string | null;
  expectedAction: string;
  fetchImpl?: typeof fetch;
}

export async function verifyTurnstileToken({
  token,
  secretKey,
  remoteIp,
  expectedAction,
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
    if (result.success !== true) return false;
    if (result.action === expectedAction) return true;

    return (
      process.env.NODE_ENV !== "production" &&
      secretKey === ALWAYS_PASS_TEST_SECRET &&
      result.metadata?.result_with_testing_key === true
    );
  } catch {
    return false;
  }
}
