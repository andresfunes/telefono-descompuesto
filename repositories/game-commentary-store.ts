import type { GameCommentaryItem, HumorIntensity } from "@/domain/game-commentary";

export interface StoredGameCommentary {
  comments: string[];
  intensity: HumorIntensity;
  generatedAt: Date;
}

export interface SaveGameCommentaryInput {
  gameId: string;
  authUserId: string;
  comments: readonly GameCommentaryItem[];
  intensity: HumorIntensity;
}

export interface GameCommentaryStore {
  getByRoomCode(code: string): Promise<StoredGameCommentary | null>;
  save(input: SaveGameCommentaryInput): Promise<StoredGameCommentary>;
}
