import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "@/lib/ai/turnstile";

const alwaysPassTestSecret = "1x0000000000000000000000000000000AA";

const input = {
  secretKey: "secret",
  remoteIp: "203.0.113.4",
  expectedAction: "ai_commentary",
};

describe("Turnstile server verification", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  it("rejects a valid token issued for a different action", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, action: "ai_commentary" })),
    );
    await expect(
      verifyTurnstileToken({
        ...input,
        token: "valid",
        expectedAction: "join_game",
        fetchImpl,
      }),
    ).resolves.toBe(false);
  });

  it("accepts Cloudflare's always-pass response outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        metadata: { result_with_testing_key: true },
      })),
    );

    await expect(
      verifyTurnstileToken({
        ...input,
        secretKey: alwaysPassTestSecret,
        token: "XXXX.DUMMY.TOKEN.XXXX",
        fetchImpl,
      }),
    ).resolves.toBe(true);
  });

  it("keeps action validation strict for test keys in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        metadata: { result_with_testing_key: true },
      })),
    );

    await expect(
      verifyTurnstileToken({
        ...input,
        secretKey: alwaysPassTestSecret,
        token: "XXXX.DUMMY.TOKEN.XXXX",
        fetchImpl,
      }),
    ).resolves.toBe(false);
  });

  it("requires Cloudflare's testing marker when the action is missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true })),
    );

    await expect(
      verifyTurnstileToken({
        ...input,
        secretKey: alwaysPassTestSecret,
        token: "valid",
        fetchImpl,
      }),
    ).resolves.toBe(false);
  });

  it("degrades safely when Siteverify is unavailable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network unavailable"));
    await expect(
      verifyTurnstileToken({ ...input, token: "valid", fetchImpl }),
    ).resolves.toBe(false);
  });
});
