import { commentaryEligibility } from "@/domain/game-commentary";
import { describe, expect, it } from "vitest";
import {
  addRematch,
  setRoundLimit,
  totalGameRounds,
  type RoundLimit,
  advanceRound,
  assignedChainForPlayer,
  createLobbyGame,
  expectedEntryTypeForRound,
  GameRuleError,
  generateRoomCode,
  groupPlayersByRoundStatus,
  isLobbyExpired,
  isCurrentRoundComplete,
  MAXIMUM_PLAYER_COUNT,
  removePlayerFromGame,
  removePlayerFromLobby,
  revealChains,
  startGame,
  setLobbyLocked,
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
    active: true,
  }));
}

function lobby(playerCount: number): Game {
  const gamePlayers = players(playerCount);
  return {
    ...createLobbyGame("ABCD", new Date(0)),
    lobbyExpiresAt: new Date("2100-01-01T00:00:00Z"),
    hostPlayerId: gamePlayers[0]?.id ?? null,
    players: gamePlayers,
  };
}

function contentForRound(roundNumber: number, playerId: string): EntryContent {
  return roundNumber % 2 === 0
    ? { type: "text", text: `text-${roundNumber}-${playerId}` }
    : {
        type: "drawing",
        asset: {
          kind: "inline-data-url",
          value: `drawing-${roundNumber}-${playerId}`,
          mimeType: "image/png",
        },
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
  it("generates six-character room codes", () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it("creates one chain per player and starts the initial text round", () => {
    const game = startGame(lobby(3), "p0");

    expect(game.phase).toBe("PLAYING");
    expect(game.chains).toHaveLength(3);
    expect(game.chains.map((chain) => chain.originPlayerId)).toEqual(["p0", "p1", "p2"]);
    expect(game.currentRound).toMatchObject({ number: 0, expectedEntryType: "text" });
  });

  it("rejects starting with one player", () => {
    expect(() => startGame(lobby(1), "p0")).toThrowError(
      expect.objectContaining({ code: "TOO_FEW_PLAYERS" }),
    );
  });

  it("starts successfully with two players", () => {
    const started = startGame(lobby(2), "p0");

    expect(started.phase).toBe("PLAYING");
    expect(started.chains).toHaveLength(2);
    expect(started.currentRound).toMatchObject({ number: 0, expectedEntryType: "text" });
  });

  it("rejects non-hosts and repeated starts", () => {
    expect(() => startGame(lobby(2), "p1")).toThrowError(
      expect.objectContaining({ code: "NOT_HOST" }),
    );

    const started = startGame(lobby(2), "p0");
    expect(() => startGame(started, "p0")).toThrowError(
      expect.objectContaining({ code: "GAME_ALREADY_STARTED" }),
    );
  });

  it("rejects expired and oversized lobbies", () => {
    const expired = { ...lobby(2), lobbyExpiresAt: new Date(0) };
    expect(isLobbyExpired(expired, new Date(1))).toBe(true);
    expect(() => startGame(expired, "p0", new Date(1))).toThrowError(
      expect.objectContaining({ code: "LOBBY_EXPIRED" }),
    );
    expect(() => startGame(lobby(MAXIMUM_PLAYER_COUNT + 1), "p0")).toThrowError(
      expect.objectContaining({ code: "TOO_MANY_PLAYERS" }),
    );
  });
});

describe("lobby moderation", () => {
  it("lets only the host lock the room and remove another player", () => {
    const game = lobby(3);
    const locked = setLobbyLocked(game, "p0", true);
    expect(locked.lobbyLocked).toBe(true);
    expect(() => setLobbyLocked(game, "p1", true)).toThrowError(
      expect.objectContaining({ code: "NOT_HOST" }),
    );

    const moderated = removePlayerFromLobby(game, "p0", "p2");
    expect(moderated.players.map((player) => player.id)).toEqual(["p0", "p1"]);
    expect(() => removePlayerFromLobby(game, "p0", "p0")).toThrowError(
      expect.objectContaining({ code: "NOT_HOST" }),
    );
  });
});

describe("in-game moderation", () => {
  it("expels a pending player and advances without changing chain rotation", () => {
    let game = startGame(lobby(3), "p0");
    game = submitEntry(game, {
      playerId: "p0",
      roundNumber: 0,
      content: contentForRound(0, "p0"),
    });
    game = removePlayerFromGame(game, "p0", "p1");

    expect(game.currentRound?.number).toBe(0);
    expect(game.players.find((player) => player.id === "p1")?.active).toBe(false);
    expect(groupPlayersByRoundStatus(game).pending.map((player) => player.id)).toEqual(["p2"]);
    expect(() =>
      submitEntry(game, {
        playerId: "p1",
        roundNumber: 0,
        content: contentForRound(0, "p1"),
      }),
    ).toThrowError(expect.objectContaining({ code: "PLAYER_NOT_FOUND" }));

    game = submitEntryAndAdvance(game, {
      playerId: "p2",
      roundNumber: 0,
      content: contentForRound(0, "p2"),
    });
    expect(game.currentRound?.number).toBe(1);
    expect(assignedChainForPlayer(game, "p2", 1).originPlayerId).toBe("p1");
    expect(game.chains).toHaveLength(3);

    for (let roundNumber = 1; roundNumber < 3; roundNumber += 1) {
      for (const playerId of ["p0", "p2"]) {
        game = submitEntryAndAdvance(game, {
          playerId,
          roundNumber,
          content: contentForRound(roundNumber, playerId),
        });
      }
    }
    expect(game.phase).toBe("REVEAL");
    expect(game.currentRound).toBeNull();
    expect(game.chains).toHaveLength(3);
  });

  it("advances immediately when the absent player was the last pending player", () => {
    let game = startGame(lobby(2), "p0");
    game = submitEntry(game, {
      playerId: "p0",
      roundNumber: 0,
      content: contentForRound(0, "p0"),
    });

    game = removePlayerFromGame(game, "p0", "p1");

    expect(game.currentRound?.number).toBe(1);
    expect(game.currentRound?.submissions).toEqual([]);
  });

  it("allows only the host to expel an active, pending non-host player", () => {
    const game = startGame(lobby(3), "p0");
    expect(() => removePlayerFromGame(game, "p1", "p2")).toThrowError(
      expect.objectContaining({ code: "NOT_HOST" }),
    );
    expect(() => removePlayerFromGame(game, "p0", "p0")).toThrowError(
      expect.objectContaining({ code: "NOT_HOST" }),
    );

    const submitted = submitEntry(game, {
      playerId: "p2",
      roundNumber: 0,
      content: contentForRound(0, "p2"),
    });
    expect(() => removePlayerFromGame(submitted, "p0", "p2")).toThrowError(
      expect.objectContaining({ code: "PLAYER_ALREADY_SUBMITTED" }),
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
        content: {
          type: "drawing",
          asset: { kind: "inline-data-url", value: "dibujo", mimeType: "image/png" },
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "WRONG_ROUND" }));
    expect(() =>
      submitEntry(started, {
        playerId: "p1",
        roundNumber: 0,
        content: {
          type: "drawing",
          asset: { kind: "inline-data-url", value: "dibujo", mimeType: "image/png" },
        },
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

  it("groups pending and completed players in stable join order", () => {
    let game = startGame(lobby(4), "p0");
    for (const playerId of ["p2", "p0"]) {
      game = submitEntry(game, {
        playerId,
        roundNumber: 0,
        content: contentForRound(0, playerId),
      });
    }

    const groups = groupPlayersByRoundStatus(game);

    expect(groups.pending.map((player) => player.id)).toEqual(["p1", "p3"]);
    expect(groups.completed.map((player) => player.id)).toEqual(["p0", "p2"]);
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

describe("rematches", () => {
  it("lets only the host attach a new room after reveal", () => {
    const revealed = playCompleteGame(2);
    const updated = addRematch(revealed, "p0", "EFGH");

    expect(updated.rematchCode).toBe("EFGH");
    expect(() => addRematch(revealed, "p1", "EFGH")).toThrowError(
      expect.objectContaining({ code: "NOT_HOST" }),
    );
    expect(() => addRematch(lobby(2), "p0", "EFGH")).toThrowError(
      expect.objectContaining({ code: "GAME_NOT_FINISHED" }),
    );
  });

  it("prevents attaching more than one new room", () => {
    const revealed = addRematch(playCompleteGame(2), "p0", "EFGH");

    expect(() => addRematch(revealed, "p0", "JKLM")).toThrowError(
      expect.objectContaining({ code: "REMATCH_ALREADY_CREATED" }),
    );
  });
});


describe("configurable game duration", () => {
  it.each([
    [12, null, 12], [8, 4, 4], [12, 6, 6], [3, 6, 3], [2, 4, 2], [4, 4, 4],
  ] as [number, RoundLimit, number][])("%i players with limit %s play %i rounds", (count, limit, rounds) => {
    let game = startGame(setRoundLimit(lobby(count), "p0", limit), "p0");
    expect(totalGameRounds(game)).toBe(rounds);
    for (let round = 0; round < rounds; round += 1) {
      expect(game.phase).toBe("PLAYING");
      for (const player of game.players) {
        game = submitEntryAndAdvance(game, {
          playerId: player.id, roundNumber: round, content: contentForRound(round, player.id),
        });
      }
    }
    expect(game.phase).toBe("REVEAL");
    expect(game.revealStep).toBe(-1);
    expect(game.chains).toHaveLength(count);
    for (const chain of game.chains) {
      expect(chain.entries).toHaveLength(rounds);
      expect(new Set(chain.entries.map((entry) => entry.playerId)).size).toBe(rounds);
    }
    expect(commentaryEligibility(game, "p0")).toBeNull();
    const incomplete = structuredClone(game);
    incomplete.chains[0].entries.pop();
    expect(commentaryEligibility(incomplete, "p0")).toBe("INCOMPLETE_GAME");
  });

  it("enforces host, lobby, expiration and permitted limits", () => {
    expect(() => setRoundLimit(lobby(8), "p1", 4)).toThrow();
    expect(() => setRoundLimit(startGame(lobby(8), "p0"), "p0", 4)).toThrow();
    expect(() => setRoundLimit({ ...lobby(8), lobbyExpiresAt: new Date(0) }, "p0", 4)).toThrow();
    expect(() => setRoundLimit(lobby(8), "p0", 5 as RoundLimit)).toThrow();
    expect(setRoundLimit(setRoundLimit(lobby(8), "p0", 4), "p0", null).roundLimit).toBeNull();
    expect(totalGameRounds(lobby(8))).toBe(8);
  });

  it("finishes at the selected limit when the host removes the final pending player", () => {
    let game = startGame(setRoundLimit(lobby(8), "p0", 4), "p0");
    for (let round = 0; round < 4; round += 1) {
      for (const player of game.players.filter((p) => round < 3 || p.id !== "p7")) {
        game = submitEntryAndAdvance(game, { playerId: player.id, roundNumber: round,
          content: contentForRound(round, player.id) });
      }
    }
    expect(game.phase).toBe("PLAYING");
    game = removePlayerFromGame(game, "p0", "p7");
    expect(game.phase).toBe("REVEAL");
    expect(totalGameRounds(game)).toBe(4);
  });
});
