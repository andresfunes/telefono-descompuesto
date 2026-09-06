import type { Game, Player, SubmitEntryCommand } from "@/domain/game";

export interface GameRepository {
  createRoom(): Promise<Game>;
  getRoom(code: string): Promise<Game | null>;
  joinRoom(code: string, playerName: string): Promise<{ game: Game; player: Player }>;
  startGame(code: string, requestedByPlayerId: string): Promise<Game>;
  submitEntry(code: string, command: SubmitEntryCommand): Promise<Game>;
}

export class RoomNotFoundError extends Error {
  override readonly name = "RoomNotFoundError";
}

export class PlayerNameTakenError extends Error {
  override readonly name = "PlayerNameTakenError";
}
