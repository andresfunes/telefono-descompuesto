import {
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
  type GameRepository,
} from "./game-repository";

export class InMemoryGameRepository implements GameRepository {
  private readonly rooms = new Map<string, Game>();

  async createRoom(): Promise<Game> {
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const game = createLobbyGame(code);
    this.rooms.set(code, game);
    return structuredClone(game);
  }

  async getRoom(code: string): Promise<Game | null> {
    const game = this.rooms.get(normalizeRoomCode(code));
    return game ? structuredClone(game) : null;
  }

  async joinRoom(code: string, playerName: string): Promise<{ game: Game; player: Player }> {
    const normalizedCode = normalizeRoomCode(code);
    const game = this.rooms.get(normalizedCode);
    if (!game) throw new RoomNotFoundError("La sala no existe.");
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
    game.hostPlayerId ??= player.id;
    return { game: structuredClone(game), player: structuredClone(player) };
  }

  async startGame(code: string, requestedByPlayerId: string): Promise<Game> {
    const normalizedCode = normalizeRoomCode(code);
    const game = this.rooms.get(normalizedCode);
    if (!game) throw new RoomNotFoundError("La sala no existe.");

    const startedGame = startDomainGame(game, requestedByPlayerId);
    this.rooms.set(normalizedCode, startedGame);
    return structuredClone(startedGame);
  }

  async submitEntry(code: string, command: SubmitEntryCommand): Promise<Game> {
    const normalizedCode = normalizeRoomCode(code);
    const game = this.rooms.get(normalizedCode);
    if (!game) throw new RoomNotFoundError("La sala no existe.");

    const updatedGame = submitEntryAndAdvance(game, command);
    this.rooms.set(normalizedCode, updatedGame);
    return structuredClone(updatedGame);
  }
}
