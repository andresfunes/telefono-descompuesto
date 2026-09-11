import { describe, expect, it } from "vitest";
import {
  buildCommentaryInput,
  buildCommentaryTranscript,
  canGenerateGameCommentary,
  GAME_COMMENTARY_INSTRUCTIONS,
  parseHumorIntensity,
  validateCommentaryItems,
} from "@/domain/game-commentary";
import type { Game } from "@/domain/game";

function revealedGame(): Game {
  return {
    id: "game-1",
    code: "ABCD",
    phase: "REVEAL",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    hostPlayerId: "p1",
    currentRound: null,
    rematchCode: null,
    players: [
      { id: "p1", name: "Andrés", joinedAt: new Date("2026-01-01T00:00:00Z") },
      { id: "p2", name: "Sofía", joinedAt: new Date("2026-01-01T00:00:01Z") },
    ],
    chains: [
      {
        id: "chain-1",
        originPlayerId: "p1",
        entries: [
          {
            id: "entry-text",
            playerId: "p1",
            roundNumber: 0,
            createdAt: new Date("2026-01-01T00:01:00Z"),
            content: { type: "text", text: "Un caballo en la playa" },
          },
          {
            id: "entry-drawing",
            playerId: "p2",
            roundNumber: 1,
            createdAt: new Date("2026-01-01T00:02:00Z"),
            content: {
              type: "drawing",
              asset: { kind: "storage-path", value: "drawing.png", mimeType: "image/png" },
            },
          },
        ],
      },
    ],
  };
}

describe("game commentary context", () => {
  it("allows only the room creator to generate commentary", () => {
    expect(canGenerateGameCommentary(revealedGame(), "p1")).toBe(true);
    expect(canGenerateGameCommentary(revealedGame(), "p2")).toBe(false);
  });

  it("serializes real player names, authors and contributions", () => {
    const transcript = buildCommentaryTranscript(revealedGame());

    expect(transcript).toContain('"playerName":"Andrés"');
    expect(transcript).toContain('"playerName":"Sofía"');
    expect(transcript).toContain("Un caballo en la playa");
    expect(transcript.indexOf("entry-text")).toBeLessThan(transcript.indexOf("entry-drawing"));
  });

  it("attaches drawings with their real author and entry id", () => {
    const input = buildCommentaryInput(revealedGame(), {
      "entry-drawing": "https://example.test/signed-drawing.png",
    }, "STRONG");

    expect(input).toContainEqual(expect.objectContaining({
      type: "input_text",
      text: expect.stringContaining("dibujada por Sofía"),
    }));
    expect(input).toContainEqual({
      type: "input_image",
      image_url: "https://example.test/signed-drawing.png",
      detail: "low",
    });
    expect(input[0]).toEqual(expect.objectContaining({
      text: expect.stringContaining("Intensidad máxima"),
    }));
  });

  it("makes the acidic level explicitly harsher while keeping it game-focused", () => {
    const input = buildCommentaryInput(revealedGame(), {}, "STANDARD");

    expect(input[0]).toEqual(expect.objectContaining({
      type: "input_text",
      text: expect.stringContaining("sé mordaz, frontal e incisivo"),
    }));
    expect(input[0]).toEqual(expect.objectContaining({
      text: expect.stringContaining("nunca a la persona fuera del juego"),
    }));
  });

  it("rejects invented evidence references", () => {
    expect(() => validateCommentaryItems({
      comments: [{
        text: "Comentario inventado",
        entry_ids: ["entry-invented"],
      }],
    }, revealedGame())).toThrow("no pertenecen a la partida");
  });

  it("derives player attribution from the cited entries", () => {
    expect(validateCommentaryItems({
      comments: [{
        text: "Andrés inició esto y Sofía intentó dibujarlo.",
        entry_ids: ["entry-text", "entry-drawing", "entry-text"],
      }],
    }, revealedGame())).toEqual([{
      text: "Andrés inició esto y Sofía intentó dibujarlo.",
      entryIds: ["entry-text", "entry-drawing"],
      playerIds: ["p1", "p2"],
    }]);
  });

  it("defaults unknown intensity values and defines the safe roast boundary", () => {
    expect(parseHumorIntensity("anything")).toBe("STANDARD");
    expect(GAME_COMMENTARY_INSTRUCTIONS).toContain("No tenés nombre");
    expect(GAME_COMMENTARY_INSTRUCTIONS).toContain("Criticá exclusivamente lo ocurrido");
    expect(GAME_COMMENTARY_INSTRUCTIONS).toContain("inteligencia real");
  });
});
