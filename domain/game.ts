export const ROOM_CODE_LENGTH = 4;
export const MINIMUM_PLAYER_COUNT = 2;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type GamePhase = "LOBBY" | "PLAYING" | "REVEAL" | "FINISHED";
export type PlayableEntryType = "text" | "drawing";

export interface Player {
  id: string;
  name: string;
  joinedAt: Date;
}

interface EntryBase {
  id: string;
  playerId: string;
  roundNumber: number;
  createdAt: Date;
}

export interface TextEntry extends EntryBase {
  content: { type: "text"; text: string };
}

export interface DrawingEntry extends EntryBase {
  content: {
    type: "drawing";
    asset: DrawingAsset;
  };
}

export type DrawingAsset =
  | { kind: "inline-data-url"; value: string; mimeType: "image/png" }
  | { kind: "remote-url"; value: string; mimeType: "image/png" }
  | { kind: "storage-path"; value: string; mimeType: "image/png" };

export interface AudioEntry extends EntryBase {
  content: { type: "audio"; storagePath: string };
}

export interface EmojiEntry extends EntryBase {
  content: { type: "emoji"; emoji: string };
}

export type ChainEntry = TextEntry | DrawingEntry | AudioEntry | EmojiEntry;
export type EntryContent = ChainEntry["content"];

export interface Chain {
  id: string;
  originPlayerId: string;
  entries: ChainEntry[];
}

export interface RoundSubmission {
  playerId: string;
  chainId: string;
  entryId: string;
}

export interface Round {
  number: number;
  expectedEntryType: PlayableEntryType;
  submissions: RoundSubmission[];
}

export interface Game {
  id: string;
  code: string;
  phase: GamePhase;
  createdAt: Date;
  hostPlayerId: string | null;
  players: Player[];
  chains: Chain[];
  currentRound: Round | null;
  rematchCode: string | null;
}

export interface SubmitEntryCommand {
  playerId: string;
  roundNumber: number;
  content: EntryContent;
  submittedAt?: Date;
}

export type GameRuleErrorCode =
  | "NOT_HOST"
  | "TOO_FEW_PLAYERS"
  | "GAME_ALREADY_STARTED"
  | "GAME_NOT_PLAYING"
  | "GAME_NOT_FINISHED"
  | "REMATCH_ALREADY_CREATED"
  | "PLAYER_NOT_FOUND"
  | "WRONG_ROUND"
  | "WRONG_ENTRY_TYPE"
  | "DUPLICATE_SUBMISSION"
  | "ROUND_INCOMPLETE"
  | "INVALID_ENTRY";

export class GameRuleError extends Error {
  constructor(
    public readonly code: GameRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GameRuleError";
  }
}

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidRoomCode(value: string): boolean {
  return new RegExp(`^[${ROOM_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(
    normalizeRoomCode(value),
  );
}

export function normalizePlayerName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validatePlayerName(value: string): string | null {
  const name = normalizePlayerName(value);
  if (name.length < 2) return "Tu nombre debe tener al menos 2 caracteres.";
  if (name.length > 24) return "Tu nombre puede tener hasta 24 caracteres.";
  return null;
}

export function generateRoomCode(random: () => number = Math.random): string {
  return Array.from({ length: ROOM_CODE_LENGTH }, () =>
    ROOM_ALPHABET.charAt(Math.floor(random() * ROOM_ALPHABET.length)),
  ).join("");
}

export function createLobbyGame(
  code: string,
  createdAt = new Date(),
  id = crypto.randomUUID(),
): Game {
  return {
    id,
    code: normalizeRoomCode(code),
    phase: "LOBBY",
    createdAt,
    hostPlayerId: null,
    players: [],
    chains: [],
    currentRound: null,
    rematchCode: null,
  };
}

export function addRematch(
  game: Game,
  requestedByPlayerId: string,
  rematchCode: string,
): Game {
  if (game.hostPlayerId !== requestedByPlayerId) {
    throw new GameRuleError("NOT_HOST", "Solo quien creó la sala puede crear otra partida.");
  }
  if (game.phase !== "REVEAL" && game.phase !== "FINISHED") {
    throw new GameRuleError(
      "GAME_NOT_FINISHED",
      "La nueva partida se puede crear cuando termina la actual.",
    );
  }
  if (game.rematchCode) {
    throw new GameRuleError("REMATCH_ALREADY_CREATED", "Ya se creó una nueva partida.");
  }
  if (!isValidRoomCode(rematchCode)) {
    throw new GameRuleError("INVALID_ENTRY", "El código de la nueva sala no es válido.");
  }
  return { ...game, rematchCode: normalizeRoomCode(rematchCode) };
}

export function expectedEntryTypeForRound(roundNumber: number): PlayableEntryType {
  return roundNumber % 2 === 0 ? "text" : "drawing";
}

export function createInitialChains(players: readonly Player[]): Chain[] {
  return players.map((player) => ({
    id: `chain:${player.id}`,
    originPlayerId: player.id,
    entries: [],
  }));
}

export function startGame(game: Game, requestedByPlayerId: string): Game {
  if (game.phase !== "LOBBY") {
    throw new GameRuleError("GAME_ALREADY_STARTED", "La partida ya comenzó.");
  }
  if (game.hostPlayerId !== requestedByPlayerId) {
    throw new GameRuleError("NOT_HOST", "Solo quien creó la sala puede comenzar.");
  }
  if (game.players.length < MINIMUM_PLAYER_COUNT) {
    throw new GameRuleError(
      "TOO_FEW_PLAYERS",
      `Se necesitan al menos ${MINIMUM_PLAYER_COUNT} jugadores.`,
    );
  }

  return {
    ...game,
    phase: "PLAYING",
    chains: createInitialChains(game.players),
    currentRound: {
      number: 0,
      expectedEntryType: expectedEntryTypeForRound(0),
      submissions: [],
    },
  };
}

/**
 * Players and chains use stable join order. In round r, player i receives
 * chain (i - r) mod N. Over N rounds every player visits every chain once,
 * and consecutive entries in a chain always come from different players.
 */
export function assignedChainForPlayer(
  game: Game,
  playerId: string,
  roundNumber: number,
): Chain {
  const playerIndex = game.players.findIndex((player) => player.id === playerId);
  if (playerIndex === -1) {
    throw new GameRuleError("PLAYER_NOT_FOUND", "El jugador no pertenece a la sala.");
  }
  if (game.chains.length !== game.players.length || game.chains.length === 0) {
    throw new GameRuleError("GAME_NOT_PLAYING", "La partida todavía no comenzó.");
  }

  const chainIndex =
    (playerIndex - (roundNumber % game.players.length) + game.players.length) %
    game.players.length;
  const chain = game.chains[chainIndex];
  if (!chain) {
    throw new GameRuleError("GAME_NOT_PLAYING", "No se encontró la cadena asignada.");
  }
  return chain;
}

export function previousEntryForPlayer(game: Game, playerId: string): ChainEntry | null {
  if (!game.currentRound || game.currentRound.number === 0) return null;
  const previousRoundNumber = game.currentRound.number - 1;
  const chain = assignedChainForPlayer(game, playerId, game.currentRound.number);
  return chain.entries.find((entry) => entry.roundNumber === previousRoundNumber) ?? null;
}

function normalizedEntryContent(content: EntryContent): EntryContent {
  switch (content.type) {
    case "text": {
      const text = content.text.trim();
      if (!text || text.length > 240) {
        throw new GameRuleError(
          "INVALID_ENTRY",
          "El texto debe tener entre 1 y 240 caracteres.",
        );
      }
      return { ...content, text };
    }
    case "drawing": {
      if (!content.asset.value.trim()) {
        throw new GameRuleError("INVALID_ENTRY", "El dibujo no puede estar vacío.");
      }
      return {
        ...content,
        asset: { ...content.asset, value: content.asset.value.trim() },
      };
    }
    case "audio":
      if (!content.storagePath.trim()) {
        throw new GameRuleError("INVALID_ENTRY", "El audio no puede estar vacío.");
      }
      return { ...content, storagePath: content.storagePath.trim() };
    case "emoji":
      if (!content.emoji.trim()) {
        throw new GameRuleError("INVALID_ENTRY", "El emoji no puede estar vacío.");
      }
      return { ...content, emoji: content.emoji.trim() };
  }
}

export function submitEntry(game: Game, command: SubmitEntryCommand): Game {
  if (game.phase !== "PLAYING" || !game.currentRound) {
    throw new GameRuleError("GAME_NOT_PLAYING", "La partida no está recibiendo respuestas.");
  }
  if (!game.players.some((player) => player.id === command.playerId)) {
    throw new GameRuleError("PLAYER_NOT_FOUND", "El jugador no pertenece a la sala.");
  }
  if (command.roundNumber !== game.currentRound.number) {
    throw new GameRuleError("WRONG_ROUND", "La ronda cambió. Actualizá la página.");
  }
  if (game.currentRound.submissions.some(({ playerId }) => playerId === command.playerId)) {
    throw new GameRuleError(
      "DUPLICATE_SUBMISSION",
      "Ya enviaste tu respuesta para esta ronda.",
    );
  }
  if (command.content.type !== game.currentRound.expectedEntryType) {
    throw new GameRuleError("WRONG_ENTRY_TYPE", "Ese tipo de respuesta no corresponde a esta ronda.");
  }

  const content = normalizedEntryContent(command.content);
  const assignedChain = assignedChainForPlayer(
    game,
    command.playerId,
    game.currentRound.number,
  );
  const entry = {
    id: `${assignedChain.id}:round:${game.currentRound.number}`,
    playerId: command.playerId,
    roundNumber: game.currentRound.number,
    createdAt: command.submittedAt ?? new Date(),
    content,
  } as ChainEntry;

  return {
    ...game,
    chains: game.chains.map((chain) =>
      chain.id === assignedChain.id
        ? { ...chain, entries: [...chain.entries, entry] }
        : chain,
    ),
    currentRound: {
      ...game.currentRound,
      submissions: [
        ...game.currentRound.submissions,
        { playerId: command.playerId, chainId: assignedChain.id, entryId: entry.id },
      ],
    },
  };
}

export function isCurrentRoundComplete(game: Game): boolean {
  return Boolean(
    game.currentRound &&
      game.currentRound.submissions.length === game.players.length,
  );
}

export function arePlayableRoundsComplete(game: Game): boolean {
  return Boolean(
    game.currentRound &&
      isCurrentRoundComplete(game) &&
      game.currentRound.number + 1 >= game.players.length,
  );
}

export function advanceRound(game: Game): Game {
  if (game.phase !== "PLAYING" || !game.currentRound) {
    throw new GameRuleError("GAME_NOT_PLAYING", "La partida no está en una ronda activa.");
  }
  if (!isCurrentRoundComplete(game)) {
    throw new GameRuleError("ROUND_INCOMPLETE", "Todavía faltan respuestas para avanzar.");
  }
  if (arePlayableRoundsComplete(game)) {
    return { ...game, phase: "REVEAL", currentRound: null };
  }

  const nextRoundNumber = game.currentRound.number + 1;
  return {
    ...game,
    currentRound: {
      number: nextRoundNumber,
      expectedEntryType: expectedEntryTypeForRound(nextRoundNumber),
      submissions: [],
    },
  };
}

export function submitEntryAndAdvance(game: Game, command: SubmitEntryCommand): Game {
  const updatedGame = submitEntry(game, command);
  return isCurrentRoundComplete(updatedGame) ? advanceRound(updatedGame) : updatedGame;
}

export function revealChains(game: Game): Chain[] {
  if (game.phase !== "REVEAL" && game.phase !== "FINISHED") {
    throw new GameRuleError("GAME_NOT_PLAYING", "La revelación todavía no está disponible.");
  }
  return game.chains.map((chain) => ({
    ...chain,
    entries: [...chain.entries].sort(
      (left, right) => left.roundNumber - right.roundNumber,
    ),
  }));
}
