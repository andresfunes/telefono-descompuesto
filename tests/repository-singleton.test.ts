import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseGameRepository } from "@/repositories/supabase-game-repository";

const globalRepository = globalThis as typeof globalThis & {
  gameRepository?: SupabaseGameRepository;
};

describe("game repository singleton", () => {
  afterEach(() => {
    delete globalRepository.gameRepository;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("shares the configured repository across separate module evaluations", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const firstModule = await import("@/repositories");
    vi.resetModules();
    const secondModule = await import("@/repositories");

    expect(secondModule.gameRepository).toBe(firstModule.gameRepository);
  });
});
