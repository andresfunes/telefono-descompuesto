import { describe, expect, it } from "vitest";
import {
  advanceRound,
  assignedChainForPlayer,
  createLobbyGame,
  expectedEntryTypeForRound,
  GameRuleError,
  isCurrentRoundComplete,
  revealChains,
  startGame,
  submitEntry,
  submitEntryAndAdvance,
  type EntryContent,
  type Game,
  type Player,
} from "@/domain/game";

function players(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `Player ${index}`,
    joinedAt: new Date(index),
  }));
}

function lobby(playerCount: number): Game {
  const gamePlayers = players(playerCount);
  return {
    ...createLobbyGame("ABCD", new Date(0)),
    hostPlayerId: gamePlayers[0]?.id ?? null,
    players: gamePlayers,
  };
}

function contentForRound(roundNumber: number, playerId: string): EntryContent {
  return roundNumber % 2 === 0
    ? { type: "text", text: `text-${roundNumber}-${playerId}` }
    : {
        type: "drawing",
        data: `drawing-${roundNumber}-${playerId}`,
        format: "placeholder",
      };
}

function playCompleteGame(playerCount: number): Game {
  let game = startGame(lobby(playerCount), "p0");
  for (let roundNumber = 0; roundNumber < playerCount; roundNumber += 1) {
    for (const player of game.players) {
      game = submitEntryAndAdvance(game, {
        playerId: player.id,
        roundNumber,
        content: contentForRound(roundNumber, player.id),
        submittedAt: new Date(roundNumber * 100),
      });
    }
  }
  return game;
}

describe("game start", () => {
  it("creates one chain per player and starts the initial text round", () => {
    const game = startGame(lobby(3), "p0");

    expect(game.phase).toBe("PLAYING");
    expect(game.chains).toHaveLength(3);
    expect(game.chains.map((chain) => chain.originPlayerId)).toEqual(["p0", "p1", "p2"]);
    expect(game.currentRound).toMatchObject({ number: 0, expectedEntryType: "text" });
  });

  it("rejects too few players, non-hosts, and repeated starts", () => {
    expect(() => startGame(lobby(1), "p0")).toThrowError(
      expect.objectContaining({ code: "TOO_FEW_PLAYERS" }),
    );
    expect(() => startGame(lobby(2), "p1")).toThrowError(
      expect.objectContaining({ code: "NOT_HOST" }),
    );

    const started = startGame(lobby(2), "p0");
    expect(() => startGame(started, "p0")).toThrowError(
      expect.objectContaining({ code: "GAME_ALREADY_STARTED" }),
    );
  });
});

describe("round assignment rotation", () => {
  it.each([2, 3, 5])(
    "rotates %i players deterministically through every chain",
    (playerCount) => {
      let game = startGame(lobby(playerCount), "p0");
      const visitedChains = new Map(
        game.players.map((player) => [player.id, new Set<string>()]),
      );

      for (let roundNumber = 0; roundNumber < playerCount; roundNumber += 1) {
        for (const [playerIndex, player] of game.players.entries()) {
          const chain = assignedChainForPlayer(game, player.id, roundNumber);
          const expectedOriginIndex =
            (playerIndex - roundNumber + playerCount) % playerCount;
          expect(chain.originPlayerId).toBe(`p${expectedOriginIndex}`);
          expect(visitedChains.get(player.id)?.has(chain.id)).toBe(false);

          const previousEntry = chain.entries.at(-1);
          if (previousEntry) expect(previousEntry.playerId).not.toBe(player.id);
          visitedChains.get(player.id)?.add(chain.id);

          game = submitEntryAndAdvance(game, {
            playerId: player.id,
            roundNumber,
            content: contentForRound(roundNumber, player.id),
          });
        }
      }

      for (const visited of visitedChains.values()) expect(visited.size).toBe(playerCount);
      for (const chain of game.chains) {
        expect(chain.entries).toHaveLength(playerCount);
        expect(new Set(chain.entries.map((entry) => entry.playerId)).size).toBe(playerCount);
      }
    },
  );
});

describe("round lifecycle", () => {
  it("alternates text and drawing rounds", () => {
    expect(Array.from({ length: 6 }, (_, round) => expectedEntryTypeForRound(round))).toEqual([
      "text",
      "drawing",
      "text",
      "drawing",
      "text",
      "drawing",
    ]);
  });

  it("rejects duplicate submissions, wrong rounds, and wrong entry types", () => {
    const started = startGame(lobby(2), "p0");
    const afterFirst = submitEntry(started, {
      playerId: "p0",
      roundNumber: 0,
      content: { type: "text", text: "hola" },
    });

    expect(() =>
      submitEntry(afterFirst, {
        playerId: "p0",
        roundNumber: 0,
        content: { type: "text", text: "otra" },
      }),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_SUBMISSION" }));
    expect(() =>
      submitEntry(started, {
        playerId: "p1",
        roundNumber: 1,
        content: { type: "drawing", data: "dibujo", format: "placeholder" },
      }),
    ).toThrowError(expect.objectContaining({ code: "WRONG_ROUND" }));
    expect(() =>
      submitEntry(started, {
        playerId: "p1",
        roundNumber: 0,
        content: { type: "drawing", data: "dibujo", format: "placeholder" },
      }),
    ).toThrowError(expect.objectContaining({ code: "WRONG_ENTRY_TYPE" }));
  });

  it("advances only after every player submits", () => {
    let game = startGame(lobby(3), "p0");
    game = submitEntry(game, {
      playerId: "p0",
      roundNumber: 0,
      content: contentForRound(0, "p0"),
    });

    expect(isCurrentRoundComplete(game)).toBe(false);
    expect(() => advanceRound(game)).toThrowError(
      expect.objectContaining({ code: "ROUND_INCOMPLETE" }),
    );

    for (const playerId of ["p1", "p2"]) {
      game = submitEntry(game, {
        playerId,
        roundNumber: 0,
        content: contentForRound(0, playerId),
      });
    }
    expect(isCurrentRoundComplete(game)).toBe(true);
    expect(advanceRound(game).currentRound?.number).toBe(1);
  });

  it("transitions to reveal after one round per player", () => {
    const game = playCompleteGame(4);

    expect(game.phase).toBe("REVEAL");
    expect(game.currentRound).toBeNull();
    expect(game.chains.every((chain) => chain.entries.length === 4)).toBe(true);
  });

  it("returns reveal entries in chronological round order", () => {
    const game = playCompleteGame(3);
    const shuffled: Game = {
      ...game,
      chains: game.chains.map((chain) => ({ ...chain, entries: [...chain.entries].reverse() })),
    };

    const revealed = revealChains(shuffled);
    for (const chain of revealed) {
      expect(chain.entries.map((entry) => entry.roundNumber)).toEqual([0, 1, 2]);
    }
  });

  it("uses typed rule errors", () => {
    expect(() => advanceRound(lobby(2))).toThrow(GameRuleError);
  });
});
