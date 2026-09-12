import {
  addRematch,
  createLobbyGame,
  GameRuleError,
  generateRoomCode,
  normalizePlayerName,
  normalizeRoomCode,
  startGame as startDomainGame,
  submitEntryAndAdvance,
} from "@/domain/game";
import type { Game, Player, SubmitEntryCommand } from "@/domain/game";
import {
  PlayerNameTakenError,
  RoomNotFoundError,
  UnauthorizedGameActionError,
  type GameRepository,
  type RoomSession,
} from "./game-repository";

export class InMemoryGameRepository implements GameRepository {
  private readonly rooms = new Map<string, Game>();
  private readonly memberships = new Map<string, Map<string, string>>();

  async createRoom(
    playerName: string,
    authUserId: string,
  ): Promise<{ game: Game; player: Player }> {
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const game = createLobbyGame(code);
    const player: Player = {
      id: crypto.randomUUID(),
      name: normalizePlayerName(playerName),
      joinedAt: new Date(),
    };
    game.players.push(player);
    game.hostPlayerId = player.id;
    this.rooms.set(code, game);
    this.memberships.set(code, new Map([[authUserId, player.id]]));
    return structuredClone({ game, player });
  }

  async createRematch(
    sourceCode: string,
    requestedByPlayerId: string,
    authUserId: string,
  ): Promise<{ game: Game; player: Player }> {
    const normalizedCode = normalizeRoomCode(sourceCode);
    const sourceGame = this.rooms.get(normalizedCode);
    if (!sourceGame) throw new RoomNotFoundError("La sala no existe.");
    if (this.memberships.get(normalizedCode)?.get(authUserId) !== requestedByPlayerId) {
      throw new UnauthorizedGameActionError("No podés crear otra partida por otro jugador.");
    }
    if (sourceGame.hostPlayerId !== requestedByPlayerId) {
      throw new GameRuleError("NOT_HOST", "Solo quien creó la sala puede crear otra partida.");
    }
    if (sourceGame.phase !== "REVEAL" && sourceGame.phase !== "FINISHED") {
      throw new GameRuleError(
        "GAME_NOT_FINISHED",
        "La nueva partida se puede crear cuando termina la actual.",
      );
    }

    if (sourceGame.rematchCode) {
      const game = this.rooms.get(sourceGame.rematchCode);
      const player = await this.getPlayerForUser(sourceGame.rematchCode, authUserId);
      if (!game || !player) throw new RoomNotFoundError("La nueva sala no existe.");
      return structuredClone({ game, player });
    }

    const host = sourceGame.players.find((player) => player.id === requestedByPlayerId);
    if (!host) throw new GameRuleError("PLAYER_NOT_FOUND", "El jugador no pertenece a la sala.");

    const created = await this.createRoom(host.name, authUserId);
    this.rooms.set(
      normalizedCode,
      addRematch(sourceGame, requestedByPlayerId, created.game.code),
    );
    return created;
  }

  async getRoom(code: string): Promise<Game | null> {
    const game = this.rooms.get(normalizeRoomCode(code));
    return game ? structuredClone(game) : null;
  }

  async getRoomSession(
    code: string,
    authUserId: string | null,
  ): Promise<RoomSession | null> {
    const normalizedCode = normalizeRoomCode(code);
    const game = this.rooms.get(normalizedCode);
    if (!game) return null;

    const playerId = authUserId
      ? this.memberships.get(normalizedCode)?.get(authUserId)
      : undefined;
    const player = game.players.find((candidate) => candidate.id === playerId) ?? null;
    return structuredClone({ game, player });
  }

  async getPlayerForUser(code: string, authUserId: string): Promise<Player | null> {
    const normalizedCode = normalizeRoomCode(code);
    const game = this.rooms.get(normalizedCode);
    const playerId = this.memberships.get(normalizedCode)?.get(authUserId);
    const player = game?.players.find((candidate) => candidate.id === playerId);
    return player ? structuredClone(player) : null;
  }

  async joinRoom(
    code: string,
    playerName: string,
    authUserId: string,
  ): Promise<{ game: Game; player: Player }> {
    const normalizedCode = normalizeRoomCode(code);
    const game = this.rooms.get(normalizedCode);
    if (!game) throw new RoomNotFoundError("La sala no existe.");

    const existingPlayerId = this.memberships.get(normalizedCode)?.get(authUserId);
    const existingPlayer = game.players.find((player) => player.id === existingPlayerId);
    if (existingPlayer) return structuredClone({ game, player: existingPlayer });

    if (game.phase !== "LOBBY") {
      throw new GameRuleError("GAME_ALREADY_STARTED", "La partida ya comenzó.");
    }

    const name = normalizePlayerName(playerName);
    const isTaken = game.players.some(
      (player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (isTaken) throw new PlayerNameTakenError("Ese nombre ya está en uso en la sala.");

    const player: Player = { id: crypto.randomUUID(), name, joinedAt: new Date() };
    game.players.push(player);
    const memberships = this.memberships.get(normalizedCode) ?? new Map<string, string>();
    memberships.set(authUserId, player.id);
    this.memberships.set(normalizedCode, memberships);
    return { game: structuredClone(game), player: structuredClone(player) };
  }

  async startGame(
    code: string,
    requestedByPlayerId: string,
    authUserId: string,
  ): Promise<Game> {
    const normalizedCode = normalizeRoomCode(code);
    const game = this.rooms.get(normalizedCode);
    if (!game) throw new RoomNotFoundError("La sala no existe.");
    if (this.memberships.get(normalizedCode)?.get(authUserId) !== requestedByPlayerId) {
      throw new UnauthorizedGameActionError("No podés modificar a otro jugador.");
    }

    const startedGame = startDomainGame(game, requestedByPlayerId);
    this.rooms.set(normalizedCode, startedGame);
    return structuredClone(startedGame);
  }

  async submitEntry(
    code: string,
    command: SubmitEntryCommand,
    authUserId: string,
  ): Promise<Game> {
    const normalizedCode = normalizeRoomCode(code);
    const game = this.rooms.get(normalizedCode);
    if (!game) throw new RoomNotFoundError("La sala no existe.");
    if (this.memberships.get(normalizedCode)?.get(authUserId) !== command.playerId) {
      throw new UnauthorizedGameActionError("No podés enviar por otro jugador.");
    }

    const updatedGame = submitEntryAndAdvance(game, command);
    this.rooms.set(normalizedCode, updatedGame);
    return structuredClone(updatedGame);
  }
}
