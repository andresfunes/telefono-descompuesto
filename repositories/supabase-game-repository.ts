import {
  GameRuleError,
  generateRoomCode,
  normalizePlayerName,
  normalizeRoomCode,
  startGame as startDomainGame,
  submitEntryAndAdvance,
  type Chain,
  type ChainEntry,
  type Game,
  type GamePhase,
  type Player,
  type PlayableEntryType,
  type SubmitEntryCommand,
} from "@/domain/game";
import {
  ConcurrentGameUpdateError,
  PlayerNameTakenError,
  RoomNotFoundError,
  UnauthorizedGameActionError,
  type GameRepository,
} from "./game-repository";

const MAX_COMMIT_ATTEMPTS = 5;

type GameChangeKind =
  | "GAME_STARTED"
  | "SUBMISSION_RECEIVED"
  | "ROUND_ADVANCED"
  | "REVEAL_STARTED";

export interface GameSnapshotGateway {
  createGameWithHost(code: string, authUserId: string, playerName: string): Promise<void>;
  createRematch(sourceCode: string, authUserId: string, newCode: string): Promise<string>;
  joinGame(code: string, authUserId: string, playerName: string): Promise<void>;
  loadGame(code: string): Promise<unknown | null>;
  commitGame(input: PersistedGameCommit): Promise<boolean>;
}

export interface PersistedGameCommit {
  game: Game;
  expectedVersion: number;
  event: GameChangeKind;
}

interface LoadedGame {
  game: Game;
  version: number;
  playerIdByAuthUserId: Map<string, string>;
}

interface RpcErrorShape {
  code?: string;
  message: string;
}

function hasMessage(error: unknown): error is RpcErrorShape {
  return Boolean(
    error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string",
  );
}

export function rpcFailure(error: unknown): Error {
  return new Error(hasMessage(error) ? error.message : "Falló la operación de Supabase.");
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Snapshot inválido: ${label}.`);
  }
  return value as Record<string, unknown>;
}

function stringField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Snapshot inválido: ${key}.`);
  return value;
}

function integerField(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Snapshot inválido: ${key}.`);
  }
  return value;
}

function nullableIntegerField(row: Record<string, unknown>, key: string): number | null {
  return row[key] === null ? null : integerField(row, key);
}

function nullableStringField(row: Record<string, unknown>, key: string): string | null {
  return row[key] === null ? null : stringField(row, key);
}

function rowsField(snapshot: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = snapshot[key];
  if (!Array.isArray(value)) throw new Error(`Snapshot inválido: ${key}.`);
  return value.map((item) => record(item, key));
}

function dateField(row: Record<string, unknown>, key: string): Date {
  const value = new Date(stringField(row, key));
  if (Number.isNaN(value.valueOf())) throw new Error(`Snapshot inválido: ${key}.`);
  return value;
}

function gamePhase(value: string): GamePhase {
  if (["LOBBY", "PLAYING", "REVEAL", "FINISHED"].includes(value)) {
    return value as GamePhase;
  }
  throw new Error("Snapshot inválido: phase.");
}

function playableEntryType(value: unknown): PlayableEntryType | null {
  if (value === null) return null;
  if (value === "text" || value === "drawing") return value;
  throw new Error("Snapshot inválido: current_entry_type.");
}

function deserializeEntry(row: Record<string, unknown>): ChainEntry {
  const base = {
    id: stringField(row, "id"),
    playerId: stringField(row, "player_id"),
    roundNumber: integerField(row, "round_number"),
    createdAt: dateField(row, "created_at"),
  };

  switch (stringField(row, "entry_type")) {
    case "text":
      return { ...base, content: { type: "text", text: stringField(row, "text_content") } };
    case "drawing":
      return {
        ...base,
        content: {
          type: "drawing",
          asset: {
            kind: "storage-path",
            mimeType: "image/png",
            value: stringField(row, "drawing_path"),
          },
        },
      };
    case "audio":
      return {
        ...base,
        content: { type: "audio", storagePath: stringField(row, "audio_path") },
      };
    case "emoji":
      return {
        ...base,
        content: { type: "emoji", emoji: stringField(row, "emoji_content") },
      };
    default:
      throw new Error("Snapshot inválido: entry_type.");
  }
}

export function deserializeGameSnapshot(value: unknown): LoadedGame {
  const snapshot = record(value, "root");
  const gameRow = record(snapshot.game, "game");
  const playerRows = rowsField(snapshot, "players");
  const chainRows = rowsField(snapshot, "chains");
  const entryRows = rowsField(snapshot, "entries");

  const players: Player[] = playerRows.map((row) => ({
    id: stringField(row, "id"),
    name: stringField(row, "name"),
    joinedAt: dateField(row, "joined_at"),
  }));
  const playerIdByAuthUserId = new Map(
    playerRows.map((row) => [stringField(row, "auth_user_id"), stringField(row, "id")]),
  );
  const entriesByChain = new Map<string, ChainEntry[]>();
  for (const row of entryRows) {
    const chainId = stringField(row, "chain_id");
    const entries = entriesByChain.get(chainId) ?? [];
    entries.push(deserializeEntry(row));
    entriesByChain.set(chainId, entries);
  }

  const chains: Chain[] = chainRows.map((row) => ({
    id: stringField(row, "id"),
    originPlayerId: stringField(row, "origin_player_id"),
    entries: (entriesByChain.get(stringField(row, "id")) ?? []).sort(
      (left, right) => left.roundNumber - right.roundNumber,
    ),
  }));
  const phase = gamePhase(stringField(gameRow, "phase"));
  const currentRoundNumber = nullableIntegerField(gameRow, "current_round");
  const currentType = playableEntryType(gameRow.current_entry_type);
  const currentRound = phase === "PLAYING" && currentRoundNumber !== null && currentType
    ? {
        number: currentRoundNumber,
        expectedEntryType: currentType,
        submissions: chains.flatMap((chain) =>
          chain.entries
            .filter((entry) => entry.roundNumber === currentRoundNumber)
            .map((entry) => ({
              playerId: entry.playerId,
              chainId: chain.id,
              entryId: entry.id,
            })),
        ),
      }
    : null;

  return {
    game: {
      id: stringField(gameRow, "id"),
      code: stringField(gameRow, "code"),
      phase,
      createdAt: dateField(gameRow, "created_at"),
      hostPlayerId: stringField(gameRow, "host_player_id"),
      players,
      chains,
      currentRound,
      rematchCode: nullableStringField(gameRow, "rematch_code"),
    },
    version: integerField(gameRow, "version"),
    playerIdByAuthUserId,
  };
}

export function serializeChains(chains: readonly Chain[]) {
  return chains.map((chain, position) => ({
    id: chain.id,
    origin_player_id: chain.originPlayerId,
    position,
  }));
}

export function serializeEntries(chains: readonly Chain[]) {
  return chains.flatMap((chain) =>
    chain.entries.map((entry, entryOrder) => {
      if (
        entry.content.type === "drawing" &&
        entry.content.asset.kind !== "storage-path"
      ) {
        throw new Error("Supabase solo persiste referencias de Storage para dibujos.");
      }
      return {
        id: entry.id,
        chain_id: chain.id,
        player_id: entry.playerId,
        round_number: entry.roundNumber,
        entry_order: entryOrder,
        entry_type: entry.content.type,
        text_content: entry.content.type === "text" ? entry.content.text : null,
        drawing_path:
          entry.content.type === "drawing" ? entry.content.asset.value : null,
        audio_path: entry.content.type === "audio" ? entry.content.storagePath : null,
        emoji_content: entry.content.type === "emoji" ? entry.content.emoji : null,
        created_at: entry.createdAt.toISOString(),
      };
    }),
  );
}

function eventForSubmission(before: Game, after: Game): GameChangeKind {
  if (after.phase === "REVEAL") return "REVEAL_STARTED";
  if (before.currentRound?.number !== after.currentRound?.number) return "ROUND_ADVANCED";
  return "SUBMISSION_RECEIVED";
}

function isCodeCollision(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505",
  );
}

function mapJoinError(error: unknown): Error {
  const message = hasMessage(error) ? error.message : "";
  if (message.includes("ROOM_NOT_FOUND")) return new RoomNotFoundError("La sala no existe.");
  if (message.includes("GAME_ALREADY_STARTED")) {
    return new GameRuleError("GAME_ALREADY_STARTED", "La partida ya comenzó.");
  }
  if (message.includes("PLAYER_NAME_TAKEN") || isCodeCollision(error)) {
    return new PlayerNameTakenError("Ese nombre ya está en uso en la sala.");
  }
  return rpcFailure(error);
}

export class SupabaseGameRepository implements GameRepository {
  constructor(private readonly gateway: GameSnapshotGateway) {}

  private async load(code: string): Promise<LoadedGame | null> {
    const snapshot = await this.gateway.loadGame(normalizeRoomCode(code));
    return snapshot ? deserializeGameSnapshot(snapshot) : null;
  }

  async createRoom(
    playerName: string,
    authUserId: string,
  ): Promise<{ game: Game; player: Player }> {
    const name = normalizePlayerName(playerName);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = generateRoomCode();
      try {
        await this.gateway.createGameWithHost(code, authUserId, name);
        const loaded = await this.load(code);
        const playerId = loaded?.playerIdByAuthUserId.get(authUserId);
        const player = loaded?.game.players.find((candidate) => candidate.id === playerId);
        if (!loaded || !player) throw new Error("No se pudo reconstruir la sala creada.");
        return { game: loaded.game, player };
      } catch (error) {
        if (isCodeCollision(error)) continue;
        throw rpcFailure(error);
      }
    }
    throw new ConcurrentGameUpdateError("No se pudo reservar un código de sala.");
  }

  async createRematch(
    sourceCode: string,
    requestedByPlayerId: string,
    authUserId: string,
  ): Promise<{ game: Game; player: Player }> {
    const normalizedSourceCode = normalizeRoomCode(sourceCode);
    const source = await this.load(normalizedSourceCode);
    if (!source) throw new RoomNotFoundError("La sala no existe.");
    if (source.playerIdByAuthUserId.get(authUserId) !== requestedByPlayerId) {
      throw new UnauthorizedGameActionError("No podés crear otra partida por otro jugador.");
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        const code = await this.gateway.createRematch(
          normalizedSourceCode,
          authUserId,
          generateRoomCode(),
        );
        const loaded = await this.load(code);
        const playerId = loaded?.playerIdByAuthUserId.get(authUserId);
        const player = loaded?.game.players.find((candidate) => candidate.id === playerId);
        if (!loaded || !player) throw new Error("No se pudo reconstruir la nueva sala.");
        return { game: loaded.game, player };
      } catch (error) {
        if (isCodeCollision(error)) continue;
        const message = hasMessage(error) ? error.message : "";
        if (message.includes("NOT_HOST")) {
          throw new GameRuleError("NOT_HOST", "Solo quien creó la sala puede crear otra partida.");
        }
        if (message.includes("GAME_NOT_FINISHED")) {
          throw new GameRuleError(
            "GAME_NOT_FINISHED",
            "La nueva partida se puede crear cuando termina la actual.",
          );
        }
        throw rpcFailure(error);
      }
    }
    throw new ConcurrentGameUpdateError("No se pudo reservar un código para la nueva sala.");
  }

  async getRoom(code: string): Promise<Game | null> {
    return (await this.load(code))?.game ?? null;
  }

  async getPlayerForUser(code: string, authUserId: string): Promise<Player | null> {
    const loaded = await this.load(code);
    const playerId = loaded?.playerIdByAuthUserId.get(authUserId);
    return loaded?.game.players.find((player) => player.id === playerId) ?? null;
  }

  async joinRoom(
    code: string,
    playerName: string,
    authUserId: string,
  ): Promise<{ game: Game; player: Player }> {
    const normalizedCode = normalizeRoomCode(code);
    try {
      await this.gateway.joinGame(normalizedCode, authUserId, normalizePlayerName(playerName));
    } catch (error) {
      throw mapJoinError(error);
    }

    const loaded = await this.load(normalizedCode);
    const playerId = loaded?.playerIdByAuthUserId.get(authUserId);
    const player = loaded?.game.players.find((candidate) => candidate.id === playerId);
    if (!loaded || !player) throw new Error("No se pudo reconstruir la membresía.");
    return { game: loaded.game, player };
  }

  private async authoritativeMutation(
    code: string,
    requestedByPlayerId: string,
    authUserId: string,
    mutate: (game: Game) => Game,
    event: (before: Game, after: Game) => GameChangeKind,
  ): Promise<Game> {
    for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt += 1) {
      const loaded = await this.load(code);
      if (!loaded) throw new RoomNotFoundError("La sala no existe.");
      if (loaded.playerIdByAuthUserId.get(authUserId) !== requestedByPlayerId) {
        throw new UnauthorizedGameActionError("No podés modificar a otro jugador.");
      }

      const updated = mutate(loaded.game);
      const committed = await this.gateway.commitGame({
        game: updated,
        expectedVersion: loaded.version,
        event: event(loaded.game, updated),
      });
      if (committed) return updated;
    }
    throw new ConcurrentGameUpdateError("La partida cambió varias veces. Intentá de nuevo.");
  }

  async startGame(
    code: string,
    requestedByPlayerId: string,
    authUserId: string,
  ): Promise<Game> {
    return this.authoritativeMutation(
      normalizeRoomCode(code),
      requestedByPlayerId,
      authUserId,
      (game) => startDomainGame(game, requestedByPlayerId),
      () => "GAME_STARTED",
    );
  }

  async submitEntry(
    code: string,
    command: SubmitEntryCommand,
    authUserId: string,
  ): Promise<Game> {
    return this.authoritativeMutation(
      normalizeRoomCode(code),
      command.playerId,
      authUserId,
      (game) => submitEntryAndAdvance(game, command),
      eventForSubmission,
    );
  }
}
