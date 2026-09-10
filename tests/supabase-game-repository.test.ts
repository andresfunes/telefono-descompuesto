import { describe, expect, it } from "vitest";
import type { EntryContent, Game } from "@/domain/game";
import { PlayerNameTakenError } from "@/repositories/game-repository";
import {
  SupabaseGameRepository,
  serializeEntries,
  type GameSnapshotGateway,
  type PersistedGameCommit,
} from "@/repositories/supabase-game-repository";

interface TestPlayer {
  id: string;
  authUserId: string;
  name: string;
  joinedAt: string;
}

function snapshotFromGame(
  game: Game,
  version: number,
  identities: ReadonlyMap<string, string>,
) {
  return {
    game: {
      id: game.id,
      code: game.code,
      phase: game.phase,
      host_player_id: game.hostPlayerId,
      current_round: game.currentRound?.number ?? null,
      current_entry_type: game.currentRound?.expectedEntryType ?? null,
      version,
      created_at: game.createdAt.toISOString(),
    },
    players: game.players.map((player, joinOrder) => ({
      id: player.id,
      auth_user_id: identities.get(player.id),
      name: player.name,
      join_order: joinOrder,
      joined_at: player.joinedAt.toISOString(),
    })),
    chains: game.chains.map((chain, position) => ({
      id: chain.id,
      origin_player_id: chain.originPlayerId,
      position,
    })),
    entries: serializeEntries(game.chains),
  };
}

class FakeSnapshotGateway implements GameSnapshotGateway {
  private snapshot: ReturnType<typeof snapshotFromGame> | null = null;
  private readonly identities = new Map<string, string>();
  successfulCommits = 0;

  async createGameWithHost(
    code: string,
    authUserId: string,
    playerName: string,
  ): Promise<void> {
    const now = new Date(0);
    const playerId = "player-host";
    const game: Game = {
      id: "game-1",
      code,
      phase: "LOBBY",
      createdAt: now,
      hostPlayerId: playerId,
      players: [{ id: playerId, name: playerName, joinedAt: now }],
      chains: [],
      currentRound: null,
    };
    this.identities.set(playerId, authUserId);
    this.snapshot = snapshotFromGame(game, 0, this.identities);
  }

  async joinGame(
    code: string,
    authUserId: string,
    playerName: string,
  ): Promise<void> {
    if (!this.snapshot || this.snapshot.game.code !== code) {
      throw { message: "ROOM_NOT_FOUND" };
    }
    const existing = this.snapshot.players.find(
      (player) => player.auth_user_id === authUserId,
    );
    if (existing) return;
    if (this.snapshot.game.phase !== "LOBBY") throw { message: "GAME_ALREADY_STARTED" };
    if (
      this.snapshot.players.some(
        (player) => player.name.toLocaleLowerCase() === playerName.toLocaleLowerCase(),
      )
    ) {
      throw { message: "PLAYER_NAME_TAKEN" };
    }

    const player: TestPlayer = {
      id: `player-${this.snapshot.players.length}`,
      authUserId,
      name: playerName,
      joinedAt: new Date(this.snapshot.players.length).toISOString(),
    };
    this.identities.set(player.id, player.authUserId);
    this.snapshot.players.push({
      id: player.id,
      auth_user_id: player.authUserId,
      name: player.name,
      join_order: this.snapshot.players.length,
      joined_at: player.joinedAt,
    });
    this.snapshot.game.version += 1;
  }

  async loadGame(code: string): Promise<unknown | null> {
    if (!this.snapshot || this.snapshot.game.code !== code) return null;
    return structuredClone(this.snapshot);
  }

  async commitGame(input: PersistedGameCommit): Promise<boolean> {
    await Promise.resolve();
    if (!this.snapshot || this.snapshot.game.version !== input.expectedVersion) {
      return false;
    }
    const nextVersion = input.expectedVersion + 1;
    this.snapshot = snapshotFromGame(input.game, nextVersion, this.identities);
    this.successfulCommits += 1;
    return true;
  }
}

function text(playerId: string, roundNumber: number): EntryContent {
  return { type: "text", text: `texto-${roundNumber}-${playerId}` };
}

function drawing(playerId: string, roundNumber: number): EntryContent {
  return {
    type: "drawing",
    asset: {
      kind: "storage-path",
      value: `games/game-1/rounds/${roundNumber}/players/${playerId}/asset.png`,
      mimeType: "image/png",
    },
  };
}

describe("SupabaseGameRepository", () => {
  it("persists creator membership, host identity, joins, and reload reconstruction", async () => {
    const gateway = new FakeSnapshotGateway();
    const repository = new SupabaseGameRepository(gateway);
    const created = await repository.createRoom("Ana", "auth-ana");
    const joined = await repository.joinRoom(created.game.code, "Beto", "auth-beto");
    const reloaded = new SupabaseGameRepository(gateway);

    expect(created.game.hostPlayerId).toBe(created.player.id);
    expect(joined.game.players.map((player) => player.name)).toEqual(["Ana", "Beto"]);
    await expect(
      reloaded.getPlayerForUser(created.game.code, "auth-ana"),
    ).resolves.toEqual(created.player);
    await expect(reloaded.getRoom(created.game.code)).resolves.toMatchObject({
      id: "game-1",
      hostPlayerId: created.player.id,
      players: [{ name: "Ana" }, { name: "Beto" }],
    });
  });

  it("rejects duplicate display names for different authenticated identities", async () => {
    const gateway = new FakeSnapshotGateway();
    const repository = new SupabaseGameRepository(gateway);
    const created = await repository.createRoom("Ana", "auth-ana");

    await expect(
      repository.joinRoom(created.game.code, "ana", "auth-other"),
    ).rejects.toBeInstanceOf(PlayerNameTakenError);
  });

  it("retries concurrent submissions and advances a round exactly once", async () => {
    const gateway = new FakeSnapshotGateway();
    const repository = new SupabaseGameRepository(gateway);
    const ana = await repository.createRoom("Ana", "auth-ana");
    const beto = await repository.joinRoom(ana.game.code, "Beto", "auth-beto");
    await repository.startGame(ana.game.code, ana.player.id, "auth-ana");

    await Promise.all([
      repository.submitEntry(
        ana.game.code,
        { playerId: ana.player.id, roundNumber: 0, content: text(ana.player.id, 0) },
        "auth-ana",
      ),
      repository.submitEntry(
        ana.game.code,
        { playerId: beto.player.id, roundNumber: 0, content: text(beto.player.id, 0) },
        "auth-beto",
      ),
    ]);

    const game = await repository.getRoom(ana.game.code);
    expect(game?.currentRound).toMatchObject({ number: 1, submissions: [] });
    expect(game?.chains.flatMap((chain) => chain.entries)).toHaveLength(2);
    expect(gateway.successfulCommits).toBe(3);
  });

  it("persists drawing entries and the reveal transition across repository reloads", async () => {
    const gateway = new FakeSnapshotGateway();
    const repository = new SupabaseGameRepository(gateway);
    const ana = await repository.createRoom("Ana", "auth-ana");
    const beto = await repository.joinRoom(ana.game.code, "Beto", "auth-beto");
    await repository.startGame(ana.game.code, ana.player.id, "auth-ana");

    for (const [player, auth] of [
      [ana.player, "auth-ana"],
      [beto.player, "auth-beto"],
    ] as const) {
      await repository.submitEntry(
        ana.game.code,
        { playerId: player.id, roundNumber: 0, content: text(player.id, 0) },
        auth,
      );
    }
    for (const [player, auth] of [
      [ana.player, "auth-ana"],
      [beto.player, "auth-beto"],
    ] as const) {
      await repository.submitEntry(
        ana.game.code,
        { playerId: player.id, roundNumber: 1, content: drawing(player.id, 1) },
        auth,
      );
    }

    const reloaded = await new SupabaseGameRepository(gateway).getRoom(ana.game.code);
    expect(reloaded?.phase).toBe("REVEAL");
    expect(reloaded?.currentRound).toBeNull();
    expect(
      reloaded?.chains.flatMap((chain) => chain.entries).filter(
        (entry) => entry.content.type === "drawing",
      ),
    ).toHaveLength(2);
  });

  it("rejects an authenticated user attempting to submit for another player", async () => {
    const gateway = new FakeSnapshotGateway();
    const repository = new SupabaseGameRepository(gateway);
    const ana = await repository.createRoom("Ana", "auth-ana");
    const beto = await repository.joinRoom(ana.game.code, "Beto", "auth-beto");
    await repository.startGame(ana.game.code, ana.player.id, "auth-ana");

    await expect(
      repository.submitEntry(
        ana.game.code,
        { playerId: beto.player.id, roundNumber: 0, content: text(beto.player.id, 0) },
        "auth-ana",
      ),
    ).rejects.toMatchObject({ name: "UnauthorizedGameActionError" });
  });
});
