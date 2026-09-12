import { describe, expect, it } from "vitest";
import {
  buildGameInvitationUrl,
  buildWhatsAppInvitationUrl,
} from "@/lib/game-invitation";

describe("game invitations", () => {
  it("builds an absolute short room URL", () => {
    expect(buildGameInvitationUrl("https://example.com", "ABCD")).toBe(
      "https://example.com/ABCD",
    );
  });

  it("builds a WhatsApp message with the room code and invitation URL", () => {
    const url = buildWhatsAppInvitationUrl("https://example.com/ABCD", "ABCD");
    const message = new URL(url).searchParams.get("text");

    expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(message).toContain("Código ABCD");
    expect(message).toContain("https://example.com/ABCD");
  });
});
