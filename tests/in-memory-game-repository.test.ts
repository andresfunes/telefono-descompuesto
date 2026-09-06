import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryGameRepository } from "@/repositories/in-memory-game-repository";
import { PlayerNameTakenError, RoomNotFoundError } from "@/repositories/game-repository";

describe("InMemoryGameRepository", () => {
  let repository: InMemoryGameRepository;

  beforeEach(() => {
    repository = new InMemoryGameRepository();
  });

  it("creates an empty lobby with a short room code", async () => {
    const game = await repository.createRoom();

    expect(game.code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(game.phase).toBe("LOBBY");
    expect(game.players).toEqual([]);
    await expect(repository.getRoom(game.code.toLowerCase())).resolves.toEqual(game);
  });

  it("joins a player to an existing room", async () => {
    const room = await repository.createRoom();
    const result = await repository.joinRoom(room.code.toLowerCase(), "  Ana  ");

    expect(result.player.name).toBe("Ana");
    expect(result.game.players).toHaveLength(1);
    expect(result.game.players[0]?.id).toBe(result.player.id);
    expect(result.game.hostPlayerId).toBe(result.player.id);
  });

  it("rejects unknown rooms and duplicate names", async () => {
    await expect(repository.joinRoom("ABCD", "Ana")).rejects.toBeInstanceOf(RoomNotFoundError);

    const room = await repository.createRoom();
    await repository.joinRoom(room.code, "Ana");
    await expect(repository.joinRoom(room.code, "ana")).rejects.toBeInstanceOf(PlayerNameTakenError);
  });

  it("starts and advances games through the authoritative repository", async () => {
    const room = await repository.createRoom();
    const ana = await repository.joinRoom(room.code, "Ana");
    const beto = await repository.joinRoom(room.code, "Beto");
    const started = await repository.startGame(room.code, ana.player.id);

    expect(started.currentRound?.number).toBe(0);
    const afterAna = await repository.submitEntry(room.code, {
      playerId: ana.player.id,
      roundNumber: 0,
      content: { type: "text", text: "Una frase" },
    });
    expect(afterAna.currentRound?.number).toBe(0);

    const afterBeto = await repository.submitEntry(room.code, {
      playerId: beto.player.id,
      roundNumber: 0,
      content: { type: "text", text: "Otra frase" },
    });
    expect(afterBeto.currentRound?.number).toBe(1);
  });
});
