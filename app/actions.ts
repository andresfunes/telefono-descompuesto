"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  GameRuleError,
  isValidRoomCode,
  normalizeRoomCode,
  validatePlayerName,
} from "@/domain/game";
import { gameRepository } from "@/repositories";
import { PlayerNameTakenError, RoomNotFoundError } from "@/repositories/game-repository";

export interface FormState {
  error?: string;
}

async function rememberPlayer(code: string, playerId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(`room-${code}`, playerId, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
    path: "/",
  });
}

async function currentPlayerId(code: string): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(`room-${code}`)?.value ?? null;
}

function expectedErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { name?: unknown; message?: unknown };
  const expectedNames = new Set([
    GameRuleError.name,
    RoomNotFoundError.name,
    PlayerNameTakenError.name,
  ]);
  if (typeof candidate.name === "string" &&
      typeof candidate.message === "string" &&
      expectedNames.has(candidate.name)) return candidate.message;
  return null;
}

export async function createGame(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const playerName = String(formData.get("playerName") ?? "");
  const nameError = validatePlayerName(playerName);
  if (nameError) return { error: nameError };

  const room = await gameRepository.createRoom();
  const { player } = await gameRepository.joinRoom(room.code, playerName);
  await rememberPlayer(room.code, player.id);
  redirect(`/${room.code}`);
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
    const { player } = await gameRepository.joinRoom(code, playerName);
    await rememberPlayer(code, player.id);
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
  const playerId = await currentPlayerId(code);
  if (!isValidRoomCode(code)) return { error: "El código de sala no es válido." };
  if (!playerId) return { error: "No pertenecés a esta sala." };

  try {
    await gameRepository.startGame(code, playerId);
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
  const playerId = await currentPlayerId(code);

  if (!isValidRoomCode(code)) return { error: "El código de sala no es válido." };
  if (!playerId) return { error: "No pertenecés a esta sala." };
  if (!Number.isInteger(roundNumber) || roundNumber < 0) {
    return { error: "La ronda no es válida. Actualizá la página." };
  }
  if (entryType !== "text" && entryType !== "drawing") {
    return { error: "El tipo de respuesta no es válido." };
  }

  const content =
    entryType === "text"
      ? ({ type: "text", text: value } as const)
      : ({ type: "drawing", data: value, format: "placeholder" } as const);

  try {
    await gameRepository.submitEntry(code, {
      playerId,
      roundNumber,
      content,
    });
  } catch (error) {
    const message = expectedErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }

  revalidatePath(`/${code}`);
  redirect(`/${code}`);
}
