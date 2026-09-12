import {
  AuthError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { resolveAuthenticatedUserId } from "@/lib/supabase/auth";

describe("Supabase auth identity", () => {
  it("returns the verified subject", async () => {
    await expect(
      resolveAuthenticatedUserId(async () => ({
        data: { claims: { sub: "auth-player" } },
        error: null,
      })),
    ).resolves.toBe("auth-player");
  });

  it("returns null only when the session is actually missing", async () => {
    await expect(
      resolveAuthenticatedUserId(async () => ({
        data: null,
        error: new AuthSessionMissingError(),
      })),
    ).resolves.toBeNull();
  });

  it("retries a transient Auth network failure", async () => {
    const readClaims = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: new AuthRetryableFetchError("Gateway Timeout", 504),
      })
      .mockResolvedValueOnce({
        data: { claims: { sub: "auth-player" } },
        error: null,
      });

    await expect(resolveAuthenticatedUserId(readClaims)).resolves.toBe("auth-player");
    expect(readClaims).toHaveBeenCalledTimes(2);
  });

  it("does not misclassify other Auth failures as a logged-out visitor", async () => {
    const error = new AuthError("Refresh token was already used", 400, "refresh_token_already_used");

    await expect(
      resolveAuthenticatedUserId(async () => ({ data: null, error })),
    ).rejects.toBe(error);
  });
});
