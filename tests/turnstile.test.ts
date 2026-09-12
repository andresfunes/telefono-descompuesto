import { describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "@/lib/ai/turnstile";

const input = {
  secretKey: "secret",
  remoteIp: "203.0.113.4",
};

describe("Turnstile server verification", () => {
  it("rejects a missing token without making a network request", async () => {
    const fetchImpl = vi.fn();
    await expect(
      verifyTurnstileToken({ ...input, token: "", fetchImpl }),
    ).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an invalid token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] })),
    );
    await expect(
      verifyTurnstileToken({ ...input, token: "invalid", fetchImpl }),
    ).resolves.toBe(false);
  });

  it("accepts a successful token for the commentary action", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, action: "ai_commentary" })),
    );
    await expect(
      verifyTurnstileToken({ ...input, token: "valid", fetchImpl }),
    ).resolves.toBe(true);
    const body = fetchImpl.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("valid");
    expect(body.get("remoteip")).toBe("203.0.113.4");
  });

  it("degrades safely when Siteverify is unavailable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network unavailable"));
    await expect(
      verifyTurnstileToken({ ...input, token: "valid", fetchImpl }),
    ).resolves.toBe(false);
  });
});
