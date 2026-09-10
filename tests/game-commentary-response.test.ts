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
  players: [{ id: "p1", name: "Andrés", joinedAt: new Date("2026-01-01T00:00:00Z") }],
  chains: [{
    id: "chain-1",
    originPlayerId: "p1",
    entries: [{
      id: "entry-1",
      playerId: "p1",
      roundNumber: 0,
      createdAt: new Date("2026-01-01T00:01:00Z"),
      content: { type: "text", text: "Un caballo" },
    }],
  }],
};

const completedResponse = {
  status: "completed",
  incomplete_details: null,
  output_text: JSON.stringify({
    comments: [{ text: "Andrés arrancó con un caballo. Prudencia inesperada.", entry_ids: ["entry-1"], player_ids: ["p1"] }],
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

    await expect(generateCommentaryWithRetry(game, request)).resolves.toHaveLength(1);
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

    await expect(generateCommentaryWithRetry(game, request)).resolves.toHaveLength(1);
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
