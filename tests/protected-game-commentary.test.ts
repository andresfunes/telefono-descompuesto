import { describe, expect, it, vi } from "vitest";
import type { Game } from "@/domain/game";
import type { GameCommentaryItem } from "@/domain/game-commentary";
import { generateProtectedGameCommentary } from "@/lib/ai/protected-game-commentary";
import type {
  AiGenerationReservation,
  AiRateLimitInput,
  AiRateLimitResult,
  CompleteGameCommentaryInput,
  GameCommentaryStore,
  StoredGameCommentary,
} from "@/repositories/game-commentary-store";

function completeGame(overrides: Partial<Game> = {}): Game {
  const players = [
    { id: "p1", name: "Ana", joinedAt: new Date("2026-01-01T00:00:00Z") },
    { id: "p2", name: "Beto", joinedAt: new Date("2026-01-01T00:00:01Z") },
  ];
  const entry = (chain: string, playerId: string, roundNumber: number) => ({
    id: `${chain}-${roundNumber}`,
    playerId,
    roundNumber,
    createdAt: new Date(`2026-01-01T00:0${roundNumber + 1}:00Z`),
    content: { type: "text" as const, text: "Una prueba" },
  });
  return {
    id: "20000000-0000-0000-0000-000000000001",
    code: "ABCD",
    phase: "REVEAL",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    hostPlayerId: "p1",
    players,
    chains: [
      { id: "c1", originPlayerId: "p1", entries: [entry("c1", "p1", 0), entry("c1", "p2", 1)] },
      { id: "c2", originPlayerId: "p2", entries: [entry("c2", "p2", 0), entry("c2", "p1", 1)] },
    ],
    currentRound: null,
    rematchCode: null,
    ...overrides,
  };
}

const comments: GameCommentaryItem[] = [{
  text: "Beto tomó una decisión creativa.",
  entryIds: ["c1-1"],
  playerIds: ["p2"],
}];

class FakeStore implements GameCommentaryStore {
  stored: StoredGameCommentary | null = null;
  reservation: "idle" | "processing" | "completed" = "idle";
  rateResult: AiRateLimitResult = { status: "allowed" };
  reservationResult?: AiGenerationReservation;
  rateCalls: AiRateLimitInput[] = [];

  async getByRoomCode(): Promise<StoredGameCommentary | null> {
    return this.stored;
  }

  async recordRateLimitedAttempt(input: AiRateLimitInput): Promise<AiRateLimitResult> {
    this.rateCalls.push(input);
    return this.rateResult;
  }

  async reserveGeneration(): Promise<AiGenerationReservation> {
    if (this.reservationResult) return this.reservationResult;
    if (this.stored || this.reservation === "completed") return { status: "reused" };
    if (this.reservation === "processing") return { status: "in_progress" };
    this.reservation = "processing";
    return { status: "allowed", reservationToken: "reservation" };
  }

  async completeGeneration(input: CompleteGameCommentaryInput): Promise<StoredGameCommentary> {
    this.stored = {
      comments: input.comments.map(({ text }) => text),
      intensity: input.intensity,
      generatedAt: new Date("2026-01-01T00:10:00Z"),
    };
    this.reservation = "completed";
    return this.stored;
  }

  async failGeneration(): Promise<void> {
    this.reservation = "idle";
  }
}

const config = {
  enabled: true,
  turnstileSecretKey: "secret",
  userPerHour: 10,
  ipPerHour: 20,
  gameTotal: 5,
  dailyGlobalLimit: 1_000,
};

function run(
  store: FakeStore,
  overrides: Partial<Parameters<typeof generateProtectedGameCommentary>[0]> = {},
  dependencyOverrides: Partial<Parameters<typeof generateProtectedGameCommentary>[1]> = {},
) {
  return generateProtectedGameCommentary(
    {
      game: completeGame(),
      playerId: "p1",
      authUserId: "auth-1",
      ipHash: "a".repeat(64),
      remoteIp: "203.0.113.4",
      turnstileToken: "valid",
      intensity: "STANDARD",
      config,
      ...overrides,
    },
    {
      store,
      verifyTurnstile: vi.fn().mockResolvedValue(true),
      generate: vi.fn().mockResolvedValue(comments),
      ...dependencyOverrides,
    },
  );
}

describe("protected game commentary", () => {
  it.each([
    ["a non-member", { playerId: "missing" }],
    ["a game outside reveal", { game: completeGame({ phase: "PLAYING", currentRound: { number: 0, expectedEntryType: "text", submissions: [] } }) }],
    ["an incomplete game", { game: completeGame({ chains: completeGame().chains.slice(0, 1) }) }],
  ])("rejects %s before protection providers", async (_label, overrides) => {
    const store = new FakeStore();
    const verifyTurnstile = vi.fn();
    const generate = vi.fn();
    await expect(run(store, overrides, { verifyTurnstile, generate })).resolves.toMatchObject({
      status: "unavailable",
      reason: "unauthorized",
    });
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("requires successful Turnstile validation before reserving generation", async () => {
    const store = new FakeStore();
    const generate = vi.fn();
    await expect(run(store, {}, {
      verifyTurnstile: vi.fn().mockResolvedValue(false),
      generate,
    })).resolves.toMatchObject({ reason: "turnstile_failed" });
    expect(store.reservation).toBe("idle");
    expect(generate).not.toHaveBeenCalled();
  });

  it("enforces user, IP and game rate-limit decisions", async () => {
    for (const dimension of ["user", "ip", "game"] as const) {
      const store = new FakeStore();
      store.rateResult = { status: "rate_limited", dimension };
      const generate = vi.fn();
      await expect(run(store, {}, { generate })).resolves.toMatchObject({
        reason: "rate_limited",
      });
      expect(generate).not.toHaveBeenCalled();
    }
  });

  it("does not call OpenAI when the daily cap is reached", async () => {
    const store = new FakeStore();
    store.reservationResult = { status: "daily_cap" };
    const generate = vi.fn();
    await expect(run(store, {}, { generate })).resolves.toMatchObject({
      reason: "daily_cap",
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("prevents OpenAI calls when the kill switch is disabled", async () => {
    const store = new FakeStore();
    const verifyTurnstile = vi.fn();
    const generate = vi.fn();
    await expect(run(store, { config: { ...config, enabled: false } }, {
      verifyTurnstile,
      generate,
    })).resolves.toMatchObject({ reason: "disabled" });
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("generates once and reuses the persisted result", async () => {
    const store = new FakeStore();
    const generate = vi.fn().mockResolvedValue(comments);
    await expect(run(store, {}, { generate })).resolves.toMatchObject({ status: "generated" });
    await expect(run(store, {}, { generate })).resolves.toMatchObject({ status: "reused" });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("allows at most one OpenAI call across concurrent requests", async () => {
    const store = new FakeStore();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const generate = vi.fn().mockImplementation(async () => {
      await gate;
      return comments;
    });
    const first = run(store, {}, { generate });
    await vi.waitFor(() => expect(store.reservation).toBe("processing"));
    const second = await run(store, {}, { generate });
    expect(second).toMatchObject({ reason: "in_progress" });
    release();
    await expect(first).resolves.toMatchObject({ status: "generated" });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("keeps reveal-safe behavior when OpenAI fails", async () => {
    const store = new FakeStore();
    await expect(run(store, {}, {
      generate: vi.fn().mockRejectedValue(new Error("OpenAI timeout")),
    })).resolves.toMatchObject({ reason: "generation_failed" });
    expect(store.reservation).toBe("idle");
  });
});
