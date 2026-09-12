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

export interface AiRateLimitInput {
  gameId: string;
  authUserId: string;
  ipHash: string;
  userPerHour: number;
  ipPerHour: number;
  gameTotal: number;
}

export type AiRateLimitResult =
  | { status: "allowed" }
  | { status: "rate_limited"; dimension: "user" | "ip" | "game" };

export type AiGenerationReservation =
  | { status: "allowed"; reservationToken: string }
  | { status: "reused" }
  | { status: "in_progress" }
  | { status: "daily_cap" };

export interface CompleteGameCommentaryInput extends SaveGameCommentaryInput {
  reservationToken: string;
}

export interface GameCommentaryStore {
  getByRoomCode(code: string): Promise<StoredGameCommentary | null>;
  recordRateLimitedAttempt(input: AiRateLimitInput): Promise<AiRateLimitResult>;
  reserveGeneration(input: {
    gameId: string;
    authUserId: string;
    dailyLimit: number;
  }): Promise<AiGenerationReservation>;
  completeGeneration(input: CompleteGameCommentaryInput): Promise<StoredGameCommentary>;
  failGeneration(input: {
    gameId: string;
    reservationToken: string;
  }): Promise<void>;
}
