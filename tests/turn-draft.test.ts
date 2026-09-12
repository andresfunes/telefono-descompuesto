import { describe, expect, it } from "vitest";
import { turnDraftStorageKey } from "@/lib/turn-draft";

describe("turn draft storage", () => {
  it("isolates drafts by room, player, round and entry type", () => {
    const base = {
      roomCode: "ABC123",
      playerId: "player-1",
      roundNumber: 2,
      entryType: "text" as const,
    };

    expect(turnDraftStorageKey(base)).not.toBe(turnDraftStorageKey({
      ...base,
      playerId: "player-2",
    }));
    expect(turnDraftStorageKey(base)).not.toBe(turnDraftStorageKey({
      ...base,
      roundNumber: 3,
    }));
    expect(turnDraftStorageKey(base)).not.toBe(turnDraftStorageKey({
      ...base,
      entryType: "drawing",
    }));
  });
});
