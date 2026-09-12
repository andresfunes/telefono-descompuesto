import type { PlayableEntryType } from "@/domain/game";

const TURN_DRAFT_PREFIX = "telefono-descompuesto:turn-draft";

export function turnDraftStorageKey({
  roomCode,
  playerId,
  roundNumber,
  entryType,
}: {
  roomCode: string;
  playerId: string;
  roundNumber: number;
  entryType: PlayableEntryType;
}): string {
  return [TURN_DRAFT_PREFIX, roomCode, playerId, roundNumber, entryType].join(":");
}

export function readTurnDraft(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

export function writeTurnDraft(storageKey: string, value: string): void {
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    // Drawing must remain usable when storage is unavailable or full.
  }
}

export function removeTurnDraft(storageKey: string): void {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // There is nothing else to clean up when storage is unavailable.
  }
}
