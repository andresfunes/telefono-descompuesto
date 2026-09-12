"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  GameRuleError,
  isValidRoomCode,
  normalizeRoomCode,
  submitEntry as validateDomainSubmission,
  validatePlayerName,
  type DrawingAsset,
} from "@/domain/game";
import { parseHumorIntensity } from "@/domain/game-commentary";
import { generateGameCommentary } from "@/lib/ai/game-commentary";
import { trustedClientIp, hashClientIp } from "@/lib/ai/client-ip";
import { getCommentaryProtectionConfig } from "@/lib/ai/commentary-protection-config";
import {
  COMMENTARY_UNAVAILABLE_MESSAGE,
  generateProtectedGameCommentary,
} from "@/lib/ai/protected-game-commentary";
import { logAiGeneration } from "@/lib/ai/generation-log";
import { verifyTurnstileToken } from "@/lib/ai/turnstile";
import { resolveRevealDrawingAnalysisInputs } from "@/lib/game-view";
import { decodePngDataUrl } from "@/lib/png-data-url";
import {
  ensureAnonymousUserId,
  getAuthenticatedUserId,
} from "@/lib/supabase/auth";
import {
  drawingAssetStore,
  gameCommentaryStore,
  gameRepository,
} from "@/repositories";
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
  analytics?: "generated" | "unavailable";
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

export async function createRematch(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = normalizeRoomCode(String(formData.get("roomCode") ?? ""));
  if (!isValidRoomCode(code)) return { error: "El código de sala no es válido." };

  const authUserId = await getAuthenticatedUserId();
  if (!authUserId) return { error: "Tu sesión venció. Volvé a entrar a la sala." };
  const player = await gameRepository.getPlayerForUser(code, authUserId);
  if (!player) return { error: "No pertenecés a esta sala." };

  let rematchCode: string;
  try {
    const { game } = await gameRepository.createRematch(code, player.id, authUserId);
    rematchCode = game.code;
  } catch (error) {
    const message = expectedErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }

  revalidatePath(`/${code}`);
  redirect(`/${rematchCode}`);
}

export async function joinRematch(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const sourceCode = normalizeRoomCode(String(formData.get("roomCode") ?? ""));
  if (!isValidRoomCode(sourceCode)) return { error: "El código de sala no es válido." };

  const authUserId = await getAuthenticatedUserId();
  if (!authUserId) return { error: "Tu sesión venció. Volvé a entrar a la sala." };
  const [sourceGame, sourcePlayer] = await Promise.all([
    gameRepository.getRoom(sourceCode),
    gameRepository.getPlayerForUser(sourceCode, authUserId),
  ]);
  if (!sourceGame) return { error: "La sala no existe." };
  if (!sourcePlayer) return { error: "No pertenecés a esta sala." };
  if (!sourceGame.rematchCode) return { error: "Todavía no se creó una nueva partida." };

  try {
    await gameRepository.joinRoom(
      sourceGame.rematchCode,
      sourcePlayer.name,
      authUserId,
    );
  } catch (error) {
    const message = expectedErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }

  redirect(`/${sourceGame.rematchCode}`);
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
  return {};
}

export async function generateCommentary(
  _previousState: CommentaryFormState,
  formData: FormData,
): Promise<CommentaryFormState> {
  const code = normalizeRoomCode(String(formData.get("roomCode") ?? ""));
  if (!isValidRoomCode(code)) return { error: "El código de sala no es válido." };

  const authUserId = await getAuthenticatedUserId();
  if (!authUserId) return { error: "Tu sesión venció. Volvé a entrar a la sala." };
  const roomSession = await gameRepository.getRoomSession(code, authUserId);
  if (!roomSession) return { error: "La sala no existe." };
  const { game, player } = roomSession;
  if (!player) return { error: "No pertenecés a esta sala." };

  try {
    const config = getCommentaryProtectionConfig();
    const requestHeaders = await headers();
    const remoteIp = trustedClientIp(requestHeaders);
    const intensity = parseHumorIntensity(formData.get("intensity"));
    const result = await generateProtectedGameCommentary(
      {
        game,
        playerId: player.id,
        authUserId,
        ipHash: hashClientIp(remoteIp),
        remoteIp,
        turnstileToken: String(formData.get("turnstileToken") ?? ""),
        intensity,
        config,
      },
      {
        store: gameCommentaryStore,
        verifyTurnstile: (token, ip) =>
          verifyTurnstileToken({
            token,
            remoteIp: ip,
            secretKey: config.turnstileSecretKey ?? "",
          }),
        generate: async (persistedGame, selectedIntensity) => {
          const drawingUrls =
            await resolveRevealDrawingAnalysisInputs(persistedGame);
          return generateGameCommentary(
            persistedGame,
            drawingUrls,
            selectedIntensity,
          );
        },
      },
    );

    if (result.status === "unavailable") {
      return { error: COMMENTARY_UNAVAILABLE_MESSAGE, analytics: "unavailable" };
    }
    revalidatePath(`/${code}`);
    return {
      comments: result.commentary.comments,
      analytics: result.status === "generated" ? "generated" : undefined,
    };
  } catch (error) {
    logAiGeneration("ai_generation_protection_failed", {
      gameId: game.id,
      chainIds: game.chains.map(({ id }) => id),
      reason: error instanceof Error ? error.name : "unknown",
    });
    return { error: COMMENTARY_UNAVAILABLE_MESSAGE, analytics: "unavailable" };
  }
}
