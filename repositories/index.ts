import { InMemoryGameRepository } from "./in-memory-game-repository";

const globalRepository = globalThis as typeof globalThis & {
  gameRepository?: InMemoryGameRepository;
};

export const gameRepository =
  globalRepository.gameRepository ?? new InMemoryGameRepository();

globalRepository.gameRepository = gameRepository;
