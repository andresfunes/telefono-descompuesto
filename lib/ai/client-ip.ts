import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

function validIp(value: string | null): string | null {
  const candidate = value?.split(",", 1)[0]?.trim() ?? "";
  return isIP(candidate) ? candidate : null;
}

export function trustedClientIp(
  requestHeaders: Pick<Headers, "get">,
  environment: { vercel?: string; nodeEnv?: string } = {
    vercel: process.env.VERCEL,
    nodeEnv: process.env.NODE_ENV,
  },
): string | null {
  if (environment.vercel === "1") {
    return validIp(requestHeaders.get("x-vercel-forwarded-for"));
  }
  if (environment.nodeEnv !== "production") {
    return validIp(requestHeaders.get("x-forwarded-for")) ?? "127.0.0.1";
  }
  return null;
}

export function hashClientIp(ip: string | null): string {
  const secret =
    process.env.ABUSE_IP_HASH_SECRET?.trim() ||
    process.env.AI_IP_HASH_SECRET?.trim() ||
    process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return "unavailable";
  return createHmac("sha256", secret)
    .update(ip ?? "unknown")
    .digest("hex");
}
