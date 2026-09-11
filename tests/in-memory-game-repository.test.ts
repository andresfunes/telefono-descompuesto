import { beforeEach, describe, expect, it } from "vitest";
import { GameRuleError } from "@/domain/game";
import { InMemoryGameRepository } from "@/repositories/in-memory-game-repository";
import { PlayerNameTakenError, RoomNotFoundError } from "@/repositories/game-repository";

describe("InMemoryGameRepository", () => {
  let repository: InMemoryGameRepository;

  beforeEach(() => {
    repository = new InMemoryGameRepository();
  });

  it("creates an empty lobby with a short room code", async () => {
    const { game, player } = await repository.createRoom("Ana", "auth-ana");

    expect(game.code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(game.phase).toBe("LOBBY");
    expect(game.players).toEqual([player]);
    expect(game.hostPlayerId).toBe(player.id);
    await expect(repository.getRoom(game.code.toLowerCase())).resolves.toEqual(game);
  });

  it("joins a player to an existing room", async () => {
    const { game: room, player: host } = await repository.createRoom("Host", "auth-host");
    const result = await repository.joinRoom(room.code.toLowerCase(), "  Ana  ", "auth-ana");

    expect(result.player.name).toBe("Ana");
    expect(result.game.players).toHaveLength(2);
    expect(result.game.hostPlayerId).toBe(host.id);
    await expect(repository.getPlayerForUser(room.code, "auth-ana")).resolves.toEqual(
      result.player,
    );
  });

  it("rejects unknown rooms and duplicate names", async () => {
    await expect(repository.joinRoom("ABCD", "Ana", "auth-ana")).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );

    const { game: room } = await repository.createRoom("Host", "auth-host");
    await repository.joinRoom(room.code, "Ana", "auth-ana");
    await expect(repository.joinRoom(room.code, "ana", "auth-other")).rejects.toBeInstanceOf(
      PlayerNameTakenError,
    );
  });

  it("rejects starting an authoritative game with only the host", async () => {
    const { game, player } = await repository.createRoom("Ana", "auth-ana");

    await expect(repository.startGame(game.code, player.id, "auth-ana")).rejects.toMatchObject({
      name: GameRuleError.name,
      code: "TOO_FEW_PLAYERS",
    });
  });

  it("starts with two players and advances through the authoritative repository", async () => {
    const ana = await repository.createRoom("Ana", "auth-ana");
    const room = ana.game;
    const beto = await repository.joinRoom(room.code, "Beto", "auth-beto");
    const started = await repository.startGame(room.code, ana.player.id, "auth-ana");

    expect(started.currentRound?.number).toBe(0);
    const afterAna = await repository.submitEntry(
      room.code,
      {
        playerId: ana.player.id,
        roundNumber: 0,
        content: { type: "text", text: "Una frase" },
      },
      "auth-ana",
    );
    expect(afterAna.currentRound?.number).toBe(0);

    const afterBeto = await repository.submitEntry(
      room.code,
      {
        playerId: beto.player.id,
        roundNumber: 0,
        content: { type: "text", text: "Otra frase" },
      },
      "auth-beto",
    );
    expect(afterBeto.currentRound?.number).toBe(1);
  });

  it("keeps membership on reload and rejects acting as another player", async () => {
    const ana = await repository.createRoom("Ana", "auth-ana");
    const beto = await repository.joinRoom(ana.game.code, "Beto", "auth-beto");

    await expect(repository.getPlayerForUser(ana.game.code, "auth-ana")).resolves.toEqual(
      ana.player,
    );
    await expect(
      repository.startGame(ana.game.code, ana.player.id, "auth-beto"),
    ).rejects.toMatchObject({ name: "UnauthorizedGameActionError" });
    expect(beto.game.hostPlayerId).toBe(ana.player.id);
  });

  it("creates a new lobby for the host after reveal", async () => {
    const ana = await repository.createRoom("Ana", "auth-ana");
    const beto = await repository.joinRoom(ana.game.code, "Beto", "auth-beto");
    await repository.startGame(ana.game.code, ana.player.id, "auth-ana");

    for (const [player, auth] of [
      [ana.player, "auth-ana"],
      [beto.player, "auth-beto"],
    ] as const) {
      await repository.submitEntry(
        ana.game.code,
        { playerId: player.id, roundNumber: 0, content: { type: "text", text: "Frase" } },
        auth,
      );
    }
    for (const [player, auth] of [
      [ana.player, "auth-ana"],
      [beto.player, "auth-beto"],
    ] as const) {
      await repository.submitEntry(
        ana.game.code,
        {
          playerId: player.id,
          roundNumber: 1,
          content: {
            type: "drawing",
            asset: { kind: "inline-data-url", value: "drawing", mimeType: "image/png" },
          },
        },
        auth,
      );
    }

    const created = await repository.createRematch(
      ana.game.code,
      ana.player.id,
      "auth-ana",
    );
    const source = await repository.getRoom(ana.game.code);

    expect(created.game).toMatchObject({ phase: "LOBBY", rematchCode: null });
    expect(created.player.name).toBe("Ana");
    expect(source?.rematchCode).toBe(created.game.code);
  });
});
