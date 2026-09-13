import { describe, expect, it } from "vitest";
import { isAdminAnalyticsAuthorized } from "@/lib/product-analytics/admin-auth";

function basic(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

describe("admin analytics authentication", () => {
  it("accepts only the configured secret with the admin username", () => {
    expect(isAdminAnalyticsAuthorized(basic("admin", "correct-secret"), "correct-secret"))
      .toBe(true);
    expect(isAdminAnalyticsAuthorized(basic("admin", "wrong-secret"), "correct-secret"))
      .toBe(false);
    expect(isAdminAnalyticsAuthorized(basic("other", "correct-secret"), "correct-secret"))
      .toBe(false);
  });

  it("fails closed for missing configuration and malformed headers", () => {
    expect(isAdminAnalyticsAuthorized(null, "correct-secret")).toBe(false);
    expect(isAdminAnalyticsAuthorized("Bearer token", "correct-secret")).toBe(false);
    expect(isAdminAnalyticsAuthorized("Basic not-valid-base64!", "correct-secret"))
      .toBe(false);
    expect(isAdminAnalyticsAuthorized(basic("admin", "correct-secret"), undefined))
      .toBe(false);
  });

  it("supports secrets containing colons", () => {
    expect(isAdminAnalyticsAuthorized(basic("admin", "one:two:three"), "one:two:three"))
      .toBe(true);
  });
});
