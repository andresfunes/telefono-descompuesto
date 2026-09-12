import { describe, expect, it } from "vitest";
import {
  buildCommentaryInput,
  buildCommentaryTranscript,
  canGenerateGameCommentary,
  deserializeGameCommentaryItem,
  eligibleGameAwardCategories,
  GAME_COMMENTARY_INSTRUCTIONS,
  parseHumorIntensity,
  serializeGameCommentaryItem,
  validateCommentaryResponse,
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
    lobbyLocked: false,
    lobbyExpiresAt: new Date("2026-01-01T02:00:00Z"),
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

  it("creates grounded awards and derives the winner name from the winning entry", () => {
    const result = validateCommentaryResponse({
      comments: [
        {
          text: "El caballo sobrevivió.",
          chain_id: "chain-1",
          entry_ids: ["entry-text", "entry-drawing"],
        },
      ],
      awards: [
        {
          category: "BEST_DRAWING",
          reason: "entregó el único caballo con posibilidades.",
          winner_entry_id: "entry-drawing",
          entry_ids: ["entry-drawing"],
        },
        {
          category: "MOST_ORIGINAL_PHRASE",
          reason: "mandó un caballo a la playa sin explicaciones.",
          winner_entry_id: "entry-text",
          entry_ids: ["entry-text"],
        },
        {
          category: "CHAOS_AGENT",
          reason: "transformó la idea justo antes del cierre.",
          winner_entry_id: "entry-drawing",
          entry_ids: ["entry-text", "entry-drawing"],
        },
      ],
    }, revealedGame());

    expect(result[0]).toMatchObject({
      text: expect.stringContaining("Mejor dibujante · Sofía"),
      entryIds: ["entry-drawing"],
      playerIds: ["p2"],
    });
    expect(result).toHaveLength(4);
  });

  it("enables the interpretation award only when a player interpreted a drawing", () => {
    const twoPlayerGame = revealedGame();
    expect(eligibleGameAwardCategories(twoPlayerGame)).not.toContain(
      "BEST_INTERPRETATION",
    );

    const threePlayerGame: Game = {
      ...twoPlayerGame,
      players: [
        ...twoPlayerGame.players,
        { id: "p3", name: "Mateo", joinedAt: new Date("2026-01-01T00:00:02Z") },
      ],
      chains: [{
        ...twoPlayerGame.chains[0],
        entries: [
          ...twoPlayerGame.chains[0].entries,
          {
            id: "entry-interpretation",
            playerId: "p3",
            roundNumber: 2,
            createdAt: new Date("2026-01-01T00:03:00Z"),
            content: { type: "text", text: "Una vaca tomando sol" },
          },
        ],
      }],
    };

    expect(eligibleGameAwardCategories(threePlayerGame)).toContain(
      "BEST_INTERPRETATION",
    );
  });

  it("persists the chain reference while keeping legacy comments readable", () => {
    const serialized = serializeGameCommentaryItem({
      text: "Comentario de la primera cadena.",
      entryIds: ["entry-text"],
      playerIds: ["p1"],
      chainId: "chain-1",
    });

    expect(deserializeGameCommentaryItem(serialized)).toEqual({
      version: 1,
      text: "Comentario de la primera cadena.",
      entryIds: ["entry-text"],
      chainId: "chain-1",
    });
    expect(deserializeGameCommentaryItem("Comentario anterior.")).toEqual({
      version: 1,
      text: "Comentario anterior.",
      entryIds: [],
    });
  });

  it("rejects an award assigned to the wrong contribution type", () => {
    expect(() => validateCommentaryResponse({
      comments: [
        {
          text: "Comentario de la cadena.",
          chain_id: "chain-1",
          entry_ids: ["entry-text", "entry-drawing"],
        },
      ],
      awards: [
        {
          category: "BEST_DRAWING",
          reason: "ganó.",
          winner_entry_id: "entry-text",
          entry_ids: ["entry-text"],
        },
      ],
    }, revealedGame())).toThrow("no corresponde a la categoría");
  });

  it("defaults unknown intensity values and defines the safe roast boundary", () => {
    expect(parseHumorIntensity("anything")).toBe("STANDARD");
    expect(GAME_COMMENTARY_INSTRUCTIONS).toContain("No tenés nombre");
    expect(GAME_COMMENTARY_INSTRUCTIONS).toContain("Criticá exclusivamente lo ocurrido");
    expect(GAME_COMMENTARY_INSTRUCTIONS).toContain("inteligencia real");
    expect(GAME_COMMENTARY_INSTRUCTIONS).toContain("mejor dibujo");
  });
});
