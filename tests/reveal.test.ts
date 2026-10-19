import { describe, expect, it } from "vitest";
import { createLobbyGame, type Game } from "@/domain/game";
import { isRevealSummary, revealSlides, setRevealStep, visibleRevealEntries } from "@/domain/reveal";

function fixture(): Game {
  const entry = (id: string, roundNumber: number) => ({ id, roundNumber, playerId: "host",
    createdAt: new Date(0), content: { type: "text" as const, text: id } });
  return { ...createLobbyGame("ABC234"), phase: "REVEAL", hostPlayerId: "host", revealStep: -1,
    players: [{ id: "host", active: true, name: "Host", joinedAt: new Date(0) }],
    chains: [
      { id: "first", originPlayerId: "host", entries: [entry("later", 2), entry("original", 0)] },
      { id: "second", originPlayerId: "guest", entries: [entry("skipped-original", 1)] },
    ] };
}

describe("reveal presentation", () => {
  it("orders by chain and round, retaining gaps left by removed players", () => {
    expect(revealSlides(fixture()).map(({ entry }) => entry.id)).toEqual(["original", "later", "skipped-original"]);
  });
  it("keeps future entries hidden and allows backward navigation and summary", () => {
    let game = fixture();
    expect(visibleRevealEntries(game)).toEqual([]);
    game = setRevealStep(game, "host", -1, 1);
    expect(visibleRevealEntries(game).map((e) => e.id)).toEqual(["original", "later"]);
    game = setRevealStep(game, "host", 1, 0);
    expect(visibleRevealEntries(game)).toHaveLength(1);
    game = setRevealStep(game, "host", 0, 3);
    expect(isRevealSummary(game)).toBe(true);
    expect(visibleRevealEntries(game)).toHaveLength(3);
  });
  it("supports legacy summaries and empty chains", () => {
    expect(isRevealSummary({ ...fixture(), revealStep: undefined })).toBe(true);
    expect(revealSlides({ ...fixture(), chains: [] })).toEqual([]);
    expect(isRevealSummary(setRevealStep({ ...fixture(), chains: [] }, "host", -1, 0))).toBe(true);
  });
  it("rejects guests, inactive hosts, premature reveals, invalid and stale cursors", () => {
    expect(() => setRevealStep(fixture(), "guest", -1, 0)).toThrow();
    expect(() => setRevealStep({ ...fixture(), players: [] }, "host", -1, 0)).toThrow();
    expect(() => setRevealStep({ ...fixture(), phase: "PLAYING" }, "host", -1, 0)).toThrow();
    for (const step of [-2, 4, NaN, 1.5]) expect(() => setRevealStep(fixture(), "host", -1, step)).toThrow();
    expect(() => setRevealStep(fixture(), "host", 0, 1)).toThrow();
  });
});
