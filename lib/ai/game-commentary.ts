import "server-only";

import OpenAI from "openai";
import {
  buildCommentaryInput,
  GAME_COMMENTARY_INSTRUCTIONS,
  validateCommentaryItems,
  type GameCommentaryItem,
  type HumorIntensity,
} from "@/domain/game-commentary";
import type { Game } from "@/domain/game";

const DEFAULT_COMMENTARY_MODEL = "gpt-5-mini";

const commentarySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    comments: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string", minLength: 1, maxLength: 320 },
          entry_ids: { type: "array", minItems: 1, items: { type: "string" } },
          player_ids: { type: "array", minItems: 1, items: { type: "string" } },
        },
        required: ["text", "entry_ids", "player_ids"],
      },
    },
  },
  required: ["comments"],
} as const;

export class CommentaryConfigurationError extends Error {
  override readonly name = "CommentaryConfigurationError";
}

export async function generateGameCommentary(
  game: Game,
  drawingUrls: Readonly<Record<string, string>>,
  intensity: HumorIntensity,
): Promise<GameCommentaryItem[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new CommentaryConfigurationError(
      "Falta OPENAI_API_KEY en el entorno del servidor.",
    );
  }

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: process.env.OPENAI_COMMENTARY_MODEL ?? DEFAULT_COMMENTARY_MODEL,
    instructions: GAME_COMMENTARY_INSTRUCTIONS,
    input: [{ role: "user", content: buildCommentaryInput(game, drawingUrls, intensity) }],
    max_output_tokens: 900,
    store: false,
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "game_commentary",
        strict: true,
        schema: commentarySchema,
      },
    },
  });

  if (!response.output_text) throw new Error("OpenAI no devolvió comentarios.");
  return validateCommentaryItems(JSON.parse(response.output_text) as unknown, game);
}
