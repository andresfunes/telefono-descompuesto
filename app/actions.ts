"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  GameRuleError,
  isValidRoomCode,
  normalizeRoomCode,
  submitEntry as validateDomainSubmission,
  validatePlayerName,
  type DrawingAsset,
} from "@/domain/game";
import {
  canGenerateGameCommentary,
  parseHumorIntensity,
  type GameCommentaryItem,
} from "@/domain/game-commentary";
import {
  CommentaryConfigurationError,
  generateGameCommentary,
} from "@/lib/ai/game-commentary";
import { resolveRevealDrawingAnalysisInputs } from "@/lib/game-view";
import { decodePngDataUrl } from "@/lib/png-data-url";
import {
  ensureAnonymousUserId,
  getAuthenticatedUserId,
} from "@/lib/supabase/auth";
import { drawingAssetStore, gameRepository } from "@/repositories";
import {
  ConcurrentGameUpdateError,
  PlayerNameTakenError,
  RoomNotFoundError,
  UnauthorizedGameActionError,
} from "@/repositories/game-repository";

export interface FormState {
  error?: string;
}

export interface CommentaryFormState {
  error?: string;
  comments?: string[];
}

function expectedErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { name?: unknown; message?: unknown };
  const expectedNames = new Set([
    GameRuleError.name,
    RoomNotFoundError.name,
    PlayerNameTakenError.name,
    UnauthorizedGameActionError.name,
    ConcurrentGameUpdateError.name,
  ]);
  if (
    typeof candidate.name === "string" &&
    typeof candidate.message === "string" &&
    expectedNames.has(candidate.name)
  ) {
    return candidate.message;
  }
  return null;
}

export async function createGame(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const playerName = String(formData.get("playerName") ?? "");
  const nameError = validatePlayerName(playerName);
  if (nameError) return { error: nameError };

  const authUserId = await ensureAnonymousUserId();
  const { game } = await gameRepository.createRoom(playerName, authUserId);
  redirect(`/${game.code}`);
}

export async function joinGame(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = normalizeRoomCode(String(formData.get("roomCode") ?? ""));
  const playerName = String(formData.get("playerName") ?? "");
  if (!isValidRoomCode(code)) return { error: "Ingresá un código de sala válido." };

  const nameError = validatePlayerName(playerName);
  if (nameError) return { error: nameError };

  try {
    const authUserId = await ensureAnonymousUserId();
    await gameRepository.joinRoom(code, playerName, authUserId);
  } catch (error) {
    const message = expectedErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }

  redirect(`/${code}`);
}

export async function startRoomGame(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = normalizeRoomCode(String(formData.get("roomCode") ?? ""));
  if (!isValidRoomCode(code)) return { error: "El código de sala no es válido." };

  const authUserId = await getAuthenticatedUserId();
  if (!authUserId) return { error: "Tu sesión venció. Volvé a entrar a la sala." };
  const player = await gameRepository.getPlayerForUser(code, authUserId);
  if (!player) return { error: "No pertenecés a esta sala." };

  try {
    await gameRepository.startGame(code, player.id, authUserId);
  } catch (error) {
    const message = expectedErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }

  revalidatePath(`/${code}`);
  redirect(`/${code}`);
}

export async function submitTurn(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = normalizeRoomCode(String(formData.get("roomCode") ?? ""));
  const roundNumber = Number(formData.get("roundNumber"));
  const entryType = String(formData.get("entryType") ?? "");
  const value = String(formData.get("value") ?? "");

  if (!isValidRoomCode(code)) return { error: "El código de sala no es válido." };
  if (!Number.isInteger(roundNumber) || roundNumber < 0) {
    return { error: "La ronda no es válida. Esperá la actualización de la sala." };
  }
  if (entryType !== "text" && entryType !== "drawing") {
    return { error: "El tipo de respuesta no es válido." };
  }

  const authUserId = await getAuthenticatedUserId();
  if (!authUserId) return { error: "Tu sesión venció. Volvé a entrar a la sala." };
  const game = await gameRepository.getRoom(code);
  if (!game) return { error: "La sala no existe." };
  const player = await gameRepository.getPlayerForUser(code, authUserId);
  if (!player) return { error: "No pertenecés a esta sala." };

  let storedDrawing: DrawingAsset | undefined;
  try {
    const content =
      entryType === "text"
        ? ({ type: "text", text: value } as const)
        : ({
            type: "drawing",
            asset: {
              kind: "inline-data-url",
              value,
              mimeType: "image/png",
            },
          } as const);

    if (entryType === "drawing") {
      validateDomainSubmission(game, {
        playerId: player.id,
        roundNumber,
        content,
      });
      const png = decodePngDataUrl(value);
      storedDrawing = await drawingAssetStore.storeDrawing({
        gameId: game.id,
        playerId: player.id,
        roundNumber,
        png,
      });
    }

    await gameRepository.submitEntry(
      code,
      {
        playerId: player.id,
        roundNumber,
        content:
          entryType === "drawing" && storedDrawing
            ? { type: "drawing", asset: storedDrawing }
            : content,
      },
      authUserId,
    );
  } catch (error) {
    if (storedDrawing) await drawingAssetStore.removeDrawing(storedDrawing);
    const message = expectedErrorMessage(error);
    if (message) return { error: message };
    if (error instanceof Error && error.message.startsWith("El dibujo")) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/${code}`);
  redirect(`/${code}`);
}

export async function generateCommentary(
  _previousState: CommentaryFormState,
  formData: FormData,
): Promise<CommentaryFormState> {
  const code = normalizeRoomCode(String(formData.get("roomCode") ?? ""));
  if (!isValidRoomCode(code)) return { error: "El código de sala no es válido." };

  const authUserId = await getAuthenticatedUserId();
  if (!authUserId) return { error: "Tu sesión venció. Volvé a entrar a la sala." };
  const game = await gameRepository.getRoom(code);
  if (!game) return { error: "La sala no existe." };
  const player = await gameRepository.getPlayerForUser(code, authUserId);
  if (!player) return { error: "No pertenecés a esta sala." };
  if (!canGenerateGameCommentary(game, player.id)) {
    return { error: "Solo quien creó la partida puede generar los comentarios." };
  }
  if (game.phase !== "REVEAL" && game.phase !== "FINISHED") {
    return { error: "Los comentarios se habilitan cuando termina la partida." };
  }

  try {
    const drawingUrls = await resolveRevealDrawingAnalysisInputs(game);
    const comments: GameCommentaryItem[] = await generateGameCommentary(
      game,
      drawingUrls,
      parseHumorIntensity(formData.get("intensity")),
    );
    return { comments: comments.map((comment) => comment.text) };
  } catch (error) {
    if (error instanceof CommentaryConfigurationError) return { error: error.message };
    console.error("No se pudieron generar los comentarios de la partida", error);
    return { error: "No pudimos generar los comentarios. Probá de nuevo en un momento." };
  }
}
