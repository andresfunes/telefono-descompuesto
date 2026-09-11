import type { Game, Player, SubmitEntryCommand } from "@/domain/game";

export interface GameRepository {
  createRoom(
    playerName: string,
    authUserId: string,
  ): Promise<{ game: Game; player: Player }>;
  createRematch(
    sourceCode: string,
    requestedByPlayerId: string,
    authUserId: string,
  ): Promise<{ game: Game; player: Player }>;
  getRoom(code: string): Promise<Game | null>;
  getPlayerForUser(code: string, authUserId: string): Promise<Player | null>;
  joinRoom(
    code: string,
    playerName: string,
    authUserId: string,
  ): Promise<{ game: Game; player: Player }>;
  startGame(
    code: string,
    requestedByPlayerId: string,
    authUserId: string,
  ): Promise<Game>;
  submitEntry(
    code: string,
    command: SubmitEntryCommand,
    authUserId: string,
  ): Promise<Game>;
}

export class RoomNotFoundError extends Error {
  override readonly name = "RoomNotFoundError";
}

export class PlayerNameTakenError extends Error {
  override readonly name = "PlayerNameTakenError";
}

export class UnauthorizedGameActionError extends Error {
  override readonly name = "UnauthorizedGameActionError";
}

export class ConcurrentGameUpdateError extends Error {
  override readonly name = "ConcurrentGameUpdateError";
}
