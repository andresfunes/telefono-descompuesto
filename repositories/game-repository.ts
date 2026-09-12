import type { Game, Player, SubmitEntryCommand } from "@/domain/game";

export interface RoomSession {
  game: Game;
  player: Player | null;
}

export interface JoinProtectionContext {
  ipHash: string;
  challengeVerified: boolean;
}

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
  getRoomSession(code: string, authUserId: string | null): Promise<RoomSession | null>;
  getRoom(code: string): Promise<Game | null>;
  getPlayerForUser(code: string, authUserId: string): Promise<Player | null>;
  joinRoom(
    code: string,
    playerName: string,
    authUserId: string,
    protection?: JoinProtectionContext,
  ): Promise<{ game: Game; player: Player }>;
  setLobbyLocked(
    code: string,
    requestedByPlayerId: string,
    authUserId: string,
    locked: boolean,
  ): Promise<Game>;
  removePlayer(
    code: string,
    requestedByPlayerId: string,
    authUserId: string,
    playerId: string,
  ): Promise<Game>;
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

export class JoinChallengeRequiredError extends Error {
  override readonly name = "JoinChallengeRequiredError";
}

export class JoinRateLimitedError extends Error {
  override readonly name = "JoinRateLimitedError";
}
