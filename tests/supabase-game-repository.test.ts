import { InMemoryGameRepository } from "@/repositories/in-memory-game-repository";
import { setRevealStep } from "@/domain/reveal";
import { describe, expect, it } from "vitest";
import {
  removePlayerFromGame,
  setRoundLimit,
  type RoundLimit,
  removePlayerFromLobby,
  type EntryContent,
  type Game,
} from "@/domain/game";
import {
  JoinChallengeRequiredError,
  PlayerNameTakenError,
} from "@/repositories/game-repository";
import {
  deserializeGameSnapshot,
  SupabaseGameRepository,
  serializeEntries,
  type GameSnapshotGateway,
  type JoinGameGatewayResult,
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
      rematch_code: game.rematchCode,
      reveal_step: game.revealStep ?? null,
      round_limit: game.roundLimit ?? null,
      lobby_locked: game.lobbyLocked,
      lobby_expires_at: game.lobbyExpiresAt.toISOString(),
    },
    players: game.players.map((player, joinOrder) => ({
      id: player.id,
      auth_user_id: identities.get(player.id),
      name: player.name,
      join_order: joinOrder,
      joined_at: player.joinedAt.toISOString(),
      is_active: player.active,
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
  private readonly snapshots = new Map<string, ReturnType<typeof snapshotFromGame>>();
  private readonly identities = new Map<string, string>();
  private transientLoadFailures = 0;
  loadCalls = 0;
  successfulCommits = 0;
  nextJoinResult?: JoinGameGatewayResult;

  failNextLoads(count = 1) {
    this.transientLoadFailures = count;
  }

  async createGameWithHost(
    code: string,
    authUserId: string,
    playerName: string,
  ): Promise<void> {
    const now = new Date(0);
    const roomNumber = this.snapshots.size + 1;
    const playerId = roomNumber === 1 ? "player-host" : `player-host-${roomNumber}`;
    const game: Game = {
      id: `game-${roomNumber}`,
      code,
      phase: "LOBBY",
      createdAt: now,
      hostPlayerId: playerId,
      players: [{ id: playerId, name: playerName, joinedAt: now, active: true }],
      chains: [],
      currentRound: null,
      rematchCode: null,
      lobbyLocked: false,
      lobbyExpiresAt: new Date("2100-01-01T00:00:00Z"),
    };
    this.identities.set(playerId, authUserId);
    this.snapshots.set(code, snapshotFromGame(game, 0, this.identities));
  }

  async createRematch(
    sourceCode: string,
    authUserId: string,
    newCode: string,
  ): Promise<string> {
    const source = this.snapshots.get(sourceCode);
    if (!source) throw { message: "ROOM_NOT_FOUND" };
    const host = source.players.find((player) => player.id === source.game.host_player_id);
    if (host?.auth_user_id !== authUserId) throw { message: "NOT_HOST" };
    if (source.game.phase !== "REVEAL" && source.game.phase !== "FINISHED") {
      throw { message: "GAME_NOT_FINISHED" };
    }
    if (source.game.rematch_code) return source.game.rematch_code;

    await this.createGameWithHost(newCode, authUserId, host.name);
    this.snapshots.get(newCode)!.game.round_limit = source.game.round_limit;
    source.game.rematch_code = newCode;
    source.game.version += 1;
    return newCode;
  }

  async joinGame(
    code: string,
    authUserId: string,
    playerName: string,
  ): Promise<JoinGameGatewayResult> {
    if (this.nextJoinResult) {
      const result = this.nextJoinResult;
      this.nextJoinResult = undefined;
      return result;
    }
    const snapshot = this.snapshots.get(code);
    if (!snapshot) {
      return "unavailable";
    }
    const existing = snapshot.players.find(
      (player) => player.auth_user_id === authUserId,
    );
    if (existing?.is_active) return "joined";
    if (existing) return "unavailable";
    if (snapshot.game.phase !== "LOBBY") return "unavailable";
    if (
      snapshot.players.some(
        (player) => player.name.toLocaleLowerCase() === playerName.toLocaleLowerCase(),
      )
    ) {
      return "name_taken";
    }

    const player: TestPlayer = {
      id: `player-${snapshot.players.length}`,
      authUserId,
      name: playerName,
      joinedAt: new Date(snapshot.players.length).toISOString(),
    };
    this.identities.set(player.id, player.authUserId);
    snapshot.players.push({
      id: player.id,
      auth_user_id: player.authUserId,
      name: player.name,
      join_order: snapshot.players.length,
      joined_at: player.joinedAt,
      is_active: true,
    });
    snapshot.game.version += 1;
    return "joined";
  }

  async loadGame(code: string): Promise<unknown | null> {
    this.loadCalls += 1;
    if (this.transientLoadFailures > 0) {
      this.transientLoadFailures -= 1;
      throw new Error("Gateway Timeout");
    }
    const snapshot = this.snapshots.get(code);
    return snapshot ? structuredClone(snapshot) : null;
  }

  async loadGameForUser(code: string, authUserId: string): Promise<unknown | null> {
    this.loadCalls += 1;
    const snapshot = this.snapshots.get(code);
    if (!snapshot?.players.some(
      (player) => player.auth_user_id === authUserId && player.is_active,
    )) return null;
    return structuredClone(snapshot);
  }

  async setLobbyLocked(code: string, authUserId: string, locked: boolean): Promise<void> {
    const snapshot = this.snapshots.get(code);
    const host = snapshot?.players.find((player) => player.id === snapshot.game.host_player_id);
    if (!snapshot || host?.auth_user_id !== authUserId) throw new Error("NOT_HOST");
    snapshot.game.lobby_locked = locked;
    snapshot.game.version += 1;
  }

  async removePlayer(code: string, authUserId: string, playerId: string): Promise<void> {
    const snapshot = this.snapshots.get(code);
    const host = snapshot?.players.find((player) => player.id === snapshot.game.host_player_id);
    if (!snapshot || host?.auth_user_id !== authUserId) throw new Error("NOT_HOST");
    const loaded = deserializeGameSnapshot(snapshot);
    const hostPlayerId = loaded.game.hostPlayerId;
    if (!hostPlayerId) throw new Error("HOST_NOT_FOUND");
    const updated = loaded.game.phase === "PLAYING"
      ? removePlayerFromGame(loaded.game, hostPlayerId, playerId)
      : removePlayerFromLobby(loaded.game, hostPlayerId, playerId);
    this.snapshots.set(
      code,
      snapshotFromGame(updated, loaded.version + 1, this.identities),
    );
  }

  async setRoundLimit(code: string, authUserId: string, roundLimit: RoundLimit): Promise<void> {
    const snapshot = this.snapshots.get(code);
    const host = snapshot?.players.find((p) => p.id === snapshot.game.host_player_id);
    if (!snapshot || host?.auth_user_id !== authUserId) throw new Error("NOT_HOST");
    const loaded = deserializeGameSnapshot(snapshot);
    const updated = setRoundLimit(loaded.game, host.id, roundLimit);
    this.snapshots.set(code, snapshotFromGame(updated, loaded.version + 1, this.identities));
  }

  async setRevealStep(code: string, authUserId: string, expectedStep: number | null, step: number): Promise<boolean> {
    const snapshot = this.snapshots.get(code);
    const host = snapshot?.players.find((p) => p.id === snapshot.game.host_player_id);
    if (!snapshot || host?.auth_user_id !== authUserId) throw new Error("NOT_HOST");
    if (snapshot.game.reveal_step !== expectedStep) return false;
    const loaded = deserializeGameSnapshot(snapshot);
    const updated = setRevealStep(loaded.game, host.id, expectedStep, step);
    this.snapshots.set(code, snapshotFromGame(updated, loaded.version + 1, this.identities));
    return true;
  }

  async commitGame(input: PersistedGameCommit): Promise<boolean> {
    await Promise.resolve();
    const snapshot = this.snapshots.get(input.game.code);
    if (!snapshot || snapshot.game.version !== input.expectedVersion) {
      return false;
    }
    const nextVersion = input.expectedVersion + 1;
    this.snapshots.set(
      input.game.code,
      snapshotFromGame(input.game, nextVersion, this.identities),
    );
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
  it("loads a room and its membership from one snapshot", async () => {
    const gateway = new FakeSnapshotGateway();
    const repository = new SupabaseGameRepository(gateway);
    const created = await repository.createRoom("Ana", "auth-ana");
    const callsBeforeSession = gateway.loadCalls;

    await expect(
      repository.getRoomSession(created.game.code, "auth-ana"),
    ).resolves.toEqual({ game: created.game, player: created.player });
    expect(gateway.loadCalls - callsBeforeSession).toBe(1);
  });

  it("retries a transient timeout while loading a snapshot", async () => {
    const gateway = new FakeSnapshotGateway();
    const repository = new SupabaseGameRepository(gateway);
    const created = await repository.createRoom("Ana", "auth-ana");
    const callsBeforeLoad = gateway.loadCalls;
    gateway.failNextLoads();

    await expect(repository.getRoom(created.game.code)).resolves.toEqual(created.game);
    expect(gateway.loadCalls - callsBeforeLoad).toBe(2);
  });

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

  it("surfaces an adaptive join challenge without loading room data", async () => {
    const gateway = new FakeSnapshotGateway();
    const repository = new SupabaseGameRepository(gateway);
    const created = await repository.createRoom("Ana", "auth-ana");
    gateway.nextJoinResult = "challenge_required";

    await expect(
      repository.joinRoom(created.game.code, "Beto", "auth-beto", {
        ipHash: "unavailable",
        challengeVerified: false,
      }),
    ).rejects.toBeInstanceOf(JoinChallengeRequiredError);
  });

  it("persists host lobby moderation", async () => {
    const gateway = new FakeSnapshotGateway();
    const repository = new SupabaseGameRepository(gateway);
    const host = await repository.createRoom("Ana", "auth-ana");
    const guest = await repository.joinRoom(host.game.code, "Beto", "auth-beto");

    await expect(
      repository.setLobbyLocked(host.game.code, host.player.id, "auth-ana", true),
    ).resolves.toMatchObject({ lobbyLocked: true });
    await expect(
      repository.removePlayer(
        host.game.code,
        host.player.id,
        "auth-ana",
        guest.player.id,
      ),
    ).resolves.toMatchObject({ players: [{ name: "Ana" }] });
  });

  it("persists in-game removal while preserving the original chain slots", async () => {
    const gateway = new FakeSnapshotGateway();
    const repository = new SupabaseGameRepository(gateway);
    const host = await repository.createRoom("Ana", "auth-ana");
    const absent = await repository.joinRoom(host.game.code, "Beto", "auth-beto");
    const guest = await repository.joinRoom(host.game.code, "Cami", "auth-cami");
    await repository.startGame(host.game.code, host.player.id, "auth-ana");
    await repository.submitEntry(
      host.game.code,
      { playerId: host.player.id, roundNumber: 0, content: text(host.player.id, 0) },
      "auth-ana",
    );

    const removed = await repository.removePlayer(
      host.game.code,
      host.player.id,
      "auth-ana",
      absent.player.id,
    );
    const reloaded = await new SupabaseGameRepository(gateway).getRoom(host.game.code);

    expect(removed.players.find((player) => player.id === absent.player.id)?.active).toBe(false);
    expect(reloaded?.players).toHaveLength(3);
    expect(reloaded?.chains).toHaveLength(3);
    expect(reloaded?.currentRound?.number).toBe(0);
    await expect(
      repository.getPlayerForUser(host.game.code, "auth-beto"),
    ).resolves.toBeNull();

    const advanced = await repository.submitEntry(
      host.game.code,
      { playerId: guest.player.id, roundNumber: 0, content: text(guest.player.id, 0) },
      "auth-cami",
    );
    expect(advanced.currentRound?.number).toBe(1);
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

  it("creates one rematch for the host and persists its invitation", async () => {
    const gateway = new FakeSnapshotGateway();
    const repository = new SupabaseGameRepository(gateway);
    const ana = await repository.createRoom("Ana", "auth-ana");
    const beto = await repository.joinRoom(ana.game.code, "Beto", "auth-beto");
    await repository.startGame(ana.game.code, ana.player.id, "auth-ana");

    await expect(
      repository.createRematch(ana.game.code, beto.player.id, "auth-beto"),
    ).rejects.toMatchObject({ code: "NOT_HOST" });

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

    const rematch = await repository.createRematch(
      ana.game.code,
      ana.player.id,
      "auth-ana",
    );
    const source = await repository.getRoom(ana.game.code);

    expect(rematch.game).toMatchObject({ phase: "LOBBY", rematchCode: null });
    expect(rematch.player.name).toBe("Ana");
    expect(source?.rematchCode).toBe(rematch.game.code);
  });
});


describe.each(["memory", "supabase"])("%s synchronized reveal", (adapter) => {
  it("persists the host cursor, rejects impersonation and stale requests, and resumes for guests", async () => {
    const repository = adapter === "memory" ? new InMemoryGameRepository() :
      new SupabaseGameRepository(new FakeSnapshotGateway());
    const { game, player: host } = await repository.createRoom("Host", "host-user");
    const { player: guest } = await repository.joinRoom(game.code, "Guest", "guest-user");
    await repository.startGame(game.code, host.id, "host-user");
    for (const [player, user] of [[host, "host-user"], [guest, "guest-user"]] as const) {
      await repository.submitEntry(game.code, { playerId: player.id, roundNumber: 0,
        content: { type: "text", text: "Una jirafa en bicicleta" } }, user);
    }
    for (const [player, user] of [[host, "host-user"], [guest, "guest-user"]] as const) {
      await repository.submitEntry(game.code, { playerId: player.id, roundNumber: 1,
        content: { type: "drawing", asset: { kind: "storage-path", value: "games/test/drawing.png", mimeType: "image/png" } } }, user);
    }
    expect((await repository.getRoom(game.code))?.revealStep).toBe(-1);
    await expect(repository.setRevealStep(game.code, guest.id, "guest-user", -1, 0)).rejects.toThrow();
    await expect(repository.setRevealStep(game.code, host.id, "guest-user", -1, 0)).rejects.toThrow();
    await repository.setRevealStep(game.code, host.id, "host-user", -1, 0);
    await expect(repository.setRevealStep(game.code, host.id, "host-user", -1, 1)).rejects.toThrow();
    expect((await repository.getRoomSession(game.code, "guest-user"))?.game.revealStep).toBe(0);
    await repository.setRevealStep(game.code, host.id, "host-user", 0, 4);
    expect((await repository.getRoom(game.code))?.revealStep).toBe(4);
  });
});


describe.each(["memory", "supabase"])("%s game duration", (adapter) => {
  it("saves the host selection, finishes early, and preserves the limit in a rematch", async () => {
    const repository = adapter === "memory" ? new InMemoryGameRepository() :
      new SupabaseGameRepository(new FakeSnapshotGateway());
    const { game, player: host } = await repository.createRoom("Host", "host-user");
    const participants = [{ player: host, user: "host-user" }];
    for (let i = 1; i < 8; i += 1) {
      const { player } = await repository.joinRoom(game.code, `Guest ${i}`, `user-${i}`);
      participants.push({ player, user: `user-${i}` });
    }
    await expect(repository.setRoundLimit(game.code, participants[1].player.id, "user-1", 4)).rejects.toThrow();
    await expect(repository.setRoundLimit(game.code, host.id, "user-1", 4)).rejects.toThrow();
    await repository.setRoundLimit(game.code, host.id, "host-user", 4);
    expect((await repository.getRoomSession(game.code, "user-1"))?.game.roundLimit).toBe(4);
    await repository.startGame(game.code, host.id, "host-user");
    await expect(repository.setRoundLimit(game.code, host.id, "host-user", 6)).rejects.toThrow();
    for (let round = 0; round < 4; round += 1) {
      for (const { player, user } of participants) {
        await repository.submitEntry(game.code, { playerId: player.id, roundNumber: round,
          content: round % 2 === 0 ? { type: "text", text: "Una jirafa" } :
            { type: "drawing", asset: { kind: "storage-path", value: `games/test/${player.id}-${round}.png`, mimeType: "image/png" } },
        }, user);
      }
    }
    const finished = await repository.getRoom(game.code);
    expect(finished?.phase).toBe("REVEAL");
    expect(finished?.chains.every((chain) => chain.entries.length === 4)).toBe(true);
    const rematch = await repository.createRematch(game.code, host.id, "host-user");
    expect(rematch.game.roundLimit).toBe(4);
  });
});
