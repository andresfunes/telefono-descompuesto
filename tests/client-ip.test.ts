import { describe, expect, it } from "vitest";
import { trustedClientIp } from "@/lib/ai/client-ip";

function requestHeaders(values: Record<string, string>): Pick<Headers, "get"> {
  return { get: (name) => values[name] ?? null };
}

describe("trusted client IP", () => {
  it("uses the Vercel-owned forwarded header", () => {
    expect(
      trustedClientIp(
        requestHeaders({ "x-vercel-forwarded-for": "203.0.113.4" }),
        { vercel: "1", nodeEnv: "production" },
      ),
    ).toBe("203.0.113.4");
  });

  it("does not trust arbitrary forwarding headers on unknown production hosts", () => {
    expect(
      trustedClientIp(
        requestHeaders({ "x-forwarded-for": "203.0.113.4" }),
        { nodeEnv: "production" },
      ),
    ).toBeNull();
  });
});
