import { describe, expect, it, vi } from "vitest";
import {
  CommentaryResponseError,
  generateCommentaryWithRetry,
  parseCommentaryResponse,
} from "@/lib/ai/game-commentary";
import type { Game } from "@/domain/game";

const game: Game = {
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
  chains: [{
    id: "chain-1",
    originPlayerId: "p1",
    entries: [{
      id: "entry-1",
      playerId: "p1",
      roundNumber: 0,
      createdAt: new Date("2026-01-01T00:01:00Z"),
      content: { type: "text", text: "Un caballo" },
    }, {
      id: "entry-2",
      playerId: "p2",
      roundNumber: 1,
      createdAt: new Date("2026-01-01T00:02:00Z"),
      content: {
        type: "drawing",
        asset: { kind: "storage-path", value: "drawing.png", mimeType: "image/png" },
      },
    }],
  }],
};

const completedResponse = {
  status: "completed",
  incomplete_details: null,
  output_text: JSON.stringify({
    comments: [{
      text: "Andrés arrancó con un caballo y Sofía hizo lo que pudo.",
      chain_id: "chain-1",
      entry_ids: ["entry-1", "entry-2"],
    }],
    awards: [
      {
        category: "BEST_DRAWING",
        reason: "convirtió el caballo en algo casi reconocible.",
        winner_entry_id: "entry-2",
        entry_ids: ["entry-2"],
      },
      {
        category: "MOST_ORIGINAL_PHRASE",
        reason: "apostó todo a un caballo sin contexto.",
        winner_entry_id: "entry-1",
        entry_ids: ["entry-1"],
      },
      {
        category: "CHAOS_AGENT",
        reason: "dejó al caballo irreconocible.",
        winner_entry_id: "entry-2",
        entry_ids: ["entry-1", "entry-2"],
      },
    ],
  }),
};

describe("OpenAI commentary responses", () => {
  it("rejects an explicitly truncated response before parsing its JSON", () => {
    expect(() => parseCommentaryResponse({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output_text: '{"comments":[{"text":"truncado',
    }, game)).toThrow(CommentaryResponseError);
  });

  it("retries once with a larger token budget after truncation", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_text: '{"comments":',
      })
      .mockResolvedValueOnce(completedResponse);

    await expect(generateCommentaryWithRetry(game, request)).resolves.toHaveLength(4);
    expect(request).toHaveBeenNthCalledWith(1, 1_800);
    expect(request).toHaveBeenNthCalledWith(2, 3_200);
  });

  it("also retries malformed JSON when the API omits incomplete status", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        status: "completed",
        incomplete_details: null,
        output_text: '{"comments":',
      })
      .mockResolvedValueOnce(completedResponse);

    await expect(generateCommentaryWithRetry(game, request)).resolves.toHaveLength(4);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("retries awards that are not grounded in the required contribution type", async () => {
    const invalidResponse = {
      ...completedResponse,
      output_text: JSON.stringify({
        ...JSON.parse(completedResponse.output_text),
        awards: [{
          category: "BEST_DRAWING",
          reason: "ganó sin dibujar.",
          winner_entry_id: "entry-1",
          entry_ids: ["entry-1"],
        }],
      }),
    };
    const request = vi.fn()
      .mockResolvedValueOnce(invalidResponse)
      .mockResolvedValueOnce(completedResponse);

    await expect(generateCommentaryWithRetry(game, request)).resolves.toHaveLength(4);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-token incomplete responses", async () => {
    const request = vi.fn().mockResolvedValue({
      status: "incomplete",
      incomplete_details: { reason: "content_filter" },
      output_text: "",
    });

    await expect(generateCommentaryWithRetry(game, request)).rejects.toMatchObject({
      retryable: false,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
