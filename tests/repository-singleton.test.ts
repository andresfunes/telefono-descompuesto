import { afterEach, describe, expect, it, vi } from "vitest";
import type { InMemoryGameRepository } from "@/repositories/in-memory-game-repository";

const globalRepository = globalThis as typeof globalThis & {
  gameRepository?: InMemoryGameRepository;
};

describe("game repository singleton", () => {
  afterEach(() => {
    delete globalRepository.gameRepository;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("shares rooms across separate module evaluations in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const firstModule = await import("@/repositories");
    const room = await firstModule.gameRepository.createRoom();

    vi.resetModules();
    const secondModule = await import("@/repositories");

    await expect(secondModule.gameRepository.getRoom(room.code)).resolves.toEqual(room);
  });
});
