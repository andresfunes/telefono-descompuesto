import "server-only";

import OpenAI from "openai";
import {
  buildCommentaryInput,
  eligibleGameAwardCategories,
  GAME_COMMENTARY_INSTRUCTIONS,
  validateCommentaryResponse,
  type GameCommentaryItem,
  type HumorIntensity,
} from "@/domain/game-commentary";
import type { Game } from "@/domain/game";

const DEFAULT_COMMENTARY_MODEL = "gpt-5-mini";
const COMMENTARY_TOKEN_BUDGETS = [1_800, 6_000] as const;

interface CommentaryResponse {
  status?: string;
  output_text: string;
  incomplete_details: { reason?: string } | null;
}

export function buildCommentarySchema(game: Game) {
  const entryIds = game.chains.flatMap((chain) => chain.entries.map((entry) => entry.id));
  const awardCategories = eligibleGameAwardCategories(game);

  const commentSchemas = game.chains.map((chain) => ({
    type: "object",
    additionalProperties: false,
    properties: {
      text: {
        type: "string",
        minLength: 1,
        maxLength: 320,
        description:
          "Comentario factual sobre esta cadena. Toda acción atribuida a un jugador debe corresponder a un entry_id de ese autor y a su role; comparar cada dibujo sólo con su receivedEntryId.",
      },
      chain_id: { type: "string", const: chain.id },
      entry_ids: {
        type: "array",
        minItems: 1,
        items: {
          type: "string",
          enum: chain.entries.map((entry) => entry.id),
        },
      },
    },
    required: ["text", "chain_id", "entry_ids"],
  }));

  const awardSchemas = awardCategories.map((category) => {
    const winnerEntryIds = game.chains.flatMap((chain) =>
      chain.entries
        .filter((entry) => {
          if (category === "BEST_DRAWING") return entry.content.type === "drawing";
          if (category === "MOST_ORIGINAL_PHRASE") {
            return entry.content.type === "text" && entry.roundNumber === 0;
          }
          if (category === "BEST_INTERPRETATION") {
            return entry.content.type === "text" && entry.roundNumber > 0;
          }
          return true;
        })
        .map((entry) => entry.id),
    );

    return {
      type: "object",
      additionalProperties: false,
      properties: {
        category: { type: "string", const: category },
        reason: {
          type: "string",
          minLength: 1,
          maxLength: 240,
          description:
            `Motivo basado en winner_entry_id para ${category}. No incluir nombres de jugadores; la aplicación agrega el ganador autoritativamente.`,
        },
        winner_entry_id: { type: "string", enum: winnerEntryIds },
        entry_ids: {
          type: "array",
          minItems: 1,
          items: { type: "string", enum: entryIds },
        },
      },
      required: ["category", "reason", "winner_entry_id", "entry_ids"],
    };
  });

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      comments: {
        type: "array",
        minItems: game.chains.length,
        maxItems: game.chains.length,
        items: { anyOf: commentSchemas },
      },
      awards: {
        type: "array",
        minItems: awardCategories.includes("BEST_INTERPRETATION") ? 4 : 3,
        maxItems: awardCategories.length,
        items: { anyOf: awardSchemas },
      },
    },
    required: ["comments", "awards"],
  } as const;
}

export class CommentaryConfigurationError extends Error {
  override readonly name = "CommentaryConfigurationError";
}

export class CommentaryResponseError extends Error {
  override readonly name = "CommentaryResponseError";

  constructor(
    message: string,
    readonly retryable: boolean,
    readonly diagnosticCode: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function parseCommentaryResponse(
  response: CommentaryResponse,
  game: Game,
): GameCommentaryItem[] {
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason ?? "desconocido";
    throw new CommentaryResponseError(
      `OpenAI devolvió una respuesta incompleta (${reason}).`,
      reason === "max_output_tokens",
      `incomplete:${reason}`,
    );
  }

  if (response.status && response.status !== "completed") {
    throw new CommentaryResponseError(
      `OpenAI no completó la respuesta (${response.status}).`,
      false,
      `status:${response.status}`,
    );
  }

  if (!response.output_text) {
    throw new CommentaryResponseError(
      "OpenAI no devolvió comentarios.",
      false,
      "empty_output",
    );
  }

  try {
    return validateCommentaryResponse(JSON.parse(response.output_text) as unknown, game);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CommentaryResponseError(
        "OpenAI devolvió JSON incompleto o inválido.",
        true,
        "invalid_json",
        { cause: error },
      );
    }
    throw new CommentaryResponseError(
      "OpenAI devolvió comentarios o premios inválidos.",
      true,
      error instanceof Error ? `invalid_payload:${error.message}` : "invalid_payload",
      { cause: error },
    );
  }
}

export async function generateCommentaryWithRetry(
  game: Game,
  request: (maxOutputTokens: number) => Promise<CommentaryResponse>,
): Promise<GameCommentaryItem[]> {
  for (const [attempt, maxOutputTokens] of COMMENTARY_TOKEN_BUDGETS.entries()) {
    try {
      return parseCommentaryResponse(await request(maxOutputTokens), game);
    } catch (error) {
      const hasAnotherAttempt = attempt < COMMENTARY_TOKEN_BUDGETS.length - 1;
      if (!(error instanceof CommentaryResponseError) || !error.retryable || !hasAnotherAttempt) {
        throw error;
      }
    }
  }

  throw new Error("No se pudieron generar los comentarios.");
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

  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 45_000 });
  const model = process.env.OPENAI_COMMENTARY_MODEL ?? DEFAULT_COMMENTARY_MODEL;
  const input = [{ role: "user" as const, content: buildCommentaryInput(game, drawingUrls, intensity) }];

  return generateCommentaryWithRetry(game, async (maxOutputTokens) => {
    const response = await client.responses.create({
      model,
      instructions: GAME_COMMENTARY_INSTRUCTIONS,
      input,
      max_output_tokens: maxOutputTokens,
      reasoning: model.startsWith("gpt-5-mini")
        ? { effort: "minimal" }
        : model.startsWith("gpt-5.6-")
          ? { effort: "none" }
          : undefined,
      store: false,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "game_commentary",
          strict: true,
          schema: buildCommentarySchema(game),
        },
      },
    });

    return response;
  });
}
