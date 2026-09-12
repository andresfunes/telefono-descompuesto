import "server-only";

import type { Game } from "@/domain/game";
import {
  commentaryEligibility,
  type GameCommentaryItem,
  type HumorIntensity,
} from "@/domain/game-commentary";
import type {
  GameCommentaryStore,
  StoredGameCommentary,
} from "@/repositories/game-commentary-store";
import type { CommentaryProtectionConfig } from "./commentary-protection-config";
import { logAiGeneration } from "./generation-log";

export const COMMENTARY_UNAVAILABLE_MESSAGE =
  "Los comentarios automáticos no están disponibles en este momento.";

export type ProtectedCommentaryResult =
  | { status: "generated"; commentary: StoredGameCommentary }
  | { status: "reused"; commentary: StoredGameCommentary }
  | {
      status: "unavailable";
      reason:
        | "unauthorized"
        | "disabled"
        | "rate_limited"
        | "turnstile_failed"
        | "in_progress"
        | "daily_cap"
        | "generation_failed";
    };

export interface ProtectedCommentaryDependencies {
  store: GameCommentaryStore;
  verifyTurnstile(token: string, remoteIp: string | null): Promise<boolean>;
  generate(
    game: Game,
    intensity: HumorIntensity,
  ): Promise<readonly GameCommentaryItem[]>;
}

export async function generateProtectedGameCommentary(
  input: {
    game: Game;
    playerId: string;
    authUserId: string;
    ipHash: string;
    remoteIp: string | null;
    turnstileToken: string;
    intensity: HumorIntensity;
    config: CommentaryProtectionConfig;
  },
  dependencies: ProtectedCommentaryDependencies,
): Promise<ProtectedCommentaryResult> {
  const { game, config } = input;
  const logContext = { gameId: game.id, chainIds: game.chains.map(({ id }) => id) };

  if (commentaryEligibility(game, input.playerId)) {
    return { status: "unavailable", reason: "unauthorized" };
  }

  const existing = await dependencies.store.getByRoomCode(game.code);
  if (existing) {
    logAiGeneration("ai_generation_reused", logContext);
    return { status: "reused", commentary: existing };
  }

  if (!config.enabled || !config.turnstileSecretKey) {
    logAiGeneration("ai_generation_disabled", logContext);
    return { status: "unavailable", reason: "disabled" };
  }

  const rateLimit = await dependencies.store.recordRateLimitedAttempt({
    gameId: game.id,
    authUserId: input.authUserId,
    ipHash: input.ipHash,
    userPerHour: config.userPerHour,
    ipPerHour: config.ipPerHour,
    gameTotal: config.gameTotal,
  });
  if (rateLimit.status === "rate_limited") {
    logAiGeneration("ai_generation_rate_limited", {
      ...logContext,
      reason: rateLimit.dimension,
    });
    return { status: "unavailable", reason: "rate_limited" };
  }

  if (!(await dependencies.verifyTurnstile(input.turnstileToken, input.remoteIp))) {
    logAiGeneration("ai_generation_turnstile_failed", logContext);
    return { status: "unavailable", reason: "turnstile_failed" };
  }

  const reservation = await dependencies.store.reserveGeneration({
    gameId: game.id,
    authUserId: input.authUserId,
    dailyLimit: config.dailyGlobalLimit,
  });
  if (reservation.status === "reused") {
    const reused = await dependencies.store.getByRoomCode(game.code);
    if (reused) {
      logAiGeneration("ai_generation_reused", logContext);
      return { status: "reused", commentary: reused };
    }
    return { status: "unavailable", reason: "in_progress" };
  }
  if (reservation.status === "in_progress") {
    logAiGeneration("ai_generation_reused", { ...logContext, reason: "in_progress" });
    return { status: "unavailable", reason: "in_progress" };
  }
  if (reservation.status === "daily_cap") {
    logAiGeneration("ai_generation_daily_cap_reached", logContext);
    return { status: "unavailable", reason: "daily_cap" };
  }

  logAiGeneration("ai_generation_allowed", logContext);
  let comments: readonly GameCommentaryItem[];
  try {
    comments = await dependencies.generate(game, input.intensity);
  } catch (error) {
    await dependencies.store.failGeneration({
      gameId: game.id,
      reservationToken: reservation.reservationToken,
    });
    logAiGeneration("ai_generation_openai_failed", {
      ...logContext,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return { status: "unavailable", reason: "generation_failed" };
  }

  try {
    const commentary = await dependencies.store.completeGeneration({
      gameId: game.id,
      authUserId: input.authUserId,
      reservationToken: reservation.reservationToken,
      comments,
      intensity: input.intensity,
    });
    logAiGeneration("ai_generation_succeeded", logContext);
    return { status: "generated", commentary };
  } catch (error) {
    logAiGeneration("ai_generation_openai_failed", {
      ...logContext,
      reason: error instanceof Error ? `persistence:${error.name}` : "persistence",
    });
    return { status: "unavailable", reason: "generation_failed" };
  }
}
